from unittest.mock import patch
import unittest

from app import create_app
from security import issue_access_token


class AdvisorFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.url = '/api/advisors/7/feedback'
        self.headers = {
            'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'advisor'})
        }

    @patch('routes.advisors.get_db_connection')
    def test_feedback_requires_signed_advisor_owner(self, database):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        for user in [{'user_id': 8, 'role': 'advisor'}, {'user_id': 7, 'role': 'student'}]:
            with self.subTest(user=user):
                headers = {'Authorization': 'Bearer ' + issue_access_token(user)}
                self.assertEqual(self.client.get(self.url, headers=headers).status_code, 403)
        database.assert_not_called()

    @patch('routes.advisors.get_db_connection')
    def test_review_pagination_rejects_invalid_pages(self, database):
        for page in ['0', '-1', 'invalid', '1.5', '1000001']:
            with self.subTest(page=page):
                response = self.client.get(self.url, query_string={'page': page}, headers=self.headers)
                self.assertEqual(response.status_code, 400)
        database.assert_not_called()

    @patch('routes.advisors.get_db_connection', side_effect=RuntimeError('private database detail'))
    def test_feedback_failure_has_retryable_error_without_private_details(self, database):
        response = self.client.get(self.url, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private database detail', response.get_data(as_text=True))
