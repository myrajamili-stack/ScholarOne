from datetime import date, datetime
import json
from unittest import TestCase
from unittest.mock import MagicMock, patch

from app import create_app
from security import issue_access_token
from notification_delivery import deliver_due_reminders, change_application_status
from scripts.deliver_reminders import deliver_once, run_cycle, run_worker


class NotificationDeliveryTests(TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.enterContext(patch('routes.notifications.verify_active_account', return_value=None))
        self.connection = MagicMock()
        self.cursor = self.connection.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.return_value = {'acquired': True}
        self.enterContext(patch('notification_delivery.get_db_connection', return_value=self.connection))
        self.enterContext(patch('routes.notifications.get_db_connection', return_value=self.connection))

    def auth(self, role, user_id=11):
        return {'Authorization': 'Bearer ' + issue_access_token({'user_id':user_id,'role':role})}

    def test_every_role_can_read_only_its_own_notifications(self):
        for role in ['student','advisor','sponsor','admin']:
            self.cursor.reset_mock()
            self.cursor.fetchone.return_value = {'total': 1}
            self.cursor.fetchall.return_value = []
            response = self.client.get('/api/notifications?user_id=999', headers=self.auth(role))
            self.assertEqual(response.status_code, 200, response.json)
            reads = [call.args[1] for call in self.cursor.execute.call_args_list if 'from notification where user_id=' in ' '.join(call.args[0].split())]
            self.assertEqual(reads, [(11,), (11,)])

    def test_anonymous_and_invalid_roles_are_denied(self):
        self.assertEqual(self.client.get('/api/notifications').status_code, 401)
        self.assertEqual(self.client.get('/api/notifications', headers=self.auth('unknown')).status_code, 403)

    @patch('notification_delivery.malaysia_now', return_value=datetime.fromisoformat('2026-11-24T11:00:00+08:00'))
    def test_reminder_delivery_deduplicates_and_skips_exactly_closed_deadlines(self, clock):
        candidate = dict(student_id=11, scholarship_id=5, title='Award', deadline=date(2026, 11, 24))
        self.cursor.fetchall.return_value = [
            {**candidate, 'import_metadata': {'deadline_at': '2026-11-24T11:01:00'}},
            {**candidate, 'scholarship_id': 6, 'import_metadata': {'deadline_at': '2026-11-24T11:00:00'}},
        ]
        deliver_due_reminders(self.cursor, 11)
        select, dates = self.cursor.execute.call_args_list[0].args
        self.assertIn("lower(s.status) in ('approved', 'active')", select)
        self.assertEqual(dates, (11, 11, date(2026, 11, 24), date(2026, 11, 27)))
        query, values = self.cursor.execute.call_args.args
        self.assertIn('on conflict (user_id,event_key)', query)
        self.assertEqual([row['event_key'] for row in json.loads(values[0])],
                         ['scholarship-deadline:5:2026-11-24T11:01:00+08:00'])

    def test_scheduled_delivery_retries_transient_failures(self):
        connect = MagicMock(side_effect=[RuntimeError('private'), RuntimeError('private'), self.connection])
        pause = MagicMock(); self.cursor.rowcount = 2
        self.cursor.fetchall.return_value = [dict(student_id=11, scholarship_id=5, title='Award', deadline='2026-11-24')]
        with patch('notification_delivery.malaysia_now', return_value=datetime.fromisoformat('2026-11-24T10:00:00+08:00')):
            self.assertEqual(deliver_once(connect,pause), 2)
        self.assertEqual(connect.call_count, 3)
        self.assertEqual([call.args[0] for call in pause.call_args_list], [1,2])

    def test_scheduled_failure_is_bounded_and_sanitized(self):
        connect = MagicMock(side_effect=RuntimeError('private credentials'))
        with self.assertRaisesRegex(RuntimeError, 'after three attempts') as error:
            deliver_once(connect, MagicMock())
        self.assertNotIn('private', str(error.exception))
        self.assertEqual(connect.call_count, 3)

    def test_delivery_failure_rolls_back_before_retry(self):
        self.cursor.execute.side_effect = [RuntimeError('offline'), None, None, None]
        connect=MagicMock(return_value=self.connection)
        deliver_once(connect, MagicMock())
        self.assertIs(self.connection.__exit__.call_args_list[0].args[0], RuntimeError)
        self.assertEqual(self.connection.__exit__.call_args_list[1].args, (None,None,None))

    def test_worker_skips_overlap_and_logs_timestamped_outcomes(self):
        self.cursor.fetchone.return_value = {'acquired': False}
        with patch('scripts.deliver_reminders.deliver_due_reminders') as deliver:
            self.assertIsNone(deliver_once(lambda: self.connection))
            deliver.assert_not_called()
        with patch('builtins.print') as output:
            self.assertTrue(run_cycle(lambda: None))
            self.assertIn('scholarship_reminders overlap_skipped', output.call_args.args[0])
            self.assertTrue(run_cycle(lambda: 0))
            self.assertRegex(output.call_args.args[0], r'^\d{4}-\d{2}-\d{2}T.*\+00:00 scholarship_reminders success delivered=0$')
            self.assertFalse(run_cycle(MagicMock(side_effect=RuntimeError('private detail'))))
            self.assertIn('scholarship_reminders failure attempts=3', output.call_args.args[0])
            self.assertNotIn('private detail', output.call_args.args[0])

    def test_notification_timestamps_and_read_state_are_owner_scoped(self):
        self.cursor.fetchone.return_value = {'total': 1}
        self.cursor.fetchall.return_value = [{'created_at': datetime(2026, 11, 24, 23, 1)}]
        result = self.client.get('/api/notifications', headers=self.auth('advisor'))
        self.assertEqual(result.json['notifications'][0]['created_at'], '2026-11-24T23:01:00+00:00')
        path = '/api/notifications/4'
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.client.patch(path, headers=self.auth('advisor'), json={'is_read': False}).status_code, 404)
        self.assertEqual(self.cursor.execute.call_args.args[1], (False, 4, 11))

    def decision(self, previous='pending', sponsor=7):
        self.cursor.fetchone.side_effect = [dict(application_id=20, student_id=11, sponsor_id=7, title='Example Award', application_status=previous), dict(application_id=20,application_status='approved')]
        with self.client.application.app_context():
            return change_application_status(20, 'approved', 'Well done', actor_id=sponsor, sponsor_id=sponsor)

    def test_approval_notifies_student_and_provider_in_same_transaction(self):
        response = self.decision()
        self.assertEqual(response.status_code, 200)
        inserts=[call for call in self.cursor.execute.call_args_list if 'insert into notification' in call.args[0]]
        self.assertEqual([call.args[1][0] for call in inserts], [11,7])
        self.assertTrue(all('approved' in call.args[1][1] for call in inserts))
        self.assertIn('for update of a', self.cursor.execute.call_args_list[0].args[0])

    def test_approval_retry_does_not_notify_twice(self):
        self.assertEqual(self.decision('approved').status_code, 200)
        self.assertFalse(any('insert into notification' in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_provider_cannot_review_another_providers_application(self):
        self.cursor.fetchone.return_value = None
        with self.client.application.app_context():
            response, code = change_application_status(20, 'approved', None, actor_id=7, sponsor_id=7)
        self.assertEqual(code,404)
        self.assertEqual(self.cursor.execute.call_args.args[1], (20,7,7))

    def test_notification_failure_rolls_back_application_decision(self):
        self.cursor.fetchone.side_effect = [dict(student_id=11,sponsor_id=7,title='Award',application_status='pending'), {'application_id':20}]
        self.cursor.execute.side_effect = [None, None, None, RuntimeError('offline')]
        with self.client.application.app_context():
            response, code = change_application_status(20, 'approved', None, actor_id=7, sponsor_id=7)
        self.assertEqual(code,503)
        self.assertIs(self.connection.__exit__.call_args.args[0], RuntimeError)

    def test_student_cannot_approve_and_advisor_cannot_submit(self):
        self.assertEqual(self.client.patch('/api/admin/applications/20/status',headers=self.auth('student'),json={'status':'approved'}).status_code,403)
        self.assertEqual(self.client.post('/api/applications',headers=self.auth('advisor'),json={'scholarship_id':1}).status_code,403)

    def test_read_failure_returns_retryable_error(self):
        self.cursor.execute.side_effect=RuntimeError('private details')
        response=self.client.get('/api/notifications',headers=self.auth('student'))
        self.assertEqual(response.status_code,503)
        self.assertNotIn('private',str(response.json))

    def test_failed_delivery_is_retried_on_next_inbox_read(self):
        self.cursor.execute.side_effect=RuntimeError('offline')
        self.assertEqual(self.client.get('/api/notifications',headers=self.auth('student')).status_code,503)
        self.cursor.execute.side_effect=None
        self.cursor.fetchone.return_value={'total':1}; self.cursor.fetchall.return_value=[]
        self.assertEqual(self.client.get('/api/notifications',headers=self.auth('student')).status_code,200)

    def test_worker_delivers_before_inbox_access_and_rechecks_changed_deadlines(self):
        instant = datetime.fromisoformat('2026-11-24T08:00:00+08:00')
        listing = {'student_id': 11, 'scholarship_id': 5, 'title': 'Award', 'deadline': date(2026, 11, 24),
                   'status': 'approved', 'import_metadata': {'deadline_at': '2026-11-24T10:00:00+08:00'}}
        subscriptions, inbox = set(), {}
        reminder_cursor = self.cursor

        def execute(query, params=()):
            query = ' '.join(query.lower().split())
            row, rows = None, []
            if query.startswith('set local'):
                pass
            elif query.startswith('select pg_try_advisory_xact_lock'):
                row = {'acquired': True}
            elif query.startswith('select st.student_id'):
                row = {'student_id': params[0]}
            elif query.startswith('select s.scholarship_id'):
                row = dict(listing) if listing['status'].lower() in ('approved', 'active') else None
            elif query.startswith('insert into scholarship_reminder'):
                subscriptions.add(params)
            elif query.startswith('select r.student_id'):
                self.assertIn("lower(s.status) in ('approved', 'active')", query)
                self.assertEqual(params[:2], (11, 11) if inbox_opened else (None, None))
                if (11, 5) in subscriptions and listing['status'].lower() in ('approved', 'active'):
                    rows = [dict(listing)]
            elif query.startswith('insert into notification'):
                inserted = 0
                for candidate in json.loads(params[0]):
                    key = (candidate['student_id'], candidate['event_key'])
                    if key not in inbox:
                        inserted += 1
                        inbox[key] = {'notification_id': len(inbox) + 1, 'message': candidate['message'], 'is_read': False}
                reminder_cursor.rowcount = inserted
            elif query.startswith('select count(*) as total from notification'):
                row = {'total': sum(user_id == params[0] for user_id, _ in inbox)}
            elif 'from notification where user_id=' in query:
                rows = [item for (user_id, _), item in inbox.items() if user_id == params[0]]
            else:
                self.fail(f"Unexpected SQL: {query}")
            reminder_cursor.fetchone.return_value = row
            reminder_cursor.fetchall.return_value = rows

        inbox_opened = False
        reminder_cursor.execute.side_effect = execute
        auth = self.auth('student')
        stop = MagicMock()
        stop.is_set.return_value = False
        counts = []
        revisions = [
            ('approved', '2026-11-24T02:00:00+00:00'),  # Same cutoff in UTC.
            ('active', '2026-11-24T11:30:00+08:00'),    # Same date, new time.
            ('pending', '2026-11-25T12:00:00+08:00'),   # Awaiting reapproval.
            ('ACTIVE', '2026-11-25T12:00:00+08:00'),    # Republished with a new date.
            ('active', '2026-11-29T12:00:00+08:00'),    # Outside the reminder window.
        ]

        def next_tick(interval):
            self.assertEqual(interval, 300)
            if not revisions:
                return True
            listing['status'], cutoff = revisions.pop(0)
            listing['import_metadata'] = {'deadline_at': cutoff}
            return False

        def deliver():
            counts.append(deliver_once(lambda: self.connection))
            return counts[-1]

        stop.wait.side_effect = next_tick
        with (patch('routes.scholarship_reminders.get_db_connection', return_value=self.connection),
              patch('routes.scholarship_reminders.malaysia_now', return_value=instant),
              patch('notification_delivery.malaysia_now', return_value=instant),
              patch('builtins.print')):
            enabled = self.client.put('/api/scholarship-reminders/5', headers=auth)
            self.assertEqual(enabled.status_code, 200, enabled.json)
            run_worker(stop, deliver=deliver)
            self.assertEqual(counts, [1, 0, 1, 0, 1, 0])
            self.assertEqual(len(inbox), 3)
            inbox_opened = True
            response = self.client.get('/api/notifications', headers=auth)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['unread'], 3)
            messages = [notice['message'] for notice in response.json['notifications']]
            self.assertTrue(any('11:30:00 Malaysia time' in message for message in messages))
            self.assertTrue(any('2026-11-25 at 12:00:00' in message for message in messages))
