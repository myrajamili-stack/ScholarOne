from datetime import date,timedelta
from unittest import TestCase
from unittest.mock import MagicMock,patch
from app import create_app
from security import issue_access_token
from admin_user_profiles import validate_user_update


class AdminNamespaceTests(TestCase):
    def setUp(self):
        self.app=create_app(); self.client=self.app.test_client()
        self.app.add_url_rule('/api/admin/future-route',view_func=lambda:{'private':'protected centrally'})

    def auth(self,role='admin'):
        return {'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':role})}

    def admin_routes(self):
        for rule in self.app.url_map.iter_rules():
            if rule.rule.startswith('/api/admin/'):
                url=rule.rule
                import re
                url=re.sub(r'<[^>]+>','1',url)
                for method in sorted(rule.methods-{'OPTIONS','HEAD'}): yield url,method

    def test_every_admin_route_and_method_denies_anonymous_and_non_admin_roles(self):
        with patch('db.get_db_connection',side_effect=AssertionError('Unauthorized request reached database')):
            for url,method in self.admin_routes():
                with self.subTest(url=url,method=method):
                    self.assertEqual(self.client.open(url,method=method,json={}).status_code,401)
                    self.assertEqual(self.client.open(url,method=method,headers={'Authorization':'Bearer invalid'},json={}).status_code,401)
                    for role in ['student','sponsor','advisor']:
                        self.assertEqual(self.client.open(url,method=method,headers=self.auth(role),json={}).status_code,403)

    def test_all_routes_recheck_restricted_missing_and_changed_role_accounts(self):
        connection=MagicMock(); cursor=connection.cursor.return_value.__enter__.return_value
        with patch('db.get_db_connection',return_value=connection):
            for account in [None,{'status':'disabled'},{'status':'suspended'},{'status':'pending'},{'status':'rejected'}]:
                cursor.fetchone.return_value=account
                for url,method in self.admin_routes():
                    with self.subTest(url=url,method=method,account=account):
                        self.assertEqual(self.client.open(url,method=method,headers=self.auth(),json={}).status_code,403)
            self.assertEqual(cursor.execute.call_args.args[1],(1,'admin'))

    def test_future_route_requires_active_admin_and_expired_tokens_are_denied(self):
        with patch('security.verify_active_account',return_value=None):
            self.assertEqual(self.client.get('/api/admin/future-route',headers=self.auth()).status_code,200)
        with patch('security.TOKEN_MAX_AGE',-1):
            for url,method in self.admin_routes():
                self.assertEqual(self.client.open(url,method=method,headers=self.auth(),json={}).status_code,401)

    def test_cors_preflight_exposes_no_admin_data(self):
        response=self.client.options('/api/admin/reports',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'GET'})
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.data)


class PlanLifecycleTests(TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account',return_value=None))
        self.client=create_app().test_client()
        self.headers={'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'admin'})}
        self.connection=MagicMock(); self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.enterContext(patch('routes.admin_plans.get_db_connection',return_value=self.connection))
        self.payload=dict(plan_name='Research Plan',price='29.00',scholarship_limit=5,duration_month=1,benefits=['Analytics'])

    def test_create_plan_saves_audit_and_normalizes_name(self):
        self.cursor.fetchone.side_effect=[None,{'plan_id':9,'plan_name':'Research Plan'}]
        response=self.client.post('/api/admin/subscription-plans',headers=self.headers,json=self.payload)
        self.assertEqual(response.status_code,201,response.json)
        self.assertIn('audit_log',self.cursor.execute.call_args.args[0])

    def test_duplicate_name_returns_conflict(self):
        self.cursor.fetchone.return_value={'plan_id':9}
        self.assertEqual(self.client.post('/api/admin/subscription-plans',headers=self.headers,json=self.payload).status_code,409)
        self.assertFalse(any('insert into subscription_plan' in call.args[0] for call in self.cursor.execute.call_args_list))

    def test_invalid_or_free_plan_creation_is_denied(self):
        for changed in [{'price':0},{'plan_name':'Free'},{'price':'NaN'},{'price':True},{'duration_month':2},{'scholarship_limit':0}]:
            self.assertEqual(self.client.post('/api/admin/subscription-plans',headers=self.headers,json={**self.payload,**changed}).status_code,400)
        self.cursor.execute.assert_not_called()

    def test_archive_and_restore_never_change_subscriptions_or_payments(self):
        for active in [False,True]:
            self.cursor.fetchone.side_effect=[{'plan_name':'Research Plan'},{'plan_id':9,'is_active':active}]
            response=self.client.patch('/api/admin/subscription-plans/9/availability',headers=self.headers,json={'is_active':active})
            self.assertEqual(response.status_code,200,response.json)
        queries=[call.args[0] for call in self.cursor.execute.call_args_list]
        self.assertFalse(any('update subscription set' in query or 'delete ' in query for query in queries))

    def test_free_plan_cannot_be_archived(self):
        self.cursor.fetchone.return_value={'plan_name':'Free'}
        self.assertEqual(self.client.patch('/api/admin/subscription-plans/9/availability',headers=self.headers,json={'is_active':False}).status_code,409)

    def test_admin_cannot_disable_itself(self):
        self.assertEqual(self.client.patch('/api/admin/users/1/status',headers=self.headers,json={'status':'disabled'}).status_code,403)


class ExtendedProfileValidationTests(TestCase):
    def test_student_fields_validate_without_permitting_role_changes(self):
        clean,error=validate_user_update({'cgpa':'3.75','date_of_birth':'2000-01-01','gender':'Female','nationality':'Malaysian'},'student')
        self.assertIsNone(error); self.assertEqual(clean['cgpa'],3.75)
        for values in [{'cgpa':True},{'cgpa':'NaN'},{'cgpa':4.1},{'date_of_birth':(date.today()+timedelta(days=1)).isoformat()},{'role':'admin'}]:
            self.assertIsNotNone(validate_user_update(values,'student')[1])

    def test_advisor_fields_and_zero_values_are_validated(self):
        clean,error=validate_user_update({'experience_years':0,'institution':'University','professional_title':'Advisor','bio':'Academic guidance.'},'advisor')
        self.assertIsNone(error); self.assertEqual(clean['experience_years'],0)
        for value in [True,'NaN',1.5,61]: self.assertIsNotNone(validate_user_update({'experience_years':value},'advisor')[1])
