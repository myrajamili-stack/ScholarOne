from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token

class AdminSettingsTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 12, 'role': 'admin'})}
        self.general = {'section':'general','platform_name':'ScholarOne','platform_tagline':'Your future',
                        'support_email':'support@example.com','support_phone':'+60 12-3456789','platform_description':'Academic guidance'}

    @patch('routes.admin_settings.get_db_connection')
    def test_other_roles_cannot_read_or_change_configuration(self, connect):
        self.assertEqual(self.client.get('/api/admin/settings').status_code,401)
        headers = {'Authorization':'Bearer ' + issue_access_token({'user_id':2,'role':'student'})}
        self.assertEqual(self.client.patch('/api/admin/settings',json=self.general,headers=headers).status_code,403)
        connect.assert_not_called()

    @patch('routes.admin_settings.get_db_connection')
    def test_validation_rejects_letters_in_phone_and_invalid_email(self, connect):
        for changes in [{'support_phone':'0123abc4567'},{'support_email':'broken'},{'platform_name':' '},{'platform_description':'a'*501},{'support_phone':'123'}]:
            self.assertEqual(self.client.patch('/api/admin/settings',json={**self.general,**changes},headers=self.headers).status_code,400)
        connect.assert_not_called()

    @patch('routes.admin_settings.get_db_connection')
    def test_general_settings_upsert_and_saved_values_returned(self, connect):
        result = self.client.patch('/api/admin/settings',json=self.general,headers=self.headers)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.get_json()['general']['platform_name'],'ScholarOne')
        connect.return_value.commit.assert_called_once()
        self.assertIn('on conflict',connect.return_value.cursor.return_value.execute.call_args.args[0])

    @patch('routes.admin_settings.get_db_connection')
    def test_account_update_uses_token_identity_not_request_identity(self, connect):
        connect.return_value.cursor.return_value.fetchone.return_value = {'user_id':12,'full_name':'Admin','email':'admin@example.com','role':'admin'}
        result=self.client.patch('/api/admin/settings',json={'section':'account','user_id':999,'full_name':'Admin','phone_number':'0123456789'},headers=self.headers)
        self.assertEqual(result.status_code,200)
        args=connect.return_value.cursor.return_value.execute.call_args.args[1]
        self.assertEqual(args[2],12)

    @patch('routes.admin_settings.get_db_connection')
    def test_load_combines_defaults_with_saved_configuration(self, connect):
        cursor=connect.return_value.cursor.return_value
        cursor.fetchone.side_effect=[{'configuration_value':{'platform_name':'Saved Name'}},{'user_id':12,'full_name':'Admin'}]
        result=self.client.get('/api/admin/settings',headers=self.headers)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.get_json()['general']['platform_name'],'Saved Name')
        self.assertFalse(result.get_json()['notification_preferences_available'])

    @patch('routes.admin_settings.get_db_connection')
    def test_failed_save_rolls_back(self, connect):
        connect.return_value.cursor.return_value.execute.side_effect=RuntimeError('private details')
        result=self.client.patch('/api/admin/settings',json=self.general,headers=self.headers)
        self.assertEqual(result.status_code,500)
        self.assertNotIn('private details',result.get_data(as_text=True))
        connect.return_value.rollback.assert_called_once()
        connect.return_value.close.assert_called_once()
