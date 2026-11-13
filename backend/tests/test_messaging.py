from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token


class MessagingTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.student = self.auth(11, 'student')
        self.advisor = self.auth(7, 'advisor')
        self.conversation = {'conversation_id': 5, 'contact_id': 7, 'contact_name': 'Advisor',
                             'contact_role': 'advisor', 'contact_active': True}

    def auth(self, user_id, role):
        return {'Authorization': 'Bearer ' + issue_access_token({'user_id': user_id, 'role': role})}

    def database(self, db, rows):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = rows
        cursor.fetchall.return_value = []
        db.return_value = connection
        return connection, cursor

    @patch('routes.messaging.get_db_connection')
    def test_authentication_precedes_all_database_access(self, db):
        for path in ['/api/messages/conversations', '/api/messages/contacts', '/api/messages/conversations/5']:
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.get(path, headers=self.auth(3, 'sponsor')).status_code, 403)
        self.assertEqual(self.client.post('/api/messages/conversations/5/messages', json={'message_text': 'Hello'}).status_code, 401)
        self.assertEqual(self.client.patch('/api/messages/conversations/5/read', json={'up_to_message_id': 9}).status_code, 401)
        db.assert_not_called()

    @patch('routes.advisors.get_db_connection')
    def test_legacy_advisor_routes_cannot_be_impersonated(self, db):
        self.assertEqual(self.client.get('/api/advisors/7/messages').status_code, 401)
        self.assertEqual(self.client.get('/api/advisors/7/messages', headers=self.auth(8, 'advisor')).status_code, 403)
        self.assertEqual(self.client.post('/api/advisors/7/messages/5', headers=self.student, json={'message_text': 'Forged'}).status_code, 403)
        db.assert_not_called()

    @patch('routes.messaging.get_db_connection')
    def test_disabled_account_is_rejected_even_with_valid_token(self, db):
        self.database(db, [None])
        self.assertEqual(self.client.get('/api/messages/conversations', headers=self.student).status_code, 403)

    @patch('routes.messaging.get_db_connection')
    def test_each_role_can_only_choose_opposite_role_contacts(self, db):
        for headers, expected in [(self.student, 'advisor'), (self.advisor, 'student')]:
            _, cursor = self.database(db, [{'user_id': 11}])
            response = self.client.get('/api/messages/contacts', headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(cursor.execute.call_args.args[1], (expected,))

    @patch('routes.messaging.get_db_connection')
    def test_inbox_appointment_filter_and_count_use_the_signed_accounts_bookings(self, db):
        for headers, user_id, column in [(self.student, 11, 'student_id'), (self.advisor, 7, 'advisor_id')]:
            _, cursor = self.database(db, [{'user_id': user_id}])
            cursor.fetchall.side_effect = [
                [{'conversation_id': 1, 'contact_id': 20, 'unread_count': 2},
                 {'conversation_id': 2, 'contact_id': 21, 'unread_count': 0}],
                [{'contact_id': 20, 'upcoming_count': 3}],
            ]
            response = self.client.get('/api/messages/conversations?user_id=999', headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['appointment_count'], 3)
            self.assertEqual(response.json['unread_count'], 2)
            self.assertTrue(response.json['conversations'][0]['has_appointment'])
            self.assertFalse(response.json['conversations'][1]['has_appointment'])
            query, params = cursor.execute.call_args.args
            self.assertIn(f'WHERE {column} = %s', query)
            self.assertEqual(params[1], user_id)

    @patch('routes.messaging.get_db_connection')
    def test_existing_pair_reuses_thread_and_takes_transaction_lock(self, db):
        _, cursor = self.database(db, [{'user_id': 11}, {'user_id': 7}, {'conversation_id': 5}])
        response = self.client.post('/api/messages/conversations', headers=self.student, json={'contact_id': 7})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['conversation_id'], 5)
        queries = [call.args[0] for call in cursor.execute.call_args_list]
        self.assertTrue(any('pg_advisory_xact_lock' in query for query in queries))
        self.assertFalse(any('INSERT' in query for query in queries))

    @patch('routes.messaging.get_db_connection')
    def test_new_thread_contains_only_signed_user_and_selected_recipient(self, db):
        _, cursor = self.database(db, [{'user_id': 11}, {'user_id': 7}, None, {'conversation_id': 5}])
        response = self.client.post('/api/messages/conversations', headers=self.student,
                                    json={'contact_id': 7, 'sender_id': 999})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(cursor.execute.call_args.args[1], (5, 11, 5, 7))

    @patch('routes.messaging.get_db_connection')
    def test_invalid_recipient_does_not_create_thread(self, db):
        _, cursor = self.database(db, [{'user_id': 11}, None])
        response = self.client.post('/api/messages/conversations', headers=self.student, json={'contact_id': 999})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(any('INSERT' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.messaging.get_db_connection')
    def test_nonparticipant_cannot_read_send_or_mark_read(self, db):
        for method, path, body in [('get', '/api/messages/conversations/5', None),
                                   ('post', '/api/messages/conversations/5/messages', {'message_text': 'Hello'}),
                                   ('patch', '/api/messages/conversations/5/read', {'up_to_message_id': 8})]:
            _, cursor = self.database(db, [{'user_id': 11}, None])
            response = getattr(self.client, method)(path, headers=self.student, json=body)
            self.assertEqual(response.status_code, 404)
            self.assertFalse(any('INSERT' in call.args[0] or 'UPDATE' in call.args[0] for call in cursor.execute.call_args_list))
            membership_query = cursor.execute.call_args.args
            self.assertEqual(membership_query[1], (11, 11, 'advisor', 5))

    @patch('routes.messaging.get_db_connection')
    def test_send_uses_signed_identity_and_returns_timezone_aware_timestamp(self, db):
        row = {'message_id': 8, 'sent_at': datetime(2026, 11, 3, 12, tzinfo=timezone.utc)}
        _, cursor = self.database(db, [{'user_id': 11}, self.conversation, row])
        response = self.client.post('/api/messages/conversations/5/messages', headers=self.student,
                                    json={'message_text': '  Hello\nAdvisor  ', 'sender_id': 999})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(cursor.execute.call_args.args[1], (5, 11, 'Hello\nAdvisor'))
        self.assertEqual(response.json['message']['sent_at'], '2026-11-03T12:00:00+00:00')

    @patch('routes.messaging.get_db_connection')
    def test_blank_nontext_and_oversized_messages_are_rejected(self, db):
        for body in [None, [], {}, {'message_text': '   '}, {'message_text': 1}, {'message_text': 'x' * 5001}]:
            _, cursor = self.database(db, [{'user_id': 11}])
            response = self.client.post('/api/messages/conversations/5/messages', headers=self.student, json=body)
            self.assertEqual(response.status_code, 400)
            self.assertFalse(any('INSERT' in call.args[0] for call in cursor.execute.call_args_list))

    @patch('routes.messaging.get_db_connection')
    def test_inactive_recipient_preserves_history_but_cannot_receive_new_messages(self, db):
        self.database(db, [{'user_id': 11}, {**self.conversation, 'contact_active': False}])
        response = self.client.post('/api/messages/conversations/5/messages', headers=self.student, json={'message_text': 'Hello'})
        self.assertEqual(response.status_code, 409)

    @patch('routes.messaging.get_db_connection')
    def test_read_receipts_only_update_incoming_messages_through_last_seen(self, db):
        _, cursor = self.database(db, [{'user_id': 11}, self.conversation])
        response = self.client.patch('/api/messages/conversations/5/read', headers=self.student,
                                     json={'up_to_message_id': 8, 'user_id': 999})
        self.assertEqual(response.status_code, 200)
        query, params = cursor.execute.call_args.args
        self.assertIn('sender_id <> %s', query)
        self.assertIn('message_id <= %s', query)
        self.assertEqual(params, (5, 11, 8))

    @patch('routes.messaging.get_db_connection')
    def test_thread_pagination_is_bounded_and_returns_chronological_messages(self, db):
        _, cursor = self.database(db, [{'user_id': 11}, self.conversation])
        cursor.fetchall.return_value = [{'message_id': value} for value in range(101, 0, -1)]
        response = self.client.get('/api/messages/conversations/5?before=200', headers=self.student)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['has_more'])
        self.assertEqual(len(response.json['messages']), 100)
        self.assertEqual(response.json['messages'][0]['message_id'], 2)
        self.assertEqual(response.json['messages'][-1]['message_id'], 101)

    @patch('routes.messaging.get_db_connection', side_effect=RuntimeError('private database credentials'))
    def test_database_error_is_sanitized(self, db):
        response = self.client.get('/api/messages/conversations', headers=self.student)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
