from datetime import date, timedelta
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from routes.scholarship_reminders import reminder_response
from security import issue_access_token


class ScholarshipReminderTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()
        self.headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 11, "role": "student"})}
        self.today = date(2026, 10, 30)

    def database(self, rows):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = rows
        return connection, cursor

    def test_alert_window_is_three_days_through_deadline_day(self):
        for days, expected in [(-1, False), (0, True), (1, True), (2, True), (3, True), (4, False)]:
            with self.subTest(days=days):
                deadline = self.today + timedelta(days=days)
                result = reminder_response({"deadline": deadline}, self.today)
                self.assertEqual(result['is_due'], expected)
                self.assertEqual(result['days_until'], days)
                self.assertEqual(result['remind_on'], (deadline - timedelta(days=3)).isoformat())

    def test_date_boundaries_cross_month_and_year_correctly(self):
        result = reminder_response({"deadline": '2027-01-02'}, date(2026, 12, 30))
        self.assertEqual(result['remind_on'], '2026-12-30')
        self.assertTrue(result['is_due'])

    @patch('routes.scholarship_reminders.get_db_connection')
    def test_unauthenticated_and_non_student_access_is_blocked(self, get_connection):
        self.assertEqual(self.client.get('/api/scholarship-reminders').status_code, 401)
        headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 10, "role": "sponsor"})}
        self.assertEqual(self.client.put('/api/scholarship-reminders/1', headers=headers).status_code, 403)
        get_connection.assert_not_called()

    @patch('routes.scholarship_reminders.malaysia_today', return_value=date(2026, 10, 30))
    @patch('routes.scholarship_reminders.get_db_connection')
    def test_enable_uses_signed_student_and_is_idempotent(self, get_connection, today):
        connection, cursor = self.database([{'student_id': 11}, {'scholarship_id': 5, 'title': 'Test', 'deadline': date(2026, 11, 2)}])
        get_connection.return_value = connection
        response = self.client.put('/api/scholarship-reminders/5', headers=self.headers, json={'student_id': 999})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['reminder']['is_due'])
        self.assertEqual(cursor.execute.call_args.args[1], (11, 5))
        self.assertIn('ON CONFLICT', cursor.execute.call_args.args[0])

    @patch('routes.scholarship_reminders.malaysia_today', return_value=date(2026, 10, 30))
    @patch('routes.scholarship_reminders.get_db_connection')
    def test_past_or_missing_deadlines_cannot_be_enabled(self, get_connection, today):
        for scholarship, status in [(None, 404), ({'deadline': date(2026, 10, 29)}, 409)]:
            connection, cursor = self.database([{'student_id': 11}, scholarship])
            get_connection.return_value = connection
            response = self.client.put('/api/scholarship-reminders/5', headers=self.headers)
            self.assertEqual(response.status_code, status)
            self.assertFalse(any('INSERT INTO' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.scholarship_reminders.get_db_connection')
    def test_disable_removes_only_current_students_preference(self, get_connection):
        connection, cursor = self.database([{'student_id': 11}])
        get_connection.return_value = connection
        response = self.client.delete('/api/scholarship-reminders/5', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json['enabled'])
        self.assertEqual(cursor.execute.call_args.args[1], (11, 5))
        self.assertIn('DELETE FROM scholarship_reminder', cursor.execute.call_args.args[0])

    @patch('routes.scholarship_reminders.malaysia_today', return_value=date(2026, 10, 30))
    @patch('routes.scholarship_reminders.get_db_connection')
    def test_list_recalculates_alerts_from_current_deadline(self, get_connection, today):
        connection, cursor = self.database([{'student_id': 11}])
        cursor.fetchall.return_value = [{'scholarship_id': 5, 'title': 'Test', 'deadline': date(2026, 11, 2)}]
        get_connection.return_value = connection
        response = self.client.get('/api/scholarship-reminders?student_id=999', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json[0]['is_due'])
        self.assertEqual(cursor.execute.call_args.args[1], (11,))
        self.assertIn('JOIN scholarship', cursor.execute.call_args.args[0])

    @patch('routes.scholarship_reminders.get_db_connection', side_effect=RuntimeError('private details'))
    def test_connection_failure_is_sanitized(self, get_connection):
        response = self.client.get('/api/scholarship-reminders', headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
