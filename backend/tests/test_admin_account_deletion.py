from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock
from psycopg2.errors import ForeignKeyViolation

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from account_deletion import has_linked_records
from security import issue_access_token


class AdminAccountDeletionTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.admin.get_db_connection'))
        self.linked = self.enterContext(patch('routes.admin.has_linked_records', return_value=False))
        self.connection = self.connect.return_value
        self.cursor = self.connection.cursor.return_value
        self.cursor.fetchone.return_value = {'user_id': 11, 'role': 'student'}
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'admin'})}

    def delete(self, payload=None, headers=None, user_id=11):
        return self.client.delete(f'/api/admin/users/{user_id}', json=payload if payload is not None else {'confirm_user_id': user_id}, headers=self.headers if headers is None else headers)

    def test_requires_admin_and_explicit_confirmation(self):
        self.assertEqual(self.delete(headers={}).status_code, 401)
        for role in ('student', 'sponsor', 'advisor'):
            headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': role})}
            self.assertEqual(self.delete(headers=headers).status_code, 403)
        for payload in ({}, {'confirm_user_id': 12}, {'confirm_user_id': '11'}):
            self.assertEqual(self.delete(payload).status_code, 400)
        self.connect.assert_not_called()

    def test_cannot_delete_own_administrator_account(self):
        self.assertEqual(self.delete(user_id=1).status_code, 403)
        self.connect.assert_not_called()

    def test_deletes_unlinked_account_and_records_actor_in_audit_log(self):
        self.assertEqual(self.delete().status_code, 200)
        queries = self.cursor.execute.call_args_list
        self.assertIn('delete from student', queries[2].args[0])
        self.assertIn('delete from app_user', queries[3].args[0])
        self.assertEqual(queries[3].args[1], (11,))
        self.assertIn('audit_log', queries[4].args[0])
        self.assertEqual(queries[4].args[1][0], 1)
        self.connection.commit.assert_called_once()
        self.connection.rollback.assert_not_called()

    def test_linked_records_block_deletion_without_modification(self):
        self.linked.return_value = True
        response = self.delete()
        self.assertEqual(response.status_code, 409)
        self.assertIn('Disable', response.json['error'])
        self.assertFalse(any('delete from' in c.args[0] for c in self.cursor.execute.call_args_list))
        self.connection.commit.assert_not_called()
        self.connection.rollback.assert_called_once()

    def test_missing_account_returns_not_found(self):
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.delete().status_code, 404)
        self.connection.commit.assert_not_called()

    def test_foreign_key_failure_rolls_back_whole_deletion(self):
        self.cursor.execute.side_effect = [None, None, None, ForeignKeyViolation()]
        self.assertEqual(self.delete().status_code, 409)
        self.connection.rollback.assert_called_once()
        self.connection.commit.assert_not_called()

    def test_audit_failure_also_rolls_back_deletion(self):
        self.cursor.execute.side_effect = [None, None, None, None, RuntimeError('private details')]
        response = self.delete()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private details', response.get_data(as_text=True))
        self.connection.rollback.assert_called_once()


class DeletionDependencyTests(unittest.TestCase):
    def test_checks_referencing_rows_even_for_cascading_foreign_keys(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [{'schema_name': 'public', 'table_name': 'application', 'column_name': 'student_id', 'key_count': 1}]
        cursor.fetchone.return_value = {'exists': 1}
        self.assertTrue(has_linked_records(cursor, 'student', 11))
        self.assertEqual(cursor.execute.call_args.args[1], (11,))

    def test_only_role_profile_is_ignored_when_checking_account_dependencies(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [{'schema_name': 'public', 'table_name': 'student', 'column_name': 'student_id', 'key_count': 1}]
        self.assertFalse(has_linked_records(cursor, 'app_user', 11, ignored_table='student'))
        self.assertEqual(cursor.execute.call_count, 1)

    def test_empty_linked_tables_allow_deletion(self):
        cursor = MagicMock()
        cursor.fetchall.return_value = [{'schema_name': 'public', 'table_name': 'application', 'column_name': 'student_id', 'key_count': 1}]
        cursor.fetchone.return_value = None
        self.assertFalse(has_linked_records(cursor, 'student', 11))


if __name__ == '__main__':
    unittest.main()
