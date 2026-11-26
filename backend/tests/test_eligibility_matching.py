from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eligibility_matching import check_eligibility
from listing_information import prepare_listing_information
from security import issue_access_token
from app import create_app


class EligibilityMatchingTests(unittest.TestCase):
    def profile(self, **changes):
        return dict(education_level='Diploma', cgpa=3.5, **changes)

    def scholarship(self):
        return dict(deadline='2099-12-31', study_level='Diploma', eligible_state='Johor',
                    eligibility_criteria='- Malaysian citizen.\n- Submit certified documents.',
                    import_metadata={'eligibility_rules': {'minimum_cgpa': 3.0, 'maximum_income': 5000, 'income_period': 'monthly'}})

    def checks(self, result):
        return {row['criterion']: row for row in result['checks']}

    def test_matching_qualifications_cgpa_state_and_income_with_reasons(self):
        result = check_eligibility(self.profile(), self.scholarship(), {'residency_state': 'Johor', 'household_income': 4000, 'income_period': 'monthly'})
        for criterion in ('Academic qualification', 'CGPA', 'State', 'Household income'):
            self.assertEqual(self.checks(result)[criterion]['status'], 'matched')
            self.assertTrue(self.checks(result)[criterion]['reason'])
        self.assertEqual(result['status'], 'needs_verification')
        self.assertIn('certified documents', self.checks(result)['Other eligibility criteria']['reason'])

    def test_each_mismatch_is_explained(self):
        result = check_eligibility({'education_level': 'PhD', 'cgpa': 2.5}, self.scholarship(),
                                   {'residency_state': 'Sabah', 'household_income': 6000, 'income_period': 'monthly'})
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['mismatch_count'], 4)
        self.assertIn('2.50', self.checks(result)['CGPA']['reason'])

    def test_boundary_values_and_monthly_annual_conversion(self):
        scholarship = self.scholarship()
        for income, period in ((5000, 'monthly'), (60000, 'annual')):
            result = check_eligibility({'education_level': 'Diploma', 'cgpa': 3.0}, scholarship,
                                       {'household_income': income, 'income_period': period})
            self.assertEqual(self.checks(result)['Household income']['status'], 'matched')
            self.assertEqual(self.checks(result)['CGPA']['status'], 'matched')
        scholarship['import_metadata']['eligibility_rules'].update(maximum_income=60000, income_period='annual')
        result = check_eligibility(self.profile(), scholarship, {'household_income': 5000, 'income_period': 'monthly'})
        self.assertEqual(self.checks(result)['Household income']['status'], 'matched')

    def test_missing_student_or_listing_data_never_implies_match(self):
        result = check_eligibility({}, {})
        self.assertEqual(result['matched_count'], 0)
        self.assertEqual(result['status'], 'needs_verification')
        self.assertTrue(all(row['status'] == 'unknown' for row in result['checks']))

    def test_unknown_income_period_is_not_guessed(self):
        scholarship = self.scholarship()
        del scholarship['import_metadata']['eligibility_rules']['income_period']
        result = check_eligibility(self.profile(), scholarship, {'household_income': 100, 'income_period': 'monthly'})
        self.assertEqual(self.checks(result)['Household income']['status'], 'unknown')

    def test_zero_income_and_invalid_profile_numbers(self):
        result = check_eligibility({'cgpa': 'NaN'}, self.scholarship(), {'household_income': 0, 'income_period': 'monthly'})
        self.assertEqual(self.checks(result)['CGPA']['status'], 'unknown')
        self.assertEqual(self.checks(result)['Household income']['status'], 'matched')

    def test_all_states_and_multiple_study_levels(self):
        scholarship = self.scholarship()
        scholarship['import_metadata'].update(study_levels=['Undergraduate', "Master's"], eligible_states=['All States'])
        result = check_eligibility({'education_level': 'Master'}, scholarship)
        self.assertEqual(self.checks(result)['Academic qualification']['status'], 'matched')
        self.assertEqual(self.checks(result)['State']['status'], 'matched')

    def test_expired_or_explicitly_closed_listing_is_not_a_match(self):
        for changes in ({'deadline': '2000-01-01'}, {'import_metadata': {'declared_closed': True}}, {'import_metadata': {'deadline_at': '2000-01-01T11:00:00+08:00'}}):
            result = check_eligibility(self.profile(), {**self.scholarship(), **changes})
            self.assertEqual(result['status'], 'mismatch')

    def test_legacy_cgpa_requires_an_unambiguous_complete_label(self):
        for text, expected in [('Minimum CGPA: 3.00', 'matched'), ('Prefer good grades and CGPA around 3', 'unknown'),
                               ('Minimum CGPA: 3\nMinimum CGPA: 4', 'unknown')]:
            scholarship = dict(deadline='2099-01-01', eligibility_criteria=text)
            self.assertEqual(self.checks(check_eligibility(self.profile(), scholarship))['CGPA']['status'], expected)

    def test_provider_rules_are_stored_without_inventing_income_period(self):
        metadata, _, _ = prepare_listing_information({'description': 'Description', 'deadline': '2099-01-01', 'minimum_cgpa': '3.2', 'maximum_income': '5000'})
        self.assertEqual(metadata['eligibility_rules'], {'minimum_cgpa': 3.2, 'maximum_income': 5000, 'income_period': None})


class EligibilityEndpointTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.eligibility.get_db_connection'))
        self.client = create_app().test_client()
        self.url = '/api/scholarships/99/eligibility'
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': 'student'})}

    def test_requires_student_and_does_not_trust_supplied_academic_identity(self):
        self.assertEqual(self.client.post(self.url, json={}).status_code, 401)
        for role in ('admin', 'advisor', 'sponsor'):
            headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': role})}
            self.assertEqual(self.client.post(self.url, json={}, headers=headers).status_code, 403)
        for payload in ({'student_id': 12}, {'cgpa': 4}, {'residency_state': []}, {'household_income': -1}, {'income_period': 'weekly'}):
            self.assertEqual(self.client.post(self.url, json=payload, headers=self.headers).status_code, 400)
        self.connect.assert_not_called()

    def test_reads_own_profile_and_published_listing_without_writing(self):
        cursor = self.connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [{'education_level': 'Diploma', 'cgpa': 3.5}, {'deadline': '2099-01-01'}]
        response = self.client.post(self.url, json={}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(cursor.execute.call_args_list[0].args[1], (11,))
        self.assertIn("lower(s.status) in ('approved', 'active')", cursor.execute.call_args.args[0])
        self.assertTrue(all(call.args[0].startswith('select') for call in cursor.execute.call_args_list))
        self.connect.return_value.commit.assert_not_called()

    def test_missing_or_unpublished_listing_returns_not_found(self):
        self.connect.return_value.cursor.return_value.fetchone.side_effect = [{'cgpa': 3}, None]
        self.assertEqual(self.client.post(self.url, json={}, headers=self.headers).status_code, 404)

    def test_database_failure_does_not_expose_connection_details(self):
        self.connect.side_effect = RuntimeError('private credentials')
        response = self.client.post(self.url, json={}, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private credentials', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
