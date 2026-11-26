from pathlib import Path
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
import json

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from listing_information import prepare_listing_information
from scholarship_imports import enrich_scholarship
from security import issue_access_token
from app import create_app


class ListingInformationTests(unittest.TestCase):
    def payload(self):
        return dict(title='Education Loan', category='General', funding_type='Education Loan', amount='0',
                    description='Programme description.', eligibility_criteria='Malaysian citizen.',
                    study_level='Diploma', eligible_state='Johor', study_levels=['Diploma', 'Undergraduate'],
                    eligible_states=['Johor', 'Melaka'], deadline_status='closed', deadline='',
                    deadline_note='Closed for 2026. Next intake July–August 2027.', amount_note='RM800 per year.',
                    source_url='https://example.com/programme', application_url='https://example.com/apply',
                    residency_requirements='Resident of Johor.', funding_details='Annual payment in August.',
                    application_method='1. Download the form.\n2. Submit the form.',
                    repayment_conditions='Repay after graduation.', additional_information='No application fee.')

    def test_metadata_round_trip_matches_student_listing_fields(self):
        metadata, description, deadline = prepare_listing_information(self.payload())
        row = enrich_scholarship(dict(title='Education Loan', description=description, deadline=deadline, import_metadata=metadata))
        self.assertFalse(row['external_listing'])
        self.assertEqual(row['intake_status'], 'closed')
        self.assertEqual(row['amount_note'], 'RM800 per year.')
        self.assertEqual(row['study_levels'], ['Diploma', 'Undergraduate'])
        self.assertEqual(row['eligible_states'], ['Johor', 'Melaka'])
        for heading in ('Residency Requirements:', 'Funding Details:', 'Application Method:', 'Repayment Conditions:', 'Additional Information:', 'Official Source:', 'Application Portal:'):
            self.assertIn(heading, description)
        self.assertEqual(description.count('https://example.com/programme'), 1)

    def test_open_and_unknown_deadlines_do_not_require_fake_dates(self):
        for status, expected in [('open', 'open'), ('unconfirmed', 'unconfirmed')]:
            metadata, description, deadline = prepare_listing_information({**self.payload(), 'deadline_status': status, 'deadline_note': ''})
            row = enrich_scholarship(dict(description=description, deadline=deadline, import_metadata=metadata))
            self.assertEqual(row['intake_status'], expected)
            self.assertEqual(row['deadline_note'], 'Open. ' if status == 'open' else 'No Official Information')

    def test_invalid_dates_urls_and_filter_values_are_rejected(self):
        for changes in ({'deadline_status': 'invalid'}, {'deadline_status': 'dated', 'deadline': ''},
                        {'deadline_status': 'open', 'deadline': '2000-01-01'}, {'deadline': '2027-02-30'},
                        {'application_url': 'javascript:alert(1)'}, {'source_url': 'https://['},
                        {'study_levels': ['invalid']}, {'eligible_states': 'Johor'}, {'amount_note': 42}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                prepare_listing_information({**self.payload(), **changes})

    def test_blank_optional_sections_are_not_invented(self):
        metadata, description, deadline = prepare_listing_information({'description': 'Description', 'deadline': '2099-01-01'})
        self.assertEqual(description, 'Description')
        self.assertFalse(metadata['external_listing'])

    @patch("listing_information.malaysia_now", return_value=datetime.fromisoformat("2026-11-25T17:00:00+08:00"))
    def test_exact_cutoff_must_be_future_unless_preserved_as_closed(self, clock):
        listing = {**self.payload(), "deadline_status": "dated", "deadline": "2026-11-25"}
        for cutoff in ("16:59:59", "17:00:00"):
            with self.subTest(cutoff=cutoff), self.assertRaisesRegex(ValueError, "closing time has passed"):
                prepare_listing_information({**listing, "deadline_time": cutoff})
        metadata, _, _ = prepare_listing_information({**listing, "deadline_time": "17:00:01"})
        self.assertEqual(metadata["deadline_at"], "2026-11-25T17:00:01+08:00")
        self.assertEqual(prepare_listing_information(listing)[2], "2026-11-25")
        with self.assertRaisesRegex(ValueError, "closing time has passed"):
            prepare_listing_information(listing, retained_deadline_at="2026-11-25T09:00:00+00:00")
        with self.assertRaisesRegex(ValueError, "valid Malaysia closing time"):
            prepare_listing_information({**listing, "deadline_time": "17:00.12"})
        self.assertTrue(prepare_listing_information({**listing, "deadline_status": "closed",
                                                      "deadline_time": "16:00"})[0]["declared_closed"])

    def test_existing_pdf_metadata_stays_external(self):
        row = enrich_scholarship({'description': 'Original', 'import_metadata': {'source_url': 'https://example.com'}}, now=datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.assertTrue(row['external_listing'])

    @patch('db.get_db_connection')
    @patch('routes.sponsors.get_db_connection')
    def test_submission_persists_information_without_schema_changes(self, connect, account_connect):
        account_connect.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {'status': 'active'}
        cursor = connect.return_value.cursor.return_value
        cursor.fetchone.side_effect = [{'user_id': 7}, None, {'total': 0}, {'scholarship_id': 99, 'title': 'Award', 'status': 'pending'}]
        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'sponsor'})}
        response = create_app().test_client().post('/api/sponsors/7/scholarships', headers=headers, json=self.payload())
        self.assertEqual(response.status_code, 201, response.json)
        sql, values = next(call.args for call in cursor.execute.call_args_list if "insert into scholarship" in call.args[0])
        self.assertIn('import_metadata', sql)
        self.assertEqual(values[3], 0)
        self.assertIsNone(values[6])
        self.assertEqual(json.loads(values[-1])['amount_note'], 'RM800 per year.')
        self.assertIn('Repayment Conditions:', values[2])
        connect.return_value.commit.assert_called_once()


if __name__ == '__main__':
    unittest.main()
