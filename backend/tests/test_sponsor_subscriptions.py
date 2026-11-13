from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class SponsorSubscriptionTests(unittest.TestCase):
    def setUp(self):
        approval = patch('db.get_db_connection')
        connect = approval.start()
        connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status':'active'}
        self.addCleanup(approval.stop)

        self.client = create_app().test_client()
        self.client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + issue_access_token({'user_id':1, 'role':'sponsor'})
        self.free = dict(plan_id=1, plan_name='Free', price=0, scholarship_limit=3, duration_month=1)
        self.growth = dict(plan_id=2, plan_name='Growth', price=49, scholarship_limit=10, duration_month=1)

    @patch('routes.sponsors.get_db_connection')
    def test_inactive_subscription_uses_free_allowance(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [
            {'organization_name': 'Provider', 'subscription_status': 'growth'},
            None,
            {'used_scholarships': 2},
        ]
        cursor.fetchall.return_value = [self.free, self.growth]
        response = self.client.get('/api/sponsors/1/subscriptions')
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body['current_subscription']['plan_name'], 'Free')
        self.assertEqual(body['current_subscription']['subscription_status'], 'free')
        self.assertEqual(body['usage'], {'used_scholarships': 2, 'scholarship_limit': 3})
        subscription_query = next(call.args[0] for call in cursor.execute.call_args_list
                                  if 'from subscription sub' in call.args[0])
        self.assertIn("= 'active'", subscription_query)
        self.assertIn('sub.start_date <= current_date', subscription_query)
        self.assertIn('sub.end_date >= current_date', subscription_query)

    @patch('routes.sponsors.get_db_connection')
    def test_active_subscription_reports_saved_plan_and_usage(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [
            {'organization_name': 'Provider', 'subscription_status': 'growth'},
            {**self.growth, 'subscription_status': 'active', 'end_date': '2027-01-01'},
            {'used_scholarships': 4},
        ]
        cursor.fetchall.return_value = [self.free, self.growth]
        response = self.client.get('/api/sponsors/1/subscriptions')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['current_subscription']['plan_id'], 2)
        self.assertEqual(response.get_json()['usage']['scholarship_limit'], 10)

    @patch('routes.sponsors.get_db_connection')
    def test_activate_free_plan_commits_subscription_and_returns_plan(self, connect):
        connection = connect.return_value
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {'sponsor_id': 1}, self.free, None,
            {'subscription_id': 10, 'plan_id': 1, 'subscription_status': 'active'},
        ]
        response = self.client.post('/api/sponsors/1/subscriptions', json={'plan_id': 1})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.get_json()['plan']['scholarship_limit'], 3)
        connection.commit.assert_called_once()
        connection.rollback.assert_not_called()

    @patch('routes.sponsors.get_db_connection')
    def test_paid_plan_cannot_be_activated_without_payment(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [{'sponsor_id': 1}, self.growth]
        response = self.client.post('/api/sponsors/1/subscriptions', json={'plan_id': 2})
        self.assertEqual(response.status_code, 402)
        connect.return_value.commit.assert_not_called()
        self.assertFalse(any('insert into subscription (' in call.args[0] for call in cursor.execute.call_args_list))


if __name__ == '__main__':
    unittest.main()
