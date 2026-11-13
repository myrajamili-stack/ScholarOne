import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch
from flask import Flask
from PIL import Image
from profile_photos import MAX_PHOTO_BYTES, prepare_photo
from routes.advisor_profiles import profiles_bp
from security import issue_access_token


def photo_bytes(format='PNG', size=(24, 32)):
    output = BytesIO()
    Image.new('RGB', size, '#7844dd').save(output, format=format)
    return output.getvalue()


class PhotoValidationTests(unittest.TestCase):
    def test_supported_images_are_jpeg(self):
        for format in ['PNG', 'JPEG', 'WEBP']:
            with self.subTest(format=format):
                with Image.open(BytesIO(prepare_photo(photo_bytes(format)))) as image:
                    self.assertEqual(image.format, 'JPEG')
                    self.assertEqual(image.size, (24, 32))
    def test_shrinks_large_images(self):
        with Image.open(BytesIO(prepare_photo(photo_bytes(size=(2048, 1024))))) as image:
            self.assertEqual(image.size, (1024, 512))
    def test_rejects_invalid_content(self):
        for content in [b'', b'not a photo', b'<svg xmlns="http://www.w3.org/2000/svg"/>', photo_bytes('GIF'), b'x' * (MAX_PHOTO_BYTES + 1)]:
            with self.subTest(size=len(content)):
                with self.assertRaises(ValueError): prepare_photo(content)
    def test_removes_metadata(self):
        output=BytesIO();image=Image.new('RGB',(24,32));exif=Image.Exif();exif[315]='Private metadata';image.save(output,'JPEG',exif=exif)
        with Image.open(BytesIO(prepare_photo(output.getvalue()))) as result:
            self.assertFalse(result.getexif())


class PhotoEndpointTests(unittest.TestCase):
    def setUp(self):
        self.directory=TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.app=Flask(__name__)
        self.app.config['PROFILE_PHOTO_DIR']=self.directory.name
        self.app.register_blueprint(profiles_bp)
        self.client=self.app.test_client()
        self.headers={'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'advisor'})}
        self.connection=MagicMock()
        self.cursor=self.connection.cursor.return_value.__enter__.return_value
        self.cursor.fetchone.return_value={'user_id':1}
        self.db=patch('routes.advisor_profiles.get_db_connection',return_value=self.connection).start()
        self.addCleanup(patch.stopall)
    def upload(self, raw=None, headers=None, name='photo.png'):
        response=self.client.post('/api/advisors/1/profile/photo',headers=headers or self.headers,data={'photo':(BytesIO(raw if raw is not None else photo_bytes()),name)},content_type='multipart/form-data')
        self.addCleanup(response.close)
        return response
    def test_saves_and_serves_photo(self):
        response=self.upload()
        self.assertEqual(response.status_code,200,response.json)
        url=response.json['profile_picture']
        saved=self.client.get(url)
        self.assertEqual(saved.status_code,200)
        self.assertEqual(saved.mimetype,'image/jpeg')
        self.assertEqual(saved.headers['X-Content-Type-Options'],'nosniff')
        saved.close()
        self.assertEqual(len(list(Path(self.directory.name).glob('*.jpg'))),1)
        self.assertTrue(any('UPDATE app_user SET profile_picture' in call.args[0] for call in self.cursor.execute.call_args_list))
    def test_ownership_required(self):
        self.assertEqual(self.client.post('/api/advisors/1/profile/photo').status_code,401)
        other={'Authorization':'Bearer '+issue_access_token({'user_id':2,'role':'advisor'})}
        self.assertEqual(self.upload(headers=other).status_code,403)
        self.db.assert_not_called()
    def test_invalid_or_missing_file_does_not_touch_database(self):
        self.assertEqual(self.upload(b'not a photo').status_code,400)
        self.assertEqual(self.client.post('/api/advisors/1/profile/photo',headers=self.headers).status_code,400)
        self.db.assert_not_called()
    def test_oversized_request(self):
        response=self.upload(b'x' * (MAX_PHOTO_BYTES+2*1024*1024))
        self.assertEqual(response.status_code,413)
        self.assertIn('5 MB',response.json['error'])
        self.db.assert_not_called()
    def test_inactive_account_cannot_upload(self):
        self.cursor.fetchone.return_value=None
        self.assertEqual(self.upload().status_code,404)
        self.assertEqual(list(Path(self.directory.name).iterdir()),[])
    def test_failed_save_removes_new_file(self):
        self.cursor.execute.side_effect=[None,RuntimeError('Database unavailable')]
        self.assertEqual(self.upload().status_code,503)
        self.assertEqual(list(Path(self.directory.name).iterdir()),[])
    def test_unrecognized_photo_path_is_not_served(self):
        self.assertEqual(self.client.get('/api/advisors/profile-photos/arbitrary.jpg').status_code,404)

if __name__=='__main__': unittest.main()
