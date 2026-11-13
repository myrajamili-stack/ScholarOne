from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class SponsorAppealTests(unittest.TestCase):
    def setUp(self):
        approval = patch('db.get_db_connection')
        connect = approval.start()
        connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status':'active'}
        self.addCleanup(approval.stop)

        self.client = create_app().test_client()
        self.client.environ_base['HTTP_AUTHORIZATION'] = 'Bearer ' + issue_access_token({'user_id':1, 'role':'sponsor'})

    @patch('routes.sponsors.get_db_connection')
    def test_overview_uses_appeal_history_for_resolved_counts(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [
            {'organization_name': 'Provider'},
            {'rejected': 2, 'under_review': 1, 'approved_after_review': 3, 'unsuccessful': 1},
        ]
        cursor.fetchall.side_effect = [[], []]
        response = self.client.get('/api/sponsors/1/appeals')
        self.assertEqual(response.status_code, 200)
        summary = response.get_json()['summary']
        self.assertEqual(summary['resolved'], 3)
        self.assertEqual(summary['unsuccessful'], 1)
        summary_query = cursor.execute.call_args_list[1].args[0]
        self.assertIn('and exists', summary_query)
        self.assertIn("al.action = 'sponsor_appeal_submitted'", summary_query)
        history_query = cursor.execute.call_args_list[3].args[0]
        self.assertIn('s.status as current_status', history_query)
        self.assertIn('s.sponsor_id = al.user_id', history_query)

    @patch('routes.sponsors.get_db_connection')
    def test_short_message_is_rejected_before_database_access(self, connect):
        response = self.client.post('/api/sponsors/1/appeals', json={'scholarship_id': 10, 'appeal_message': 'Too short'})
        self.assertEqual(response.status_code, 400)
        connect.assert_not_called()

    @patch('routes.sponsors.get_db_connection')
    def test_submission_locks_listing_and_saves_history_atomically(self, connect):
        connection = connect.return_value
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {'scholarship_id': 10, 'title': 'Award', 'status': 'rejected'},
            {'scholarship_id': 10, 'title': 'Award', 'status': 'appeal_submitted'},
            {'log_id': 20, 'description': 'Appeal details'},
        ]
        response = self.client.post('/api/sponsors/1/appeals', json={
            'scholarship_id': 10, 'appeal_message': 'Updated funding details are available for review.',
        })
        self.assertEqual(response.status_code, 201)
        self.assertIn('for update', cursor.execute.call_args_list[0].args[0])
        self.assertEqual(response.get_json()['scholarship']['status'], 'appeal_submitted')
        connection.commit.assert_called_once()

    @patch('routes.sponsors.get_db_connection')
    def test_duplicate_appeal_keeps_pending_listing(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.return_value = {'scholarship_id': 10, 'title': 'Award', 'status': 'appeal_submitted'}
        response = self.client.post('/api/sponsors/1/appeals', json={
            'scholarship_id': 10, 'appeal_message': 'Updated funding details are available for review.',
        })
        self.assertEqual(response.status_code, 400)
        connect.return_value.commit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
