from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class AdminSubscriptionManagementTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}
        self.payload = {'price': '49.50', 'scholarship_limit': 10, 'duration_month': 1,
                        'benefits': [' Application management ', 'Application management']}

    @patch('routes.admin.get_db_connection')
    def test_provider_cannot_edit_plan_configuration(self, connect):
        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 2, 'role': 'sponsor'})}
        result = self.client.patch('/api/admin/subscription-plans/1', json=self.payload, headers=headers)
        self.assertEqual(result.status_code, 403)
        connect.assert_not_called()

    @patch('routes.admin.get_db_connection')
    def test_invalid_configuration_does_not_touch_database(self, connect):
        invalid_values = [{'price': 'NaN'}, {'price': '-1'}, {'price': '1.001'},
                          {'scholarship_limit': 0}, {'scholarship_limit': True},
                          {'duration_month': 1.5}, {'benefits': ['x' * 201]}]
        for change in invalid_values:
            result = self.client.patch('/api/admin/subscription-plans/1', json={**self.payload, **change}, headers=self.headers)
            self.assertEqual(result.status_code, 400, change)
        connect.assert_not_called()

    @patch('routes.admin.get_db_connection')
    def test_save_is_atomic_and_normalizes_benefits(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [{'plan_id': 1}, {'plan_id': 1, 'plan_name': 'Growth', **self.payload}]
        result = self.client.patch('/api/admin/subscription-plans/1', json=self.payload, headers=self.headers)
        self.assertEqual(result.status_code, 200)
        saved_values = cursor.execute.call_args.args[1]
        self.assertEqual(saved_values[3], '["Application management"]')
        connect.return_value.commit.assert_called_once()
        connect.return_value.close.assert_called_once()

    @patch('routes.admin.billing_ready', return_value=False)
    @patch('routes.admin.get_db_connection')
    def test_management_includes_free_providers_and_payment_availability(self, connect, billing_ready_mock):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchall.side_effect = [[], [], [{
            'sponsor_id': 2, 'provider_name': 'Free Provider', 'subscription_status': 'free',
            'start_date': None, 'end_date': None, 'listing_count': 2, 'scholarship_limit': 3,
        }], []]
        cursor.fetchone.return_value = {'revenue': 0}
        result = self.client.get('/api/admin/subscriptions', headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.get_json()['providers'][0]['listing_count'], 2)
        self.assertFalse(result.get_json()['payments_enabled'])
        self.assertEqual(result.get_json()['monthly_revenue'], 0)
        connect.return_value.close.assert_called_once()

    @patch('routes.admin.get_db_connection')
    def test_failed_save_rolls_back_and_keeps_error_generic(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.execute.side_effect = RuntimeError('private database details')
        result = self.client.patch('/api/admin/subscription-plans/1', json=self.payload, headers=self.headers)
        self.assertEqual(result.status_code, 500)
        self.assertNotIn('private database', str(result.get_json()))
        connect.return_value.rollback.assert_called_once()
        connect.return_value.commit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
