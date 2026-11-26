"""Exercise real account guards; database records and tokens are isolated test data."""
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

from flask import Flask, g

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import (issue_access_token, student_access_required, advisor_access_required,
                      admin_access_required, sponsor_access_required, messaging_access_required)
from routes.messaging import messaging_endpoint


class AccountRestrictionTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.testing = True
        self.app.add_url_rule('/student/<int:student_id>', endpoint='student', view_func=student_access_required(lambda student_id: {'ok': True}))
        self.app.add_url_rule('/advisor/<int:advisor_id>', endpoint='advisor', view_func=advisor_access_required(lambda advisor_id: {'ok': True}))
        self.app.add_url_rule('/admin', endpoint='admin', view_func=admin_access_required(lambda: {'ok': True}))
        self.app.add_url_rule('/sponsor/<int:sponsor_id>', endpoint='sponsor', view_func=sponsor_access_required(lambda sponsor_id: {'ok': True}))
        self.app.add_url_rule('/messages', endpoint='messages', view_func=messaging_endpoint(lambda: {'ok': True}))
        self.client = self.app.test_client()
        self.connect = self.enterContext(patch('db.get_db_connection'))
        # Messaging imports its own connection factory.
        self.enterContext(patch('routes.messaging.get_db_connection', self.connect))
        self.connection = self.connect.return_value
        self.cursor = self.connection.cursor.return_value.__enter__.return_value

    def headers(self, role, user_id=11):
        return {'Authorization': 'Bearer ' + issue_access_token({'user_id': user_id, 'role': role})}

    def cases(self):
        return [('student', '/student/11'), ('advisor', '/advisor/11'), ('admin', '/admin'),
                ('sponsor', '/sponsor/11'), ('student', '/messages'), ('advisor', '/messages')]

    def test_active_accounts_are_allowed(self):
        for role, url in self.cases():
            self.cursor.fetchone.return_value = {'status': 'active', 'user_id': 11}
            with self.subTest(role=role, url=url):
                self.assertEqual(self.client.get(url, headers=self.headers(role)).status_code, 200)
                self.assertEqual(self.cursor.execute.call_args.args[1][0], 11)

    def test_existing_tokens_stop_working_when_account_is_restricted_or_deleted(self):
        for role, url in self.cases():
            headers = self.headers(role)
            # Same token succeeds before restriction and fails on the next request.
            self.cursor.fetchone.return_value = {'status': 'active', 'user_id': 11}
            self.assertEqual(self.client.get(url, headers=headers).status_code, 200)
            for status in ('disabled', 'suspended', 'pending', 'rejected', ''):
                self.cursor.fetchone.return_value = {'status': status} if url != '/messages' else None
                with self.subTest(role=role, url=url, status=status):
                    self.assertEqual(self.client.get(url, headers=headers).status_code, 403)
            self.cursor.fetchone.return_value = None
            self.assertEqual(self.client.get(url, headers=headers).status_code, 403)

    def test_current_role_is_part_of_account_lookup(self):
        for role, url in self.cases():
            self.cursor.fetchone.return_value = None  # No account with the token's old role.
            self.assertEqual(self.client.get(url, headers=self.headers(role)).status_code, 403)
            query, values = self.cursor.execute.call_args.args
            self.assertIn('role', query)
            if role == 'sponsor':
                self.assertIn("role = 'sponsor'", query)
            else:
                self.assertEqual(values, (11, role))

    def test_database_failure_denies_access_without_leaking_details(self):
        self.connect.side_effect = RuntimeError('private connection credentials')
        for role, url in self.cases():
            response = self.client.get(url, headers=self.headers(role))
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('private connection credentials', response.get_data(as_text=True))

    def test_bad_tokens_and_wrong_owner_are_rejected_before_account_lookup(self):
        for role, url in self.cases():
            self.assertEqual(self.client.get(url).status_code, 401)
            self.assertEqual(self.client.get(url, headers={'Authorization': 'Bearer tampered'}).status_code, 401)
        for role, url in [('student', '/student/12'), ('advisor', '/advisor/12'), ('sponsor', '/sponsor/12')]:
            self.assertEqual(self.client.get(url, headers=self.headers(role)).status_code, 403)
        self.connect.assert_not_called()

    def test_nested_guards_reuse_lookup_only_within_one_request(self):
        self.cursor.fetchone.return_value = {'status': 'active'}
        @student_access_required
        @student_access_required
        def nested():
            return {'student_id': g.student_id}
        self.app.add_url_rule('/nested', view_func=nested)
        for _ in range(2):
            self.assertEqual(self.client.get('/nested', headers=self.headers('student')).status_code, 200)
        self.assertEqual(self.connect.call_count, 2)


class RoutePermissionMatrixTests(unittest.TestCase):
    def test_all_private_routes_block_restricted_accounts_with_existing_tokens(self):
        client = create_app().test_client()
        with patch('db.get_db_connection') as database, patch('routes.messaging.get_db_connection') as messaging_database:
            cursor = database.return_value.cursor.return_value.__enter__.return_value
            messaging_database.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = None
            for rule in client.application.url_map.iter_rules():
                for method in rule.methods - {'OPTIONS', 'HEAD'}:
                    roles = self.required_roles(rule.rule, method)
                    if not roles:
                        continue
                    url = rule.build({key: 11 for key in rule.arguments})[1]
                    for role in roles:
                        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': role})}
                        for status in ('disabled', 'suspended', 'pending'):
                            cursor.fetchone.return_value = {'status': status}
                            with self.subTest(url=url, method=method, role=role, status=status):
                                self.assertEqual(client.open(url, method=method, json={}, headers=headers).status_code, 403)
            # Guard lookups must only read account status, never mutate data.
            self.assertTrue(database.called)
            for call in cursor.execute.call_args_list:
                self.assertTrue(call.args[0].strip().lower().startswith('select status from app_user'))

    def test_all_private_routes_reject_anonymous_and_wrong_role_requests(self):
        app = create_app()
        client = app.test_client()
        checked = 0
        with patch('db.get_db_connection') as database:
            for rule in app.url_map.iter_rules():
                path = rule.rule
                for method in rule.methods - {'OPTIONS', 'HEAD'}:
                    roles = self.required_roles(path, method)
                    if not roles:
                        continue
                    values = {key: 11 for key in rule.arguments}
                    url = rule.build(values)[1]
                    with self.subTest(path=path, method=method):
                        self.assertEqual(client.open(url, method=method, json={}).status_code, 401)
                        for role in {'student', 'advisor', 'sponsor', 'admin'} - roles:
                            token = issue_access_token({'user_id': 11, 'role': role})
                            response = client.open(url, method=method, json={}, headers={'Authorization': 'Bearer ' + token})
                            self.assertEqual(response.status_code, 403)
                    checked += 1
            database.assert_not_called()
        self.assertGreater(checked, 60)

    @staticmethod
    def required_roles(path, method):
        if path in {'/api/advisors', '/api/scholarships/recommendations', '/api/auth/student/password'} or (path.startswith('/api/scholarships/') and path.endswith('/view')):
            return {'student'}
        if path.startswith('/api/admin/'):
            return {'admin'}
        if path.startswith('/api/sponsors/'):
            return {'sponsor'}
        if path.startswith('/api/notifications'):
            return {'student','advisor','sponsor','admin'}
        if path.startswith('/api/messages/'):
            return {'student', 'advisor'}
        if path.startswith('/api/quizzes/advisor/'):
            return {'advisor'}
        if path.startswith('/api/students/') and '/profile-photos/' not in path:
            return {'student'}
        if path.startswith('/api/applications') or path.startswith('/api/appointments/') or path.startswith('/api/pathways') or path.startswith('/api/scholarship-reminders') or '/attempts' in path or path.endswith('/eligibility') or path.endswith('/take'):
            return {'student'}
        if path.startswith('/api/advisors/') and '/profile-photos/' not in path:
            if path.endswith('/availability') or path.endswith('/my-appointments') or (path.endswith('/appointments') and method == 'POST'):
                return {'student'}
            return {'advisor'}
        public = {
            ('GET', '/static/<path:filename>'), ('GET', '/api/health'), ('GET', '/api/db-test'),
            ('GET', '/api/calendar/deadlines'), ('GET', '/api/quizzes'), ('GET', '/api/scholarships'),
            ('GET', '/api/scholarships/<int:scholarship_id>'),
            ('GET', '/api/advisors/profile-photos/<filename>'), ('GET', '/api/students/profile-photos/<filename>'),
            ('POST', '/api/auth/register'), ('POST', '/api/auth/login'), ('POST', '/api/auth/provider-resubmission'),
            ('POST', '/api/billing/stripe/webhook'),
        }
        if (method, path) not in public:
            raise AssertionError(f"Classify permissions for {method} {path}")
        return set()


if __name__ == '__main__':
    unittest.main()
