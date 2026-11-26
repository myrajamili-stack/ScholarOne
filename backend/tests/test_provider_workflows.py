from unittest import TestCase
from unittest.mock import MagicMock,patch
from werkzeug.security import generate_password_hash
from app import create_app
from security import issue_access_token


class ProviderWorkflowTests(TestCase):
    def setUp(self):
        self.client=create_app().test_client()
        self.enterContext(patch('security.verify_active_account',return_value=None))
        self.connection=MagicMock(); self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.enterContext(patch('provider_workflows.get_db_connection',return_value=self.connection))
        self.payload=dict(role='sponsor',full_name='Test Provider',email='provider@example.invalid',password='Example123',confirm_password='Example123',phone_number='+60123456789',organization_name='Test Foundation',organization_type='Foundation',website='https://example.invalid')
        self.password=generate_password_hash('Example123',method='pbkdf2:sha256')
        self.admin={'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'admin'})}
        self.student={'Authorization':'Bearer '+issue_access_token({'user_id':11,'role':'student'})}

    def test_resubmission_checks_existing_password(self):
        self.cursor.fetchone.return_value={'user_id':7,'status':'rejected','password':self.password}
        response=self.client.post('/api/auth/provider-resubmission',json={**self.payload,'password':'Different123','confirm_password':'Different123'})
        self.assertEqual(response.status_code,401)
        self.assertEqual(self.cursor.execute.call_count,1)

    def test_unknown_account_cannot_resubmit(self):
        self.cursor.fetchone.return_value=None
        self.assertEqual(self.client.post('/api/auth/provider-resubmission',json=self.payload).status_code,401)

    def test_active_pending_disabled_and_suspended_do_not_resubmit(self):
        for status in ['active','pending','disabled','suspended']:
            self.cursor.fetchone.return_value={'user_id':7,'status':status,'password':self.password}
            self.assertEqual(self.client.post('/api/auth/provider-resubmission',json=self.payload).status_code,409)

    def test_resubmission_returns_to_pending_and_preserves_password(self):
        self.cursor.fetchone.side_effect=[{'user_id':7,'status':'rejected','password':self.password},{'user_id':7,'status':'pending'}]
        response=self.client.post('/api/auth/provider-resubmission',json=self.payload)
        self.assertEqual(response.status_code,200,response.json)
        queries=[call.args[0] for call in self.cursor.execute.call_args_list]
        self.assertTrue(any("status='pending'" in query for query in queries))
        self.assertTrue(any('insert into notification' in query for query in queries))
        self.assertFalse(any('set password' in query or 'insert into app_user' in query for query in queries))
        self.assertNotIn('access_token',response.json)

    def test_resubmission_reuses_registration_validation(self):
        for change in [{'full_name':'User12'},{'email':'invalid'},{'phone_number':'abc'},{'organization_type':'unknown'},{'role':'admin'}]:
            self.assertEqual(self.client.post('/api/auth/provider-resubmission',json={**self.payload,**change}).status_code,400)
        self.cursor.execute.assert_not_called()

    def test_account_and_listing_rejection_require_reason(self):
        for path in ['/api/admin/users/7/status','/api/admin/scholarships/9/status']:
            for reason in ['',None,[], 'x'*2001]:
                self.assertEqual(self.client.patch(path,headers=self.admin,json={'status':'rejected','rejection_reason':reason}).status_code,400)

    def test_rejected_login_displays_reason_without_workspace_token(self):
        connection=MagicMock()
        connection.cursor.return_value.fetchone.return_value={'user_id':7,'role':'sponsor','status':'rejected','password':self.password,'provider_rejection_reason':'Missing organisation details.'}
        with patch('routes.auth.get_db_connection',return_value=connection):
            response=self.client.post('/api/auth/login',json={'email':self.payload['email'],'password':'Example123'})
        self.assertEqual(response.status_code,403)
        self.assertIn('Missing organisation details.',response.json['error'])
        self.assertNotIn('access_token',response.json)

    def test_record_view_uses_signed_identity_and_deduplicates_daily(self):
        self.cursor.fetchone.return_value = {'published': True, 'recorded': True}
        with patch('routes.scholarship_views.get_db_connection',return_value=self.connection):
            response=self.client.post('/api/scholarships/9/view',headers=self.student,json={'student_id':999})
        self.assertEqual(response.status_code,200)
        query,values=self.cursor.execute.call_args.args
        self.assertEqual(values,(9,11)); self.assertIn('on conflict do nothing',query)
        self.assertTrue(response.json['recorded'])
        self.assertIn("lower(s.status) in ('approved', 'active')",query)

    def test_nonstudents_and_anonymous_do_not_inflate_views(self):
        for headers in [{},self.admin,{'Authorization':'Bearer '+issue_access_token({'user_id':7,'role':'sponsor'})}]:
            self.assertIn(self.client.post('/api/scholarships/9/view',headers=headers).status_code,[401,403])

    def test_view_failure_is_safe_and_does_not_expose_database_error(self):
        with patch('routes.scholarship_views.get_db_connection',side_effect=RuntimeError('private')):
            response=self.client.post('/api/scholarships/9/view',headers=self.student)
        self.assertEqual(response.status_code,503)
        self.assertNotIn('private',str(response.json))

    def test_resubmission_failure_rolls_back(self):
        self.cursor.fetchone.return_value={'user_id':7,'status':'rejected','password':self.password}
        self.cursor.execute.side_effect=[None,RuntimeError('private')]
        response=self.client.post('/api/auth/provider-resubmission',json=self.payload)
        self.assertEqual(response.status_code,503)
        self.assertIs(self.connection.__exit__.call_args.args[0],RuntimeError)
