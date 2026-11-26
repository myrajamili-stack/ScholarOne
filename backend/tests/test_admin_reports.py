from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token

class AdminReportsTests(unittest.TestCase):
    def setUp(self):
        # Business-logic tests assume an active account; restriction tests cover the real lookup.
        self.enterContext(patch("security.verify_active_account", return_value=None))
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}

    @patch('routes.admin.get_db_connection')
    def test_access_restricted_to_administrators(self, connect):
        self.assertEqual(self.client.get('/api/admin/reports').status_code, 401)
        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 2, 'role': 'sponsor'})}
        self.assertEqual(self.client.get('/api/admin/reports', headers=headers).status_code, 403)
        connect.assert_not_called()

    @patch('routes.admin.get_db_connection')
    def test_invalid_ranges_rejected_before_queries(self, connect):
        for query in ['start=2026-02-30', 'start=2026-12-01&end=2026-01-01', 'end=invalid']:
            self.assertEqual(self.client.get('/api/admin/reports?' + query, headers=self.headers).status_code, 400)
        connect.assert_not_called()

    @patch('routes.admin.get_db_connection')
    def test_readonly_snapshot_and_bound_dates(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchall.side_effect = [[{'label':'student','count':3}], [], [{'label':'approved','count':2}], [{'month':'2026-11','count':2}], [], [{'currency':'myr','amount':'49.00','invoice_count':1}], [{'label':'paid','count':1}], [{'month':'2026-11','currency':'myr','amount':'49.00'}]]
        cursor.fetchone.side_effect = [{'active_subscriptions':4},{'legacy_paid_records':13,'marked_active_legacy_records':3}]
        response = self.client.get('/api/admin/reports?start=2026-11-01&end=2026-11-12', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['statuses'][0]['count'], 2)
        self.assertEqual(data['active_subscriptions'], 4)
        self.assertEqual(data['payments']['revenue_by_currency'][0]['amount'],'49.00')
        self.assertEqual(data['payments']['legacy_paid_records'],13)
        payment_query=next(call for call in cursor.execute.call_args_list if "payment_status='paid'" in call.args[0])
        self.assertIn('paid_at is not null',payment_query.args[0])
        self.assertIn('Asia/Kuala_Lumpur',payment_query.args[0])
        for call in cursor.execute.call_args_list:
            self.assertTrue(call.args[0].strip().lower().startswith('select'))
        self.assertEqual(str(cursor.execute.call_args_list[0].args[1][0]), '2026-11-01')
        connect.return_value.commit.assert_not_called()
        connect.return_value.close.assert_called_once()

    @patch('routes.admin.get_db_connection')
    def test_database_failure_closes_resources_without_details(self, connect):
        connect.return_value.cursor.return_value.execute.side_effect = RuntimeError('secret')
        response = self.client.get('/api/admin/reports', headers=self.headers)
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('secret', response.get_data(as_text=True))
        connect.return_value.close.assert_called_once()
