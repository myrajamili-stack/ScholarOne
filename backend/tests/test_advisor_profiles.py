import unittest
from unittest.mock import patch
from flask import Flask
from routes.advisor_profiles import profiles_bp, validate_profile
from security import issue_access_token
VALID = dict(full_name='Dr. Emily', email='emily@example.com', phone_number='+60 12-345 6789', institution='Example University', professional_title='Academic Advisor', bio='I help students plan their academic pathway.', specialization='Scholarships', qualification='PhD in Education', experience_years=8, profile_picture='https://example.com/photo.jpg')
class ProfileValidationTests(unittest.TestCase):
    def test_normalization(self):
        clean, errors = validate_profile({**VALID,'email':' Emily@Example.com '})
        self.assertEqual(errors,{})
        self.assertEqual(clean['phone_number'],'+60123456789')
        self.assertEqual(clean['email'],'emily@example.com')
    def test_invalid_fields(self):
        cases = {'phone_number':['abc12345678','++60123456789','123','1234567890123456','123/456789'], 'email':['invalid','a@b','a b@example.com'], 'experience_years':[-1,61,2.5,True,'eight'], 'profile_picture':['javascript:alert(1)','ftp://example.com/a','https://a:b@example.com/a','https://example.com:bad/a'], 'full_name':['1234','Dr Emily2',''], 'bio':['','a'*301], 'institution':['a'*151]}
        for key, values in cases.items():
            for value in values:
                with self.subTest(key=key,value=value): self.assertIn(key,validate_profile({**VALID,key:value})[1])
    def test_optional_values(self):
        self.assertEqual(validate_profile({**VALID,'phone_number':'','profile_picture':'','experience_years':None})[1],{})
    def test_cannot_edit_managed_fields(self):
        for key in ['average_rating','role','verification_status','students_guided']:
            self.assertIn(key,validate_profile({**VALID,key:'verified'})[1])
    def test_authorization_before_database(self):
        app=Flask(__name__);app.register_blueprint(profiles_bp)
        with patch('routes.advisor_profiles.get_db_connection') as db:
            self.assertEqual(app.test_client().put('/api/advisors/1/profile',json=VALID).status_code,401)
            db.assert_not_called()


class AdvisorProfileUpdateTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.advisor_profiles.get_db_connection'))
        self.read = self.enterContext(patch('routes.advisor_profiles.read_profile', return_value={'advisor_id': 7, **VALID}))
        self.cursor = self.connect.return_value.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.return_value = None
        app = Flask(__name__)
        app.register_blueprint(profiles_bp)
        self.client = app.test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'advisor'})}

    def update(self, payload):
        return self.client.put('/api/advisors/7/profile', json=payload, headers=self.headers)

    def test_valid_update_writes_both_profiles_and_reloads(self):
        response = self.update(VALID)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.read.call_count, 2)
        self.assertEqual(self.cursor.execute.call_count, 3)
        self.assertIn('UPDATE app_user', self.cursor.execute.call_args_list[1].args[0])
        self.assertIn('INSERT INTO advisor', self.cursor.execute.call_args_list[2].args[0])

    def test_invalid_update_does_not_write(self):
        response = self.update({**VALID, 'full_name': 'Emily123'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('full_name', response.json['fields'])
        self.cursor.execute.assert_not_called()

    def test_duplicate_email_does_not_write(self):
        self.cursor.fetchone.return_value = {'user_id': 12}
        self.assertEqual(self.update(VALID).status_code, 409)
        self.assertEqual(self.cursor.execute.call_count, 1)

    def test_failed_write_exits_transaction_with_error(self):
        self.cursor.execute.side_effect = [None, RuntimeError('private connection details')]
        response = self.update(VALID)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private connection details', response.get_data(as_text=True))
        self.assertIs(self.connect.return_value.__exit__.call_args.args[0], RuntimeError)
