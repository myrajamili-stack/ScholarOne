from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token

class AdminReportsTests(unittest.TestCase):
    def setUp(self):
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
        cursor.fetchall.side_effect = [[{'label':'student','count':3}], [], [{'label':'approved','count':2}], [{'month':'2026-11','count':2}], []]
        cursor.fetchone.return_value = {'active_subscriptions': 4}
        response = self.client.get('/api/admin/reports?start=2026-11-01&end=2026-11-12', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['statuses'][0]['count'], 2)
        self.assertEqual(data['active_subscriptions'], 4)
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
