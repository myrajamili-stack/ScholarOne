import unittest
from unittest.mock import patch
from flask import Flask
from routes.advisor_profiles import profiles_bp, validate_profile
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
