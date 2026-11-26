from datetime import datetime, timedelta, date
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app import create_app
from security import issue_access_token
from appointment_workflows import validate_transition
from advisor_scheduling import available_slots, empty_schedule


class AppointmentWorkflowTests(TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.enterContext(patch('routes.notifications.verify_active_account', return_value=None))
        self.client = create_app().test_client()
        self.student = self.auth(11, 'student')
        self.advisor = self.auth(7, 'advisor')
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.enterContext(patch('routes.appointment_actions.get_db_connection', return_value=self.connection))
        self.enterContext(patch('routes.notifications.get_db_connection', return_value=self.connection))
        self.now = datetime(2026, 11, 20, 10)
        self.enterContext(patch('routes.appointment_actions.malaysia_now', return_value=self.now))

    def auth(self, user_id, role):
        return {'Authorization': 'Bearer ' + issue_access_token({'user_id': user_id, 'role': role})}

    def appointment(self, status='confirmed', past=False):
        return dict(advisor_id=7, student_id=11, appointment_status=status,
                    appointment_datetime=self.now + timedelta(days=-1 if past else 1), duration_minutes=30)

    def test_cancel_is_owned_and_notifies_both_parties(self):
        self.cursor.fetchone.side_effect = [{'advisor_id': 7}, self.appointment()]
        response = self.client.post('/api/appointments/20/cancel', headers=self.student)
        self.assertEqual(response.status_code, 200, response.json)
        calls = self.cursor.execute.call_args_list
        self.assertEqual(calls[0].args[1], (20, 11))
        self.assertIn('for update', calls[1].args[0])
        self.assertEqual(calls[-1].args[1][::2], (11, 7))
        self.assertIn('Cancelled by student', calls[-1].args[1][1])

    def test_cancel_other_students_appointment_is_not_found(self):
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.client.post('/api/appointments/20/cancel', headers=self.student).status_code, 404)
        self.assertEqual(self.cursor.execute.call_count, 1)

    def test_terminal_and_past_appointments_cannot_be_cancelled(self):
        for status, past in [('completed', True), ('rejected', False), ('confirmed', True)]:
            with self.subTest(status=status, past=past):
                self.cursor.reset_mock()
                self.cursor.fetchone.side_effect = [{'advisor_id': 7}, self.appointment(status, past)]
                self.assertEqual(self.client.post('/api/appointments/20/cancel', headers=self.student).status_code, 409)
                self.assertFalse(any('update appointment' in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_cancel_retry_does_not_duplicate_notifications(self):
        self.cursor.fetchone.side_effect = [{'advisor_id': 7}, self.appointment('cancelled')]
        self.assertEqual(self.client.post('/api/appointments/20/cancel', headers=self.student).status_code, 200)
        self.assertFalse(any('notification' in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_review_requires_completed_past_session(self):
        for status, past in [('pending', True), ('confirmed', True), ('cancelled', True), ('rejected', True), ('completed', False)]:
            with self.subTest(status=status, past=past):
                self.cursor.fetchone.side_effect = [self.appointment(status, past), None]
                self.assertEqual(self.client.post('/api/appointments/20/review', headers=self.student, json={'rating': 5}).status_code, 409)

    def test_review_validates_rating_and_comment(self):
        for payload in [{}, {'rating': True}, {'rating': 0}, {'rating': 6}, {'rating': '5'}, {'rating': 5, 'comment': []}, {'rating': 5, 'comment': 'x'*2001}, {'rating': 5, 'student_id': 9}]:
            with self.subTest(payload=str(payload)[:60]):
                self.assertEqual(self.client.post('/api/appointments/20/review', headers=self.student, json=payload).status_code, 400)
        self.cursor.execute.assert_not_called()

    def test_review_cannot_target_someone_elses_appointment(self):
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.client.post('/api/appointments/20/review', headers=self.student, json={'rating': 5}).status_code, 404)
        self.assertEqual(self.cursor.execute.call_args.args[1], (20, 11))

    def test_one_review_per_completed_appointment(self):
        self.cursor.fetchone.side_effect = [self.appointment('completed', True), {'review_id': 1}]
        self.assertEqual(self.client.post('/api/appointments/20/review', headers=self.student, json={'rating': 5}).status_code, 409)

    def test_review_save_and_reload_and_advisor_notification(self):
        review = dict(review_id=1, rating=5, comment='Helpful', created_at=self.now)
        self.cursor.fetchone.side_effect = [self.appointment('completed', True), None, review]
        response = self.client.post('/api/appointments/20/review', headers=self.student, json={'rating': 5, 'comment': ' Helpful '})
        self.assertEqual(response.status_code, 201, response.json)
        insert = next(call for call in self.cursor.execute.call_args_list if 'insert into review' in call.args[0])
        self.assertEqual(insert.args[1], (11, 7, 20, 5, 'Helpful'))
        self.assertIn('advisor_feedback', self.cursor.execute.call_args.args[0])
        self.cursor.fetchone.side_effect = [self.appointment('completed', True), review]
        self.assertEqual(self.client.get('/api/appointments/20/review', headers=self.student).json['review']['comment'], 'Helpful')

    def test_notification_reads_are_owner_scoped(self):
        self.cursor.fetchone.return_value = {'total': 1}
        self.cursor.fetchall.side_effect = [[], [{'notification_id': 4, 'message': 'Booking', 'is_read': False}]]
        response = self.client.get('/api/notifications', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['unread'], 1)
        reads = [call.args[1] for call in self.cursor.execute.call_args_list if 'from notification where user_id=' in ' '.join(call.args[0].split())]
        self.assertEqual(reads, [(11,), (11,)])

    def test_notification_update_is_owner_scoped(self):
        self.cursor.fetchone.return_value = None
        response = self.client.patch('/api/notifications/4', headers=self.student, json={'is_read': True})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.cursor.execute.call_args.args[1], (True, 4, 11))

    def test_notification_update_requires_boolean(self):
        self.assertEqual(self.client.patch('/api/notifications/4', headers=self.student, json={'is_read': 'true'}).status_code, 400)

    def test_database_failure_does_not_expose_details(self):
        self.cursor.execute.side_effect = RuntimeError('private password')
        response = self.client.post('/api/appointments/20/cancel', headers=self.student)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', str(response.json))
        self.connection.__exit__.assert_called()

    def test_advisor_rejection_requires_reason_before_database_access(self):
        with patch('routes.advisors.get_db_connection') as db:
            for reason in ['', '   ', None, [], 'x'*1001]:
                response = self.client.patch('/api/advisors/7/appointments/20/status', headers=self.advisor, json={'status': 'rejected', 'rejection_reason': reason})
                self.assertEqual(response.status_code, 400)
            db.assert_not_called()

    def test_advisor_rejection_saves_reason_and_notifies_student(self):
        cursor = self.connection.cursor.return_value
        cursor.fetchone.side_effect = [{'user_id': 7}, self.appointment('pending'), {'appointment_id': 20}]
        with patch('routes.advisors.get_db_connection', return_value=self.connection):
            response = self.client.patch('/api/advisors/7/appointments/20/status', headers=self.advisor, json={'status': 'rejected', 'rejection_reason': ' Please choose another day. '})
        self.assertEqual(response.status_code, 200, response.json)
        update = next(call for call in cursor.execute.call_args_list if 'update appointment' in call.args[0])
        self.assertEqual(update.args[1], ('rejected', 'Please choose another day.', 20, 7))
        self.assertIn('View the appointment for details', cursor.execute.call_args.args[1][1])
        self.assertNotIn('Please choose another day.', cursor.execute.call_args.args[1][1])
        self.connection.commit.assert_called_once()

    def test_terminal_status_cannot_be_reactivated(self):
        for status in ['cancelled','rejected','completed']:
            self.assertIsNotNone(validate_transition(self.appointment(status), 'confirmed', '', self.now))

    def test_completion_requires_session_end(self):
        self.assertIsNotNone(validate_transition(self.appointment(), 'completed', '', self.now))
        self.assertIsNone(validate_transition(self.appointment(past=True), 'completed', '', self.now))

    def test_rejected_and_cancelled_bookings_release_slots(self):
        schedule = empty_schedule(); schedule['published'] = True
        day = date(2026, 11, 23)
        schedule['availability'][0].update(enabled=True, start_time='09:00', end_time='10:00')
        for status in ['rejected','cancelled']:
            appointments = [dict(appointment_datetime=datetime(2026,11,23,9), appointment_status=status, duration_minutes=30)]
            self.assertIn('2026-11-23T09:00', available_slots(schedule, day, appointments, self.now))
