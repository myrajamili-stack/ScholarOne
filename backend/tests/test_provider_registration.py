from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from werkzeug.security import generate_password_hash

class ProviderRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.payload = dict(full_name='Contact Person', email='provider@example.com', password='Example123', confirm_password='Example123', phone_number='+60123456789', role='sponsor', organization_name='Example Foundation', organization_type='Foundation', website='https://example.com')
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'sponsor'})}

    @patch('routes.auth.get_db_connection')
    def test_registration_is_pending_and_notifies_administrators(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.return_value = dict(user_id=7, email='provider@example.com', status='pending')
        response = self.client.post('/api/auth/register', json={**self.payload, 'status':'active', 'subscription_status':'premium'})
        self.assertEqual(response.status_code, 201)
        self.assertIn('pending administrator verification', response.json['message'])
        calls = cursor.execute.call_args_list
        self.assertEqual(calls[0].args[1][-1], 'pending')
        self.assertEqual(calls[1].args[1][-1], 'free')
        self.assertIn('notification', calls[2].args[0])
        connect.return_value.commit.assert_called_once()

    @patch('routes.auth.get_db_connection')
    def test_invalid_registration_fields_are_rejected(self, connect):
        for changes in [{'full_name':' '}, {'email':'bad'}, {'phone_number':'abc123'}, {'organization_name':' '}, {'organization_type':'bad'}, {'password':'short'}, {'confirm_password':'different'}, {'website':'javascript:alert(1)'}]:
            self.assertEqual(self.client.post('/api/auth/register', json={**self.payload, **changes}).status_code, 400)
        connect.assert_not_called()

    @patch('routes.auth.get_db_connection')
    def test_public_signup_cannot_create_administrator_for_approval(self, connect):
        response = self.client.post('/api/auth/register', json={**self.payload, 'role':'admin'})
        self.assertEqual(response.status_code,401)
        connect.assert_not_called()

    @patch('routes.auth.get_db_connection')
    def test_pending_account_cannot_login(self, connect):
        connect.return_value.cursor.return_value.fetchone.return_value = dict(user_id=7, role='sponsor', status='pending', password=generate_password_hash('Example123', method='pbkdf2:sha256'))
        response = self.client.post('/api/auth/login', json={'email':'provider@example.com','password':'Example123'})
        self.assertEqual(response.status_code, 403)
        self.assertNotIn('access_token', response.json)

    @patch('db.get_db_connection')
    @patch('routes.sponsors.get_db_connection')
    def test_existing_token_cannot_bypass_pending_verification(self, sponsor_connect, connect):
        connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status':'pending'}
        response = self.client.post('/api/sponsors/7/scholarships', json={}, headers=self.headers)
        self.assertEqual(response.status_code, 403)
        sponsor_connect.assert_not_called()
        self.assertEqual(self.client.post('/api/sponsors/8/scholarships', json={}, headers=self.headers).status_code,403)
        self.assertEqual(self.client.post('/api/sponsors/7/scholarships', json={}).status_code,401)

    @patch('routes.admin.get_db_connection')
    def test_administrator_approval_notifies_provider(self, connect):
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [{'status':'pending','role':'sponsor'}, {'user_id':7,'status':'active'}]
        headers = {'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'admin'})}
        response = self.client.patch('/api/admin/users/7/status', json={'status':'active'}, headers=headers)
        self.assertEqual(response.status_code,200)
        self.assertIn('approved', cursor.execute.call_args.args[1][1])
        connect.return_value.commit.assert_called_once()
        self.assertEqual(self.client.patch('/api/admin/users/7/status',json={'status':'active'}).status_code,401)

    @patch('db.get_db_connection')
    @patch('routes.sponsors.get_db_connection')
    def test_approved_provider_reaches_workspace(self, sponsor_connect, connect):
        connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status':'active'}
        sponsor_connect.return_value.cursor.return_value.fetchone.return_value = {'sponsor_id':7}
        self.assertEqual(self.client.get('/api/sponsors/7/settings',headers=self.headers).status_code,200)

if __name__ == '__main__': unittest.main()
