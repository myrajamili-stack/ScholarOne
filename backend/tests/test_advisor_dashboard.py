from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class AdvisorDashboardTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'advisor'})}

    @patch('routes.advisor_dashboard.get_db_connection')
    def test_dashboard_and_search_require_the_signed_advisor_owner(self, db):
        for path in ['/api/advisors/7/dashboard', '/api/advisors/7/search?q=student']:
            self.assertEqual(self.client.get(path).status_code, 401)
            for user in [{'user_id': 8, 'role': 'advisor'}, {'user_id': 7, 'role': 'student'}]:
                headers = {'Authorization': 'Bearer ' + issue_access_token(user)}
                self.assertEqual(self.client.get(path, headers=headers).status_code, 403)
        db.assert_not_called()

    @patch('routes.advisor_dashboard.get_db_connection')
    def test_invalid_date_and_month_are_rejected_without_database_access(self, db):
        for query in ['date=invalid', 'date=2026-02-30', 'month=2026-13', 'month=9999-12']:
            self.assertEqual(self.client.get('/api/advisors/7/dashboard?' + query, headers=self.headers).status_code, 400)
        db.assert_not_called()

    @patch('routes.quizzes.get_db_connection')
    def test_quiz_quick_action_requires_advisor_owner_for_read_and_create(self, db):
        self.assertEqual(self.client.get('/api/quizzes/advisor/7').status_code, 401)
        other_headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 8, 'role': 'advisor'})}
        self.assertEqual(self.client.post('/api/quizzes/advisor/7', headers=other_headers, json={'title': 'Forged quiz'}).status_code, 403)
        db.assert_not_called()

    @patch('routes.advisor_dashboard.get_db_connection')
    def test_short_or_excessive_search_is_bounded(self, db):
        self.assertEqual(self.client.get('/api/advisors/7/search?q=a', headers=self.headers).json['results'], [])
        self.assertEqual(self.client.get('/api/advisors/7/search?q=' + 'a' * 101, headers=self.headers).status_code, 400)
        db.assert_not_called()

    @patch('routes.advisor_dashboard.get_db_connection')
    def test_search_scopes_every_entity_and_escapes_wildcards(self, db):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'user_id': 7}
        cursor.fetchall.return_value = [{'kind': 'student', 'id': 11, 'title': 'Student', 'subtitle': 'SPM'}]
        db.return_value = connection
        response = self.client.get('/api/advisors/7/search', query_string={'q': 'a%_', 'advisor_id': 999}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['results'][0]['href'], '/advisor/students?student=11')
        params = cursor.execute.call_args.args[1]
        self.assertEqual([params[index] for index in (0, 3, 7)], [7, 7, 7])
        self.assertEqual(params[1], '%a\\%\\_%')

    @patch('routes.advisor_dashboard.get_db_connection', side_effect=RuntimeError('private database detail'))
    def test_dashboard_failure_does_not_disclose_database_details(self, db):
        response = self.client.get('/api/advisors/7/dashboard', headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
