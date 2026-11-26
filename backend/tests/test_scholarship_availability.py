from pathlib import Path
from datetime import datetime
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from scholarship_availability import intake_status


class ScholarshipAvailabilityTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    @patch('routes.scholarships.get_db_connection')
    def test_removed_or_unpublished_details_return_not_found(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.return_value = None
        response = self.client.get('/api/scholarships/999')
        self.assertEqual(response.status_code, 404)
        query, values = cursor.execute.call_args.args
        self.assertIn("in ('approved', 'active')", query)
        self.assertEqual(values, (999,))

    @patch('routes.scholarships.get_db_connection')
    def test_details_return_latest_stored_information(self, connect):
        connect.return_value.cursor.return_value.fetchone.return_value = {
            'scholarship_id': 1, 'title': 'Updated title', 'description': 'Updated requirements',
            'status': 'approved', 'deadline': '2099-12-31', 'import_metadata': {}}
        response = self.client.get('/api/scholarships/1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['description'], 'Updated requirements')

    @patch('routes.scholarships.get_db_connection')
    def test_past_deadlines_are_returned_as_closed(self, connect):
        connect.return_value.cursor.return_value.fetchone.return_value = {
            'scholarship_id': 1, 'title': 'Expired', 'status': 'approved',
            'deadline': '2000-01-01', 'import_metadata': {}}
        response = self.client.get('/api/scholarships/1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['intake_status'], 'closed')

    @patch('routes.applications.get_db_connection')
    @patch('security.verify_active_account', return_value=None)
    def test_application_rechecks_availability_before_insert(self, active, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [
            {'user_id': 11},
            {'scholarship_id': 1, 'deadline': '2026-11-24', 'import_metadata': {
                'external_listing': False, 'deadline_at': '2026-11-24T11:00:00+08:00',
            }},
            None,
        ]
        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': 'student'})}
        with patch('scholarship_availability.malaysia_now', return_value=datetime.fromisoformat('2026-11-24T03:00:00+00:00')):
            response = self.client.post('/api/applications', json={'scholarship_id': 1}, headers=headers)
        self.assertEqual(response.status_code, 404)
        self.assertIn('for share', cursor.execute.call_args_list[1].args[0])
        self.assertFalse(any('insert into' in call.args[0] for call in cursor.execute.call_args_list))
        connect.return_value.commit.assert_not_called()

    def test_exact_deadline_and_date_only_at_malaysia_boundaries(self):
        row = {'deadline': '2026-11-24', 'import_metadata': {'deadline_at': '2026-11-24T08:00:00'}}
        self.assertEqual(intake_status(row, datetime.fromisoformat('2026-11-23T23:59:59+00:00')), 'dated')
        self.assertEqual(intake_status(row, datetime.fromisoformat('2026-11-24T00:00:00+00:00')), 'closed')
        del row['import_metadata']
        self.assertEqual(intake_status(row, datetime.fromisoformat('2026-11-24T15:59:59+00:00')), 'dated')
        self.assertEqual(intake_status(row, datetime.fromisoformat('2026-11-24T16:00:00+00:00')), 'closed')

    @patch('routes.calendar.malaysia_now', return_value=datetime.fromisoformat('2026-11-24T11:00:00+08:00'))
    @patch('routes.calendar.get_db_connection')
    def test_calendar_omits_closed_listings_and_private_import_metadata(self, connect, clock):
        connect.return_value.cursor.return_value.fetchall.return_value = [
            {'scholarship_id': 1, 'deadline': '2026-11-24', 'import_metadata': {'deadline_at': '2026-11-24T11:00:00+08:00'}},
            {'scholarship_id': 2, 'deadline': '2026-11-24', 'import_metadata': {'deadline_at': '2026-11-24T11:01:00+08:00'}},
        ]
        response = self.client.get('/api/calendar/deadlines')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, [{'scholarship_id': 2, 'deadline': '2026-11-24',
                                         'deadline_at': '2026-11-24T11:01:00+08:00'}])


if __name__ == '__main__':
    unittest.main()
