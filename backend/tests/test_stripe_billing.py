import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from stripe_billing import invoice_subscription, stripe_client, sync_subscription, BillingConfigurationError


class StripeBillingTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.secret = 'whsec_unit_test'
        self.env = patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_test_unit_test', 'STRIPE_WEBHOOK_SECRET': self.secret})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'sponsor'})}
        approval = patch('db.get_db_connection')
        approval.start().return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status': 'active'}
        self.addCleanup(approval.stop)

    def signed_event(self, event_type, obj, **extra):
        body = json.dumps({'id': 'evt_test', 'type': event_type, 'livemode': False,
                           'data': {'object': obj}, **extra}).encode()
        now = str(int(time.time()))
        digest = hmac.new(self.secret.encode(), now.encode() + b'.' + body, hashlib.sha256).hexdigest()
        return body, {'Stripe-Signature': f't={now},v1={digest}'}

    def test_live_key_is_rejected(self):
        with patch.dict(os.environ, {'STRIPE_SECRET_KEY': 'sk_live_example'}):
            with self.assertRaises(BillingConfigurationError):
                stripe_client()

    def test_invalid_webhook_signature_is_rejected(self):
        response = self.client.post('/api/billing/stripe/webhook', data=b'{}', headers={'Stripe-Signature': 'invalid'})
        self.assertEqual(response.status_code, 400)

    def test_signed_live_event_is_rejected(self):
        body, headers = self.signed_event('invoice.paid', {}, livemode=True)
        self.assertEqual(self.client.post('/api/billing/stripe/webhook', data=body, headers=headers).status_code, 400)

    @patch('routes.billing.sync_subscription')
    @patch('stripe_billing.get_db_connection')
    def test_signed_events_use_canonical_subscription_state(self, connect, sync):
        cases = [
            ('checkout.session.completed', {'mode': 'subscription', 'subscription': 'sub_test'}, None),
            ('invoice.paid', {'id': 'in_test', 'parent': {'subscription_details': {'subscription': 'sub_test'}}}, 'in_test'),
            ('invoice.payment_failed', {'id': 'in_test', 'subscription': 'sub_test'}, 'in_test'),
            ('customer.subscription.updated', {'id': 'sub_test'}, None),
            ('customer.subscription.deleted', {'id': 'sub_test'}, None),
        ]
        with patch('routes.billing.stripe_client') as gateway:
            for event_type, obj, invoice_id in cases:
                body, headers = self.signed_event(event_type, obj)
                response = self.client.post('/api/billing/stripe/webhook', data=body, headers=headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(sync.call_args.args[2:], ('sub_test', invoice_id))
        self.assertEqual(connect.return_value.close.call_count, len(cases))

    @patch('routes.billing.sync_subscription', side_effect=RuntimeError('database unavailable'))
    @patch('stripe_billing.get_db_connection')
    def test_webhook_failure_returns_retryable_error(self, connect, sync):
        body, headers = self.signed_event('customer.subscription.updated', {'id': 'sub_test'})
        with patch('routes.billing.stripe_client'):
            result = self.client.post('/api/billing/stripe/webhook', data=body, headers=headers)
        self.assertEqual(result.status_code, 500)
        self.assertNotIn('database unavailable', result.get_data(as_text=True))
        connect.return_value.__exit__.assert_called_once()

    @patch('routes.billing.stripe_client')
    def test_checkout_cannot_access_another_provider(self, gateway):
        result = self.client.post('/api/sponsors/2/billing/checkout', json={'plan_id': 2}, headers=self.headers)
        self.assertEqual(result.status_code, 403)
        gateway.assert_not_called()

    @patch('routes.billing.stripe_client')
    def test_checkout_validates_plan_id_before_gateway_call(self, gateway):
        result = self.client.post('/api/sponsors/1/billing/checkout', json={'plan_id': True}, headers=self.headers)
        self.assertEqual(result.status_code, 400)
        gateway.assert_not_called()

    @patch('routes.billing.stripe_client')
    @patch('stripe_billing.get_db_connection')
    def test_existing_stripe_subscription_prevents_duplicate_checkout(self, connect, gateway):
        cursor = connect.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'stripe_customer_id': 'cus_test', 'stripe_checkout_id': None}
        gateway.return_value.v1.subscriptions.list.return_value.data = [{'status': 'active'}]
        result = self.client.post('/api/sponsors/1/billing/checkout', json={'plan_id': 2}, headers=self.headers)
        self.assertEqual(result.status_code, 409)
        gateway.return_value.v1.checkout.sessions.create.assert_not_called()

    @patch('routes.billing.sync_plan_price', return_value=('prod_test', 'price_test'))
    @patch('routes.billing.stripe_client')
    @patch('stripe_billing.get_db_connection')
    def test_checkout_uses_server_price_and_recurring_mode(self, connect, gateway, price):
        cursor = connect.return_value.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = [
            {'stripe_customer_id': 'cus_test', 'stripe_checkout_id': None},
            {'plan_id': 2, 'plan_name': 'Growth', 'price': 49, 'duration_month': 1},
        ]
        gateway.return_value.v1.subscriptions.list.return_value.data = []
        gateway.return_value.v1.checkout.sessions.create.return_value = type('Session', (), {'id': 'cs_test', 'url': 'https://checkout.stripe.com/test'})()
        result = self.client.post('/api/sponsors/1/billing/checkout', json={'plan_id': 2, 'price': 1}, headers=self.headers)
        self.assertEqual(result.status_code, 201)
        payload = gateway.return_value.v1.checkout.sessions.create.call_args.args[0]
        self.assertEqual(payload['mode'], 'subscription')
        self.assertEqual(payload['line_items'], [{'price': 'price_test', 'quantity': 1}])
        self.assertEqual(payload['billing_address_collection'], 'required')
        self.assertIn('/sponsor/subscriptions?', payload['success_url'])

    def fixture_subscription(self):
        return {'id': 'sub_test', 'customer': 'cus_test', 'livemode': False, 'status': 'active',
                'cancel_at_period_end': False, 'items': {'data': [{
                    'quantity': 1, 'current_period_start': 1800000000, 'current_period_end': 1802678400,
                    'price': {'id': 'price_test', 'metadata': {'plan_id': '2'}, 'currency': 'myr',
                              'unit_amount': 4900, 'recurring': {'interval': 'month', 'interval_count': 1}}}]},
                'latest_invoice': {'id': 'in_test', 'created': 1800000000, 'status': 'paid',
                                   'amount_paid': 4900, 'currency': 'myr', 'status_transitions': {'paid_at': 1800000000}}}

    def run_sync(self, subscription, event_invoice_id=None):
        gateway = MagicMock()
        gateway.v1.subscriptions.retrieve.return_value = subscription
        gateway.v1.invoices.retrieve.return_value = {**subscription['latest_invoice'], 'id': 'in_old', 'subscription': 'sub_test'}
        cursor = MagicMock()
        cursor.fetchone.side_effect = [{'sponsor_id': 1, 'account_status': 'active'},
                                       {'plan_id': 2, 'plan_name': 'Growth'}, None, {'subscription_id': 9}]
        sync_subscription(cursor, gateway, 'sub_test', event_invoice_id)
        return cursor, gateway

    def test_only_active_and_paid_subscriptions_grant_quota(self):
        for status, invoice_status, expected in [('active', 'paid', 'active'), ('active', 'open', 'inactive'),
                                                  ('past_due', 'open', 'inactive'), ('canceled', 'paid', 'inactive'),
                                                  ('incomplete', 'open', 'inactive')]:
            sub = self.fixture_subscription()
            sub['status'] = status
            sub['latest_invoice']['status'] = invoice_status
            cursor, _ = self.run_sync(sub)
            insert = next(call for call in cursor.execute.call_args_list if 'INSERT INTO subscription\n' in call.args[0])
            self.assertEqual(insert.args[1][4], expected)
            self.assertIn('ON CONFLICT (stripe_subscription_id)', insert.args[0])

    def test_cancel_at_period_end_retains_paid_entitlement(self):
        sub = self.fixture_subscription()
        sub['cancel_at_period_end'] = True
        cursor, _ = self.run_sync(sub)
        insert = next(call for call in cursor.execute.call_args_list if 'INSERT INTO subscription\n' in call.args[0])
        self.assertEqual(insert.args[1][4], 'active')
        self.assertTrue(insert.args[1][9])

    def test_invoice_replay_uses_upsert_and_canonical_latest_state(self):
        sub = self.fixture_subscription()
        cursor, gateway = self.run_sync(sub, 'in_old')
        gateway.v1.invoices.retrieve.assert_called_once_with('in_old')
        invoice_upserts = [call for call in cursor.execute.call_args_list if 'INSERT INTO subscription_payment' in call.args[0]]
        self.assertTrue(all('ON CONFLICT (stripe_invoice_id)' in call.args[0] for call in invoice_upserts))
        self.assertEqual(gateway.v1.subscriptions.retrieve.call_count, 2)

    def test_invoice_subscription_formats_are_supported(self):
        self.assertEqual(invoice_subscription({'subscription': 'sub_old'}), 'sub_old')
        self.assertEqual(invoice_subscription({'parent': {'subscription_details': {'subscription': 'sub_new'}}}), 'sub_new')
        self.assertIsNone(invoice_subscription({'parent': None}))
