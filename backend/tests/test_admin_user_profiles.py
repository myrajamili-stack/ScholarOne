from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from psycopg2.errors import UniqueViolation

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from admin_user_profiles import validate_user_update


class AdminUserProfileTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.admin.get_db_connection'))
        self.connection = self.connect.return_value
        self.cursor = self.connection.cursor.return_value
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}

    def update(self, payload, headers=None):
        return self.client.patch('/api/admin/users/11', json=payload, headers=self.headers if headers is None else headers)

    def test_only_admin_can_update_existing_user(self):
        self.assertEqual(self.update({'full_name': 'New Name'}, {}).status_code, 401)
        for role in ('student', 'advisor', 'sponsor'):
            headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': role})}
            self.assertEqual(self.update({'full_name': 'New Name'}, headers).status_code, 403)
        self.connect.assert_not_called()

    def test_invalid_fields_never_open_profile_database(self):
        for payload in ({}, [], {'full_name': ' '}, {'full_name': 'Ali123'}, {'full_name': 12},
                        {'email': 'bad'}, {'phone_number': 'letters'}, {'phone_number': '123'},
                        {'website': 'javascript:alert(1)'}, {'website': 'https://['},
                        {'qualification': 'x' * 151}, {'status': 'active'}, {'role': 'admin'},
                        {'password': 'newpassword'}, {'role_level': 'superadmin'}, {'organization_type': 'invalid'}):
            with self.subTest(payload=payload):
                self.assertEqual(self.update(payload).status_code, 400)
        self.connect.assert_not_called()

    def test_each_role_can_have_its_existing_information_updated(self):
        fields = {'student': {'university': 'Example University'}, 'advisor': {'qualification': 'PhD'},
                  'sponsor': {'organization_name': 'Example Foundation'}, 'admin': {'department': 'Support'}}
        for role, details in fields.items():
            self.connection.reset_mock()
            self.cursor.fetchone.side_effect = [{'user_id': 11, 'role': role}, None, {f'{role}_id': 11},
                                                {'user_id': 11, 'role': role, 'full_name': 'New Name', 'email': 'new@example.com', 'phone_number': '+60123456789'}]
            response = self.update({'full_name': ' New Name ', 'email': ' New@Example.COM ', 'phone_number': '+60 12-345 6789', **details})
            with self.subTest(role=role):
                self.assertEqual(response.status_code, 200, response.json)
                self.assertEqual(response.json['user']['email'], 'new@example.com')
                self.assertEqual(response.json['user'][next(iter(details))], next(iter(details.values())))
                self.connection.commit.assert_called_once()
                calls = self.cursor.execute.call_args_list
                self.assertIn('update app_user', calls[2].args[0])
                self.assertEqual(calls[2].args[1], ('new@example.com', 'New Name', '+60123456789', 11))
                self.assertIn('audit_log', calls[-1].args[0])
                self.assertEqual(calls[-1].args[1][0], 1)
                self.assertNotIn('password', response.json['user'])

    def test_duplicate_email_preserves_existing_data(self):
        self.cursor.fetchone.side_effect = [{'user_id': 11, 'role': 'student'}, {'user_id': 12}]
        self.assertEqual(self.update({'email': 'existing@example.com'}).status_code, 409)
        self.assertFalse(any('update ' in call.args[0].lower() for call in self.cursor.execute.call_args_list))
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_unique_constraint_conflict_is_rolled_back(self):
        self.cursor.fetchone.side_effect = [{'user_id': 11, 'role': 'student'}, None]
        self.cursor.execute.side_effect = [None, None, UniqueViolation()]
        self.assertEqual(self.update({'email': 'existing@example.com'}).status_code, 409)
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_missing_account_or_wrong_role_fields_do_not_update(self):
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.update({'full_name': 'New Name'}).status_code, 404)
        self.cursor.fetchone.return_value = {'user_id': 11, 'role': 'student'}
        self.assertEqual(self.update({'organization_name': 'Company'}).status_code, 400)
        self.connection.commit.assert_not_called()

    def test_missing_role_profile_rolls_back_common_information(self):
        self.cursor.fetchone.side_effect = [{'user_id': 11, 'role': 'student'}, None]
        response = self.update({'full_name': 'New Name', 'university': 'New University'})
        self.assertEqual(response.status_code, 409)
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_database_failure_rolls_back_without_leaking_private_information(self):
        self.cursor.fetchone.return_value = {'user_id': 11, 'role': 'student'}
        self.cursor.execute.side_effect = [None, RuntimeError('private database credentials')]
        response = self.update({'full_name': 'New Name'})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private database credentials', response.get_data(as_text=True))
        self.connection.rollback.assert_called_once()
        self.connection.commit.assert_not_called()

    def test_optional_fields_can_be_cleared_and_names_keep_valid_punctuation(self):
        clean, error = validate_user_update({'full_name': "Anne-Marie O'Neill", 'phone_number': '', 'university': None}, 'student')
        self.assertIsNone(error)
        self.assertIsNone(clean['phone_number'])
        self.assertIsNone(clean['university'])


if __name__ == '__main__':
    unittest.main()
