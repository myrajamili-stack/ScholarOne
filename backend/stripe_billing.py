"""Stripe test-mode recurring billing and transactionally verified entitlements."""
from contextlib import contextmanager
from datetime import datetime, timezone
from db import get_db_connection
from decimal import Decimal
import os
from urllib.parse import urlparse

import stripe


class BillingConfigurationError(ValueError):
    pass


@contextmanager
def billing_connection():
    connection = get_db_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def stripe_client():
    key = os.getenv('STRIPE_SECRET_KEY', '')
    if not key.startswith('sk_test_'):
        raise BillingConfigurationError('Stripe test mode is not configured. Add STRIPE_SECRET_KEY to the backend environment.')
    return stripe.StripeClient(key, stripe_version='2025-06-30.basil', max_network_retries=2,
                               http_client=stripe.RequestsClient(timeout=20))


def billing_ready():
    return bool(os.getenv('STRIPE_SECRET_KEY', '').startswith('sk_test_')
                and os.getenv('STRIPE_WEBHOOK_SECRET', '').startswith('whsec_'))


def frontend_url():
    value = os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    parsed = urlparse(value)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment:
        raise BillingConfigurationError('Set FRONTEND_URL to the frontend application origin.')
    return value


def stripe_dict(value):
    return value.to_dict() if isinstance(value, stripe.StripeObject) else value


def timestamp(value):
    return datetime.fromtimestamp(value, timezone.utc) if value else None


def object_id(value):
    return value.get('id') if hasattr(value, 'get') else value


def invoice_subscription(invoice):
    return object_id(invoice.get('subscription') or
                     ((invoice.get('parent') or {}).get('subscription_details') or {}).get('subscription'))


def sync_plan_price(cursor, client, plan):
    """Immutable monthly prices preserve existing subscribers when catalogue prices change."""
    amount = Decimal(str(plan['price']))
    if not amount.is_finite() or amount <= 0 or amount != amount.quantize(Decimal('.01')):
        raise ValueError('This plan requires a valid positive MYR price.')
    if plan['duration_month'] != 1:
        raise ValueError('Stripe plans must have a monthly duration. Ask an administrator to configure this plan.')
    product_id = plan.get('stripe_product_id')
    if not product_id:
        product = client.v1.products.create({'name': f"ScholarOne {plan['plan_name']}",
                                            'metadata': {'plan_id': str(plan['plan_id'])}},
                                           options={'idempotency_key': f"scholarone-product-{plan['plan_id']}"})
        product_id = product.id
    cents = int(amount * 100)
    if plan.get('stripe_price_id'):
        existing = stripe_dict(client.v1.prices.retrieve(plan['stripe_price_id']))
        recurring = existing.get('recurring') or {}
        if (existing.get('active') and existing.get('unit_amount') == cents
                and existing.get('currency') == 'myr' and recurring.get('interval') == 'month'
                and recurring.get('interval_count') == 1):
            return product_id, existing['id']
    price = client.v1.prices.create({
        'product': product_id, 'currency': 'myr', 'unit_amount': cents,
        'recurring': {'interval': 'month'}, 'metadata': {'plan_id': str(plan['plan_id'])},
    }, options={'idempotency_key': f"scholarone-monthly-{plan['plan_id']}-{cents}"})
    cursor.execute('UPDATE subscription_plan SET stripe_product_id=%s, stripe_price_id=%s WHERE plan_id=%s',
                   (product_id, price.id, plan['plan_id']))
    return product_id, price.id


def save_invoice(cursor, invoice, sponsor_id, subscription_id, plan_name):
    # Invoice snapshots contain billing metadata and Stripe-hosted links, never card numbers.
    cursor.execute('''
        INSERT INTO subscription_payment
            (sponsor_id, subscription_id, stripe_invoice_id, stripe_payment_intent_id,
             invoice_number, plan_name, amount, currency, payment_status, invoice_url,
             invoice_pdf, created_at, paid_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (stripe_invoice_id) DO UPDATE SET
            payment_status=excluded.payment_status, amount=excluded.amount,
            invoice_url=excluded.invoice_url, invoice_pdf=excluded.invoice_pdf,
            paid_at=excluded.paid_at, stripe_payment_intent_id=excluded.stripe_payment_intent_id
    ''', (sponsor_id, subscription_id, invoice['id'], object_id(invoice.get('payment_intent')),
          invoice.get('number'), plan_name,
          Decimal(invoice.get('amount_paid', 0) if invoice.get('status') == 'paid' else invoice.get('amount_due', 0)) / 100,
          invoice.get('currency', 'myr'), 'failed' if invoice.get('status') == 'open' and invoice.get('attempt_count', 0) > 0 else invoice.get('status', 'open'),
          invoice.get('hosted_invoice_url'), invoice.get('invoice_pdf'), timestamp(invoice['created']),
          timestamp((invoice.get('status_transitions') or {}).get('paid_at'))))


def sync_subscription(cursor, client, subscription_id, event_invoice_id=None):
    """Serialize by provider and fetch canonical Stripe state to tolerate reordered events."""
    initial = stripe_dict(client.v1.subscriptions.retrieve(subscription_id))
    customer_id = object_id(initial.get('customer'))
    cursor.execute('''SELECT s.sponsor_id, u.status AS account_status FROM sponsor s
        JOIN app_user u ON u.user_id=s.sponsor_id WHERE s.stripe_customer_id=%s FOR UPDATE OF s''', (customer_id,))
    sponsor = cursor.fetchone()
    if not sponsor:
        raise ValueError('The Stripe customer is not linked to a provider.')
    sub = stripe_dict(client.v1.subscriptions.retrieve(subscription_id, {'expand': ['latest_invoice']}))
    if sub.get('livemode'):
        raise ValueError('Live subscriptions are disabled for this demonstration.')
    items = sub.get('items', {}).get('data', [])
    if len(items) != 1 or items[0].get('quantity', 1) != 1:
        raise ValueError('Expected one monthly subscription item.')
    item = items[0]
    price = item['price']
    if price.get('currency') != 'myr' or price.get('recurring', {}).get('interval') != 'month' or price.get('recurring', {}).get('interval_count', 1) != 1:
        raise ValueError('Expected a monthly MYR subscription.')
    plan_id = (price.get('metadata') or {}).get('plan_id')
    cursor.execute('SELECT plan_id, plan_name FROM subscription_plan WHERE plan_id=%s', (int(plan_id),))
    plan = cursor.fetchone()
    if not plan:
        raise ValueError('Unknown subscription plan.')
    latest_invoice = sub.get('latest_invoice')
    if isinstance(latest_invoice, str):
        latest_invoice = stripe_dict(client.v1.invoices.retrieve(latest_invoice))
    payment_status = (latest_invoice or {}).get('status', 'unpaid')
    entitled = sub['status'] == 'active' and payment_status == 'paid' and sponsor['account_status'] == 'active'
    start = timestamp(item.get('current_period_start') or sub.get('current_period_start'))
    end = timestamp(item.get('current_period_end') or sub.get('current_period_end'))
    if not start or not end:
        raise ValueError('Subscription billing dates are missing.')
    # A provider can have one entitled subscription even if an old event is replayed.
    cursor.execute('''SELECT stripe_subscription_id FROM subscription WHERE sponsor_id=%s
        AND stripe_subscription_id IS NOT NULL AND stripe_subscription_id<>%s
        ORDER BY subscription_id DESC LIMIT 1''', (sponsor['sponsor_id'], subscription_id))
    other = cursor.fetchone()
    if other and entitled:
        other_sub = client.v1.subscriptions.retrieve(other['stripe_subscription_id'])
        if other_sub['status'] not in ('canceled', 'incomplete_expired'):
            raise ValueError('Provider already has another Stripe subscription.')
    if entitled:
        cursor.execute("UPDATE subscription SET subscription_status='inactive' WHERE sponsor_id=%s AND stripe_subscription_id IS DISTINCT FROM %s",
                       (sponsor['sponsor_id'], subscription_id))
    cursor.execute('''INSERT INTO subscription
        (sponsor_id, plan_id, start_date, end_date, subscription_status, stripe_subscription_id,
         stripe_price_id, stripe_status, payment_status, cancel_at_period_end, billing_amount, billing_currency, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'myr',now())
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET plan_id=excluded.plan_id,
            start_date=excluded.start_date, end_date=excluded.end_date,
            subscription_status=excluded.subscription_status, stripe_price_id=excluded.stripe_price_id,
            stripe_status=excluded.stripe_status, payment_status=excluded.payment_status,
            cancel_at_period_end=excluded.cancel_at_period_end, billing_amount=excluded.billing_amount, updated_at=now()
        RETURNING subscription_id
    ''', (sponsor['sponsor_id'], plan['plan_id'], start.replace(tzinfo=None), end.replace(tzinfo=None),
          'active' if entitled else 'inactive', sub['id'], price['id'], sub['status'], payment_status,
          sub.get('cancel_at_period_end', False), Decimal(price['unit_amount']) / 100))
    local_id = cursor.fetchone()['subscription_id']
    cursor.execute("""UPDATE sponsor SET subscription_status=coalesce((
        SELECT lower(sp.plan_name) FROM subscription active_sub
        JOIN subscription_plan sp ON sp.plan_id=active_sub.plan_id
        WHERE active_sub.sponsor_id=%s AND active_sub.subscription_status='active'
            AND active_sub.end_date > (now() AT TIME ZONE 'UTC')
        ORDER BY active_sub.subscription_id DESC LIMIT 1), 'free') WHERE sponsor_id=%s""",
        (sponsor['sponsor_id'], sponsor['sponsor_id']))
    if latest_invoice:
        save_invoice(cursor, latest_invoice, sponsor['sponsor_id'], local_id, plan['plan_name'])
    if event_invoice_id and (not latest_invoice or event_invoice_id != latest_invoice['id']):
        invoice = stripe_dict(client.v1.invoices.retrieve(event_invoice_id))
        if invoice_subscription(invoice) != subscription_id:
            raise ValueError('Invoice belongs to another subscription.')
        save_invoice(cursor, invoice, sponsor['sponsor_id'], local_id, plan['plan_name'])
    return sub
