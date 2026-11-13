from datetime import date, datetime, timedelta
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from advisor_scheduling import available_slots, empty_schedule, validate_schedule
from security import issue_access_token


class SchedulingTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.advisor = self.auth(7, 'advisor')
        self.student = self.auth(11, 'student')
        self.day = date(2026, 11, 9)  # Monday
        self.now = datetime(2026, 11, 8, 12)
        self.schedule = empty_schedule()
        self.schedule['published'] = True
        self.schedule['availability'][0].update(enabled=True, start_time='09:00', end_time='11:00')

    def auth(self, user_id, role):
        return {'Authorization': 'Bearer ' + issue_access_token({'user_id': user_id, 'role': role})}

    def database(self, rows, appointments=None):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = rows
        cursor.fetchall.return_value = appointments or []
        return connection, cursor

    def test_schedule_requires_all_unique_days_and_strict_types(self):
        for invalid in [None, [], {}, {**self.schedule, 'availability': self.schedule['availability'][:6]}]:
            with self.assertRaises(ValueError):
                validate_schedule(invalid)
        self.schedule['availability'][0]['enabled'] = 'false'
        with self.assertRaises(ValueError):
            validate_schedule(self.schedule)

    def test_invalid_hours_and_short_windows_are_rejected(self):
        for start, end in [('17:00', '09:00'), ('09:00', '09:00'), ('09:00', '09:15'), ('25:00', '26:00'), ('9:00', '11:00')]:
            self.schedule['availability'][0].update(start_time=start, end_time=end)
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                validate_schedule(self.schedule)

    def test_duplicate_invalid_and_overlong_blocked_dates_are_rejected(self):
        for blocked in [[{'date': '2026-02-30'}], [{'date': '2026-11-09'}, {'date': '2026-11-09'}], [{'date': '2026-11-09', 'reason': 'a' * 201}]]:
            with self.assertRaises(ValueError):
                validate_schedule({**self.schedule, 'blocked_dates': blocked})

    def test_slots_respect_hours_and_overlaps_not_only_exact_matches(self):
        busy = [{'appointment_datetime': datetime(2026, 11, 9, 9, 15), 'appointment_status': 'pending'}]
        self.assertEqual(available_slots(self.schedule, self.day, busy, self.now), ['2026-11-09T10:00', '2026-11-09T10:30'])
        busy[0]['appointment_status'] = 'cancelled'
        self.assertEqual(len(available_slots(self.schedule, self.day, busy, self.now)), 4)

    def test_unpublished_disabled_blocked_and_past_slots_are_hidden(self):
        self.assertEqual(available_slots(empty_schedule(), self.day, [], self.now), [])
        self.assertEqual(available_slots(self.schedule, self.day + timedelta(days=1), [], self.now), [])
        self.assertEqual(available_slots(self.schedule, self.day, [], datetime(2026, 11, 9, 10, 5)), ['2026-11-09T10:30'])
        self.schedule['blocked_dates'] = [{'date': '2026-11-09', 'reason': 'Leave'}]
        self.assertEqual(available_slots(self.schedule, self.day, [], self.now), [])

    def test_session_lengths_validate_and_control_slot_spacing(self):
        for length in [15, 30, 45, 60, 90, 120]:
            self.schedule['slot_minutes'] = length
            normalized = validate_schedule(self.schedule)
            self.assertEqual(normalized['slot_minutes'], length)
            slots = available_slots(self.schedule, self.day, [], self.now)
            self.assertEqual(len(slots), 120 // length)
            if len(slots) > 1:
                self.assertEqual(datetime.fromisoformat(slots[1]) - datetime.fromisoformat(slots[0]), timedelta(minutes=length))
        for length in [True, '60', 0, 20, 180, None]:
            with self.subTest(length=length), self.assertRaises(ValueError):
                validate_schedule({**self.schedule, 'slot_minutes': length})

    def test_session_must_fit_inside_daily_window(self):
        self.schedule['slot_minutes'] = 60
        self.schedule['availability'][0]['end_time'] = '09:45'
        with self.assertRaisesRegex(ValueError, 'at least 60 minutes'):
            validate_schedule(self.schedule)

    def test_changed_session_length_preserves_existing_booking_duration(self):
        self.schedule['slot_minutes'] = 15
        existing = [{'appointment_datetime': datetime(2026, 11, 9, 9), 'appointment_status': 'confirmed', 'duration_minutes': 60}]
        slots = available_slots(self.schedule, self.day, existing, self.now)
        self.assertEqual(slots[0], '2026-11-09T10:00')
        self.schedule['slot_minutes'] = 60
        existing[0]['duration_minutes'] = 15
        existing[0]['appointment_datetime'] = datetime(2026, 11, 9, 9, 45)
        self.assertEqual(available_slots(self.schedule, self.day, existing, self.now), ['2026-11-09T10:00'])

    def test_previous_day_booking_can_block_midnight_slot(self):
        self.schedule['slot_minutes'] = 30
        self.schedule['availability'][0].update(start_time='00:00', end_time='01:00')
        existing = [{'appointment_datetime': datetime(2026, 11, 8, 23, 45), 'appointment_status': 'confirmed', 'duration_minutes': 60}]
        self.assertEqual(available_slots(self.schedule, self.day, existing, self.now), [])

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_stale_session_length_cannot_silently_change_booking(self, db, now):
        now.return_value = self.now
        self.schedule['slot_minutes'] = 60
        connection, cursor = self.database([{'user_id': 7}, {'student_id': 11}, self.schedule])
        db.return_value = connection
        response = self.client.post('/api/advisors/7/appointments', headers=self.student,
            json={'appointment_datetime': '2026-11-09T09:00', 'slot_minutes': 30})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(any('INSERT INTO appointment' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.advisors.get_db_connection')
    def test_calendar_fetches_entire_selected_week_without_old_limit(self, db):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [{'user_id': 7}, {'count': 1}, {'count': 2}, {'count': 1}, self.schedule]
        cursor.fetchall.return_value = [{'appointment_id': 5, 'appointment_datetime': datetime(2026, 11, 9, 9), 'appointment_status': 'pending', 'duration_minutes': 45, 'student_name': 'Student'}]
        db.return_value = connection
        response = self.client.get('/api/advisors/7/schedule?week_start=2026-11-09', headers=self.advisor)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['summary']['this_week_count'], 1)
        self.assertEqual(response.json['appointments'][0]['duration_minutes'], 45)
        calls = [call for call in cursor.execute.call_args_list if 'from appointment ap' in call.args[0]]
        self.assertEqual(calls[0].args[1], (7, date(2026, 11, 9), date(2026, 11, 16)))
        self.assertNotIn('limit 30', calls[0].args[0])

    @patch('routes.advisors.get_db_connection')
    def test_calendar_rejects_invalid_week_before_database(self, db):
        response = self.client.get('/api/advisors/7/schedule?week_start=invalid', headers=self.advisor)
        self.assertEqual(response.status_code, 400)
        db.assert_not_called()

    @patch('routes.advisor_scheduling.get_db_connection')
    def test_save_requires_advisor_owner(self, db):
        for headers, expected in [({}, 401), (self.student, 403), (self.auth(8, 'advisor'), 403)]:
            response = self.client.put('/api/advisors/7/schedule', headers=headers, json=self.schedule)
            self.assertEqual(response.status_code, expected)
        db.assert_not_called()

    @patch('routes.advisors.get_db_connection')
    def test_private_schedule_appointments_and_status_require_owner(self, db):
        for path in ['/api/advisors/7/schedule', '/api/advisors/7/appointments']:
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.get(path, headers=self.student).status_code, 403)
            self.assertEqual(self.client.get(path, headers=self.auth(8, 'advisor')).status_code, 403)
        self.assertEqual(self.client.patch('/api/advisors/7/appointments/5/status', headers=self.student, json={'status': 'confirmed'}).status_code, 403)
        db.assert_not_called()

    @patch('routes.advisors.get_db_connection')
    def test_reactivating_cancelled_booking_rejects_overlap(self, db):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [{'user_id': 7}, {'student_id': 11, 'appointment_datetime': datetime(2026, 11, 9, 9)}, {'appointment_id': 2}]
        db.return_value = connection
        response = self.client.patch('/api/advisors/7/appointments/1/status', headers=self.advisor, json={'status': 'confirmed'})
        self.assertEqual(response.status_code, 409)
        connection.rollback.assert_called_once()
        self.assertFalse(any('update appointment' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.advisor_scheduling.get_db_connection')
    def test_invalid_schedule_never_reaches_database(self, db):
        response = self.client.put('/api/advisors/7/schedule', headers=self.advisor, json={})
        self.assertEqual(response.status_code, 400)
        db.assert_not_called()

    @patch('routes.advisor_scheduling.get_db_connection')
    def test_save_upserts_only_signed_advisor_and_returns_published(self, db):
        connection, cursor = self.database([{'user_id': 7}])
        db.return_value = connection
        response = self.client.put('/api/advisors/7/schedule', headers=self.advisor, json={**self.schedule, 'advisor_id': 999})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['published'])
        query, params = cursor.execute.call_args.args
        self.assertIn('ON CONFLICT', query)
        self.assertEqual(params[0], 7)
        self.assertTrue(any('FOR UPDATE' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_availability_uses_saved_data_and_exposes_no_student_details(self, db, now):
        now.return_value = self.now
        connection, cursor = self.database([{'user_id': 7}, self.schedule], [{'appointment_datetime': datetime(2026, 11, 9, 9), 'appointment_status': 'confirmed'}])
        db.return_value = connection
        response = self.client.get('/api/advisors/7/availability?date=2026-11-09', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('2026-11-09T09:00', response.json['slots'])
        self.assertNotIn('student_id', response.json)

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_find_next_date_skips_closed_blocked_and_fully_booked_days(self, db, now):
        now.return_value = datetime(2026, 11, 9, 18)  # Today's Monday hours have ended.
        self.schedule['availability'][1].update(enabled=True, start_time='09:00', end_time='10:00')
        self.schedule['availability'][2].update(enabled=True, start_time='09:00', end_time='10:00')
        self.schedule['availability'][3].update(enabled=True, start_time='10:00', end_time='11:00')
        self.schedule['blocked_dates'] = [{'date': '2026-11-10', 'reason': 'Leave'}]
        booked = [{'appointment_datetime': datetime(2026, 11, 11, 9), 'appointment_status': 'confirmed', 'duration_minutes': 60}]
        connection, cursor = self.database([{'user_id': 7}, self.schedule], booked)
        db.return_value = connection
        response = self.client.get('/api/advisors/7/availability?date=2026-11-09&find_next=true', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['date'], '2026-11-12')
        self.assertEqual(response.json['slots'], ['2026-11-12T10:00', '2026-11-12T10:30'])
        self.assertTrue(response.json['searched_next'])
        self.assertEqual(len([call for call in cursor.execute.call_args_list if 'FROM appointment' in call.args[0]]), 2)

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_view_specific_date_does_not_automatically_change_the_date(self, db, now):
        now.return_value = datetime(2026, 11, 9, 18)
        connection, cursor = self.database([{'user_id': 7}, self.schedule])
        db.return_value = connection
        response = self.client.get('/api/advisors/7/availability?date=2026-11-09', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['date'], '2026-11-09')
        self.assertFalse(response.json['searched_next'])
        self.assertEqual(response.json['slots'], [])

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_next_date_search_stays_within_booking_horizon(self, db, now):
        now.return_value = self.now
        self.schedule['published'] = True
        self.schedule['availability'][0]['enabled'] = False
        connection, cursor = self.database([{'user_id': 7}, self.schedule])
        db.return_value = connection
        response = self.client.get('/api/advisors/7/availability?date=2026-11-09&find_next=true', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['slots'], [])
        self.assertLessEqual(date.fromisoformat(response.json['date']), self.now.date() + timedelta(days=90))

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_booking_uses_signed_student_and_locks_before_checking(self, db, now):
        now.return_value = self.now
        connection, cursor = self.database([{'user_id': 7}, {'student_id': 11}, self.schedule, {'appointment_id': 25}])
        db.return_value = connection
        with patch('advisor_scheduling.malaysia_now', return_value=self.now):
            response = self.client.post('/api/advisors/7/appointments', headers=self.student,
                json={'appointment_datetime': '2026-11-09T09:00', 'student_id': 999})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['appointment_status'], 'pending')
        self.assertEqual(response.json['appointment_datetime'], '2026-11-09T09:00:00+08:00')
        self.assertEqual(response.json['duration_minutes'], 30)
        self.assertEqual(cursor.execute.call_args.args[1], (11, 7, datetime(2026, 11, 9, 9), 30, '', ''))
        queries = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertIn('FOR UPDATE', queries[0])
        self.assertIn('FOR UPDATE', queries[1])

    @patch('routes.advisor_scheduling.malaysia_now')
    @patch('routes.advisor_scheduling.get_db_connection')
    def test_taken_slot_returns_conflict_without_insert(self, db, now):
        now.return_value = self.now
        connection, cursor = self.database([{'user_id': 7}, {'student_id': 11}, self.schedule],
            [{'appointment_datetime': datetime(2026, 11, 9, 9), 'appointment_status': 'pending'}])
        db.return_value = connection
        with patch('advisor_scheduling.malaysia_now', return_value=self.now):
            response = self.client.post('/api/advisors/7/appointments', headers=self.student, json={'appointment_datetime': '2026-11-09T09:00'})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(any('INSERT INTO appointment' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.advisor_scheduling.get_db_connection')
    def test_booking_rejects_invalid_and_unauthenticated_requests(self, db):
        self.assertEqual(self.client.post('/api/advisors/7/appointments', json={}).status_code, 401)
        for data in [None, [], {}, {'appointment_datetime': 'invalid'}, {'appointment_datetime': '2026-11-09T09:00+08:00'}]:
            self.assertEqual(self.client.post('/api/advisors/7/appointments', headers=self.student, json=data).status_code, 400)
        db.assert_not_called()

    @patch('routes.advisor_scheduling.get_db_connection')
    def test_appointment_list_ignores_forged_student_id(self, db):
        connection, cursor = self.database([])
        cursor.fetchall.return_value = [{'appointment_id': 1, 'appointment_datetime': datetime(2026, 11, 9, 9)}]
        db.return_value = connection
        response = self.client.get('/api/advisors/my-appointments?student_id=999', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(cursor.execute.call_args.args[1], (11,))
        self.assertEqual(response.json[0]['appointment_datetime'], '2026-11-09T09:00:00+08:00')

    @patch('routes.advisor_scheduling.get_db_connection', side_effect=RuntimeError('secret database info'))
    def test_database_errors_do_not_disclose_credentials(self, db):
        response = self.client.get('/api/advisors/my-appointments', headers=self.student)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('secret', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
