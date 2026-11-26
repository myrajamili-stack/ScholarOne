from contextlib import redirect_stdout
from io import StringIO
from unittest import TestCase
from unittest.mock import MagicMock,patch
from scripts.reconcile_provider_billing import reconcile


class BillingReconciliationTests(TestCase):
    def setUp(self):
        self.connection=MagicMock()
        self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.enterContext(patch('scripts.reconcile_provider_billing.get_db_connection',return_value=self.connection))
        self.client=self.enterContext(patch('scripts.reconcile_provider_billing.stripe_client')).return_value
        self.sync=self.enterContext(patch('scripts.reconcile_provider_billing.sync_subscription'))
        self.row=dict(subscription_id=10,sponsor_id=7,stripe_subscription_id='sub_test',stripe_customer_id='cus_test',subscription_status='active',price=49)
        self.client.v1.subscriptions.retrieve.return_value={'id':'sub_test','customer':'cus_test','status':'active','livemode':False}
        self.output=self.enterContext(redirect_stdout(StringIO()))

    def test_audit_never_changes_subscriptions(self):
        self.cursor.fetchall.return_value=[self.row]
        reconcile()
        self.sync.assert_not_called()
        self.assertIn('audited without changes',self.output.getvalue())

    def test_legacy_paid_rows_require_evidence_not_automatic_activation(self):
        self.cursor.fetchall.return_value=[{**self.row,'stripe_subscription_id':None}]
        reconcile(apply=True)
        self.sync.assert_not_called()
        self.client.v1.subscriptions.retrieve.assert_not_called()
        self.assertIn('manual evidence review required',self.output.getvalue())

    def test_customer_or_live_mode_mismatch_cannot_reconcile(self):
        self.cursor.fetchall.return_value=[self.row]
        for changed in [{'customer':'cus_other'},{'livemode':True}]:
            self.client.v1.subscriptions.retrieve.return_value={'id':'sub_test','customer':'cus_test','status':'active','livemode':False,**changed}
            reconcile(apply=True)
        self.sync.assert_not_called()

    def test_only_explicit_apply_uses_canonical_owned_stripe_subscription(self):
        self.cursor.fetchall.return_value=[self.row]
        reconcile(apply=True)
        self.sync.assert_called_once_with(self.cursor,self.client,'sub_test')

    def test_failed_sync_rolls_back_and_reports_no_commit(self):
        self.cursor.fetchall.return_value=[self.row]
        self.sync.side_effect=RuntimeError('private API details')
        reconcile(apply=True)
        self.assertIs(self.connection.__exit__.call_args.args[0],RuntimeError)
        self.assertNotIn('private API details',self.output.getvalue())
        self.assertIn('no changes committed',self.output.getvalue())
