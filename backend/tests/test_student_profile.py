import unittest
from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
from flask import Flask
from PIL import Image
from routes.students import students_bp, validate_student_profile
from security import issue_access_token

class StudentProfileTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.app.config['STUDENT_PHOTO_DIR'] = self.directory.name
        self.app.register_blueprint(students_bp)
        self.client = self.app.test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 1, 'role': 'student'})}

    def test_invalid_phone_date_and_cgpa(self):
        for field, value in [('phone_number', '012abc3456'), ('date_of_birth', '2025-02-30'), ('date_of_birth', '2999-01-01'), ('cgpa', 'NaN'), ('cgpa', '4.01')]:
            with self.subTest(field=field, value=value):
                self.assertIsNotNone(validate_student_profile({'full_name':'Sarah Lee', field:value}))
        self.assertIsNone(validate_student_profile({'full_name':'Sarah Lee', 'phone_number':'+60 12-345 6789', 'cgpa':'0'}))

    @patch('routes.students.get_db_connection')
    def test_invalid_update_never_touches_database(self, db):
        response = self.client.put('/api/students/1/profile', headers=self.headers, json={'full_name':'Sarah Lee', 'phone_number':'letters'})
        self.assertEqual(response.status_code, 400)
        db.assert_not_called()

    @patch('routes.students.get_db_connection')
    def test_owner_required_for_profile_and_photo(self, db):
        self.assertEqual(self.client.get('/api/students/1/profile').status_code,401)
        self.assertEqual(self.client.get('/api/students/2/profile',headers=self.headers).status_code,403)
        self.assertEqual(self.client.post('/api/students/2/profile/photo',headers=self.headers).status_code,403)
        db.assert_not_called()

    @patch('routes.students.get_db_connection')
    def test_photo_upload_is_stored_and_served(self, db):
        connection = MagicMock()
        db.return_value = connection
        connection.cursor.return_value.__enter__.return_value.fetchone.return_value = {'user_id':1}
        output = BytesIO()
        Image.new('RGB',(24,32),'purple').save(output,'PNG')
        response = self.client.post('/api/students/1/profile/photo', headers=self.headers, data={'photo':(BytesIO(output.getvalue()),'photo.png')})
        self.assertEqual(response.status_code,200,response.json)
        photo = self.client.get(response.json['profile_picture'])
        self.assertEqual(photo.status_code,200)
        self.assertEqual(photo.mimetype,'image/jpeg')
        photo.close()

    @patch('routes.students.get_db_connection')
    def test_invalid_photo_is_rejected(self, db):
        response = self.client.post('/api/students/1/profile/photo', headers=self.headers, data={'photo':(BytesIO(b'not an image'),'photo.png')})
        self.assertEqual(response.status_code,400)
        db.assert_not_called()
