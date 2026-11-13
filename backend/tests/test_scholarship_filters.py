from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from scholarship_filters import validate_filter_metadata


class ScholarshipFilterTests(unittest.TestCase):
    def setUp(self):
        approval = patch('db.get_db_connection')
        connect = approval.start()
        connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status':'active'}
        self.addCleanup(approval.stop)

    def test_valid_and_unspecified_values(self):
        self.assertEqual(validate_filter_metadata({}), {"study_level": None, "eligible_state": None})
        self.assertEqual(validate_filter_metadata({"study_level": " Diploma ", "eligible_state": "Johor"}),
                         {"study_level": "Diploma", "eligible_state": "Johor"})
        self.assertEqual(validate_filter_metadata({"eligible_state": "All States"})['eligible_state'], 'All States')

    def test_invalid_values_are_rejected(self):
        for data in [{"study_level": "Unknown"}, {"eligible_state": "Unknown"}, {"study_level": []}, {"eligible_state": 4}]:
            with self.assertRaises(ValueError): validate_filter_metadata(data)

    @patch('routes.sponsors.get_db_connection')
    def test_invalid_metadata_is_rejected_before_database_access(self, connect):
        client = create_app().test_client()
        response = client.post('/api/sponsors/1/scholarships', headers={'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'sponsor'})}, json={
            'title': 'Award', 'description': 'Description', 'amount': 1,
            'category': 'General', 'eligibility_criteria': 'Eligibility', 'deadline': '2027-01-01',
            'funding_type': 'Scholarship', 'eligible_state': 'Invalid',
        })
        self.assertEqual(response.status_code, 400)
        connect.assert_not_called()

    @patch('routes.sponsors.get_db_connection')
    def test_create_saves_explicit_eligibility_fields(self, connect):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchone.side_effect = [
            {'user_id': 1, 'organization_name': 'Provider'}, None, {'total': 0},
            {'scholarship_id': 99, 'study_level': 'Diploma', 'eligible_state': 'Johor'},
        ]
        connect.return_value = connection
        response = create_app().test_client().post('/api/sponsors/1/scholarships', headers={'Authorization':'Bearer '+issue_access_token({'user_id':1,'role':'sponsor'})}, json={
            'title': 'Award', 'description': 'Description', 'amount': 1,
            'category': 'General', 'eligibility_criteria': 'Eligibility', 'deadline': '2027-01-01',
            'funding_type': 'Scholarship', 'study_level': 'Diploma', 'eligible_state': 'Johor',
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(cursor.execute.call_args.args[1][-2:], ('Diploma', 'Johor'))
        self.assertIn('study_level', cursor.execute.call_args.args[0])
        connection.commit.assert_called_once()


if __name__ == '__main__': unittest.main()
