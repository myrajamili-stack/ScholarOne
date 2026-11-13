"""Provider Checkout/Portal endpoints and signature-verified Stripe events."""
import os

from flask import Blueprint, current_app, jsonify, request
import stripe

from responses import error_response
from security import sponsor_access_required
from stripe_billing import (BillingConfigurationError, billing_connection, billing_ready, frontend_url, invoice_subscription,
                            object_id, stripe_client, stripe_dict, sync_plan_price, sync_subscription)

billing_bp = Blueprint('billing', __name__, url_prefix='/api')


def billing_error(error):
    current_app.logger.exception('Stripe billing request failed')
    if isinstance(error, BillingConfigurationError):
        return error_response(str(error), 503)
    if (isinstance(error, stripe.InvalidRequestError)
            and 'must set an account or business name' in str(error)):
        return error_response(
            'Stripe Checkout requires an account or business name. '
            'Open your Stripe sandbox account settings, save the business name, then retry checkout.', 503)
    if isinstance(error, ValueError):
        return error_response(str(error), 400)
    return error_response('Unable to complete the billing request. Please try again.', 502)


@billing_bp.route('/sponsors/<int:sponsor_id>/billing', methods=['GET'])
@sponsor_access_required
def get_billing(sponsor_id):
    try:
        with billing_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute('''SELECT sub.subscription_id, sub.plan_id, sp.plan_name,
                    sub.stripe_subscription_id, sub.stripe_status, sub.payment_status,
                    sub.cancel_at_period_end, sub.start_date, sub.end_date, sub.billing_amount,
                    sub.subscription_status, sub.billing_currency
                    FROM subscription sub JOIN subscription_plan sp ON sp.plan_id=sub.plan_id
                    WHERE sub.sponsor_id=%s AND sub.stripe_subscription_id IS NOT NULL
                    ORDER BY sub.subscription_id DESC LIMIT 1''', (sponsor_id,))
                subscription = cursor.fetchone()
                cursor.execute('''SELECT payment_id, invoice_number, plan_name, amount, currency,
                    payment_status, invoice_url, invoice_pdf, created_at, paid_at
                    FROM subscription_payment WHERE sponsor_id=%s ORDER BY created_at DESC LIMIT 100''', (sponsor_id,))
                payments = cursor.fetchall()
                cursor.execute('SELECT stripe_customer_id FROM sponsor WHERE sponsor_id=%s', (sponsor_id,))
                customer = cursor.fetchone()
        if subscription:
            for field in ('start_date', 'end_date'):
                if subscription[field]:
                    subscription[field] = subscription[field].isoformat() + 'Z'
        return jsonify({'enabled': billing_ready(), 'test_mode': True,
                        'portal_available': bool(customer and customer['stripe_customer_id']),
                        'subscription': subscription, 'payments': payments})
    except Exception:
        current_app.logger.exception('Unable to load billing records')
        return error_response('Unable to load billing records. Check that the Stripe Billing migration has been applied.', 503)


@billing_bp.route('/sponsors/<int:sponsor_id>/billing/checkout', methods=['POST'])
@sponsor_access_required
def create_checkout(sponsor_id):
    data = request.get_json(silent=True) or {}
    if type(data.get('plan_id')) is not int:
        return error_response('Choose a valid subscription plan.', 400)
    if not billing_ready():
        return error_response('Stripe test checkout is awaiting backend API key and webhook configuration.', 503)
    try:
        client = stripe_client()
        with billing_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute('''SELECT s.*, u.email FROM sponsor s JOIN app_user u ON u.user_id=s.sponsor_id
                    WHERE s.sponsor_id=%s FOR UPDATE OF s''', (sponsor_id,))
                sponsor = cursor.fetchone()
                if not sponsor:
                    return error_response('Provider account not found.', 404)
                customer_id = sponsor['stripe_customer_id']
                if not customer_id:
                    customer = client.v1.customers.create({'email': sponsor['email'], 'name': sponsor['organization_name'],
                                                          'metadata': {'sponsor_id': str(sponsor_id)}},
                                                         options={'idempotency_key': f'scholarone-customer-{sponsor_id}'})
                    customer_id = customer.id
                    cursor.execute('UPDATE sponsor SET stripe_customer_id=%s WHERE sponsor_id=%s', (customer_id, sponsor_id))
                # Check Stripe as well as local records, covering delayed Checkout webhooks.
                subscriptions = client.v1.subscriptions.list({'customer': customer_id, 'status': 'all', 'limit': 100})
                if any(sub['status'] not in ('canceled', 'incomplete_expired') for sub in subscriptions.data):
                    return error_response('You already have a Stripe subscription. Use Manage Billing to change your plan or payment method.', 409)
                cursor.execute('SELECT * FROM subscription_plan WHERE plan_id=%s FOR UPDATE', (data['plan_id'],))
                plan = cursor.fetchone()
                if not plan:
                    return error_response('Subscription plan not found.', 404)
                _, price_id = sync_plan_price(cursor, client, plan)
                # Recover an open session even if a previous response or DB commit failed.
                open_sessions = client.v1.checkout.sessions.list({'customer': customer_id, 'status': 'open', 'limit': 100})
                reusable = None
                for existing in open_sessions.data:
                    previous = stripe_dict(existing)
                    if previous.get('metadata', {}).get('sponsor_id') != str(sponsor_id):
                        continue
                    if previous.get('metadata', {}).get('price_id') == price_id and reusable is None:
                        reusable = previous
                    else:
                        client.v1.checkout.sessions.expire(previous['id'])
                if reusable:
                    cursor.execute('UPDATE sponsor SET stripe_checkout_id=%s WHERE sponsor_id=%s', (reusable['id'], sponsor_id))
                    return jsonify({'url': reusable['url']})
                base = frontend_url() + '/sponsor/subscriptions'
                session = client.v1.checkout.sessions.create({
                    'mode': 'subscription', 'customer': customer_id, 'line_items': [{'price': price_id, 'quantity': 1}],
                    'billing_address_collection': 'required', 'customer_update': {'name': 'auto', 'address': 'auto'},
                    'payment_method_types': ['card'], 'client_reference_id': str(sponsor_id),
                    'metadata': {'sponsor_id': str(sponsor_id), 'plan_id': str(plan['plan_id']), 'price_id': price_id},
                    'subscription_data': {'metadata': {'sponsor_id': str(sponsor_id)}},
                    'success_url': base + '?checkout=success&session_id={CHECKOUT_SESSION_ID}',
                    'cancel_url': base + '?checkout=cancelled',
                })
                cursor.execute('UPDATE sponsor SET stripe_checkout_id=%s WHERE sponsor_id=%s', (session.id, sponsor_id))
        return jsonify({'url': session.url}), 201
    except Exception as error:
        return billing_error(error)


@billing_bp.route('/sponsors/<int:sponsor_id>/billing/portal', methods=['POST'])
@sponsor_access_required
def create_portal(sponsor_id):
    try:
        client = stripe_client()
        with billing_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT stripe_customer_id FROM sponsor WHERE sponsor_id=%s FOR UPDATE', (sponsor_id,))
                sponsor = cursor.fetchone()
                if not sponsor or not sponsor['stripe_customer_id']:
                    return error_response('Complete your first checkout to manage billing.', 400)
                cursor.execute('SELECT * FROM subscription_plan WHERE price>0 AND duration_month=1 ORDER BY plan_id FOR UPDATE')
                products = []
                for plan in cursor.fetchall():
                    product, price = sync_plan_price(cursor, client, plan)
                    products.append({'product': product, 'prices': [price]})
                features = {
                    'payment_method_update': {'enabled': True}, 'invoice_history': {'enabled': True},
                    'subscription_cancel': {'enabled': True, 'mode': 'at_period_end'},
                }
                if products:
                    features['subscription_update'] = {'enabled': True, 'default_allowed_updates': ['price'],
                                                       'proration_behavior': 'always_invoice', 'products': products}
                configuration = client.v1.billing_portal.configurations.create({
                    'business_profile': {'headline': 'Manage your ScholarOne subscription'}, 'features': features,
                })
                session = client.v1.billing_portal.sessions.create({
                    'customer': sponsor['stripe_customer_id'], 'configuration': configuration.id,
                    'return_url': frontend_url() + '/sponsor/subscriptions?billing=returned',
                })
        return jsonify({'url': session.url})
    except Exception as error:
        return billing_error(error)


@billing_bp.route('/sponsors/<int:sponsor_id>/billing/refresh', methods=['POST'])
@sponsor_access_required
def refresh_billing(sponsor_id):
    """Reconcile owned subscriptions after returning from Checkout or Portal."""
    try:
        client = stripe_client()
        with billing_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute('SELECT stripe_customer_id FROM sponsor WHERE sponsor_id=%s', (sponsor_id,))
                sponsor = cursor.fetchone()
                if sponsor and sponsor['stripe_customer_id']:
                    subscriptions = client.v1.subscriptions.list({'customer': sponsor['stripe_customer_id'], 'status': 'all', 'limit': 100})
                    for sub in sorted(subscriptions.data, key=lambda value: value['created']):
                        sync_subscription(cursor, client, sub['id'])
        return jsonify({'message': 'Billing status refreshed.'})
    except Exception as error:
        return billing_error(error)


@billing_bp.route('/billing/stripe/webhook', methods=['POST'])
def stripe_webhook():
    secret = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    if not secret:
        return error_response('Stripe webhook is not configured.', 503)
    try:
        event = stripe.Webhook.construct_event(request.get_data(), request.headers.get('Stripe-Signature', ''), secret).to_dict()
    except (ValueError, stripe.SignatureVerificationError):
        return error_response('Invalid Stripe webhook signature.', 400)
    if event.get('livemode'):
        return error_response('This application accepts Stripe test-mode events only.', 400)
    obj = event['data']['object']
    event_type = event['type']
    invoice_id = None
    if event_type == 'checkout.session.completed':
        subscription_id = object_id(obj.get('subscription')) if obj.get('mode') == 'subscription' else None
    elif event_type in ('invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'):
        subscription_id = invoice_subscription(obj)
        invoice_id = obj['id']
    elif event_type in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'):
        subscription_id = obj['id']
    else:
        return jsonify({'received': True})
    if not subscription_id:
        return jsonify({'received': True})
    try:
        with billing_connection() as connection:
            with connection.cursor() as cursor:
                sync_subscription(cursor, stripe_client(), subscription_id, invoice_id)
        return jsonify({'received': True})
    except Exception:
        current_app.logger.exception('Stripe webhook processing failed for %s', event['id'])
        return error_response('Billing event could not be processed. Stripe may retry this event.', 500)
