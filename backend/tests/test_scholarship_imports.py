from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.import_scholarship_pdf import read_dataset, normalize_title
from scholarship_imports import enrich_scholarship


class ScholarshipImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = read_dataset()
        cls.rows = cls.dataset['records']

    def test_all_source_entries_are_preserved_without_duplicate_listings(self):
        self.assertEqual(len(self.rows), 48)
        self.assertEqual(sorted(n for r in self.rows for n in r['import_metadata']['source_record_numbers']), list(range(1, 50)))
        self.assertEqual(len({normalize_title(r['title']) for r in self.rows}), 48)
        lznk = next(r for r in self.rows if r['import_metadata']['source_record_numbers'] == [26, 27])
        self.assertEqual(len(lznk['import_metadata']['source_entries']), 2)
        self.assertIn('2021/2022', lznk['import_metadata']['amount_note'])

    def test_unknown_amounts_and_dates_are_not_fabricated(self):
        brain = next(r for r in self.rows if r['title'] == 'MyBrainSc Scholarship')
        self.assertIsNone(brain['deadline'])
        self.assertIsNone(brain['amount'])
        self.assertIn('23 December 2026', brain['import_metadata']['deadline_note'])
        loan = next(r for r in self.rows if r['title'] == 'Pinjaman Pelajaran Yayasan Selangor')
        self.assertEqual(loan['deadline'], '2026-11-10')
        self.assertTrue(all(r['amount'] is None or r['amount'] > 0 for r in self.rows))

    def test_ambiguous_ywp_loan_is_not_presented_as_confirmed_loan(self):
        ywp = next(r for r in self.rows if '(YWP)' in r['title'])
        self.assertEqual(ywp['funding_type'], 'Financial Assistance')
        self.assertTrue(ywp['import_metadata']['import_notes'])

    def test_urls_do_not_contain_joined_headings_or_other_urls(self):
        for row in self.rows:
            for url in row['import_metadata']['source_urls']:
                self.assertEqual(url.count('://'), 1)
                self.assertTrue(urlparse(url).netloc)
                self.assertFalse(url.endswith(('/Johor', '/Selangor', '/Perlis', '/Terengganu', '/Application:', '/Application', '/Institutional')))
        pahang_loan = self.rows[-1]
        self.assertIsNone(pahang_loan['import_metadata']['source_url'])

    def test_metadata_projection_preserves_source_sponsor_without_exposing_raw_document(self):
        row = {**self.rows[0], 'organization_name': 'ScholarOne'}
        projected = enrich_scholarship(row)
        self.assertEqual(projected['organization_name'], 'Ministry of Higher Education (KPT)')
        self.assertEqual(projected['listed_by'], 'ScholarOne')
        self.assertEqual(projected['study_levels'], ['Undergraduate', "Master's", 'PhD'])
        self.assertNotIn('import_metadata', projected)
        self.assertIn('import_metadata', row)

    def test_closed_intakes_and_exact_time_are_respected(self):
        now = datetime(2026, 11, 2, tzinfo=timezone(timedelta(hours=8)))
        row = next(r for r in self.rows if r['title'] == 'Kijang Undergraduate Scholarship')
        self.assertEqual(enrich_scholarship(row, now)['intake_status'], 'closed')
        row = next(r for r in self.rows if 'Program Sarjana' in r['title'])
        self.assertEqual(enrich_scholarship(row, now)['intake_status'], 'dated')
        after_noon = datetime(2026, 11, 5, 12, 1, tzinfo=now.tzinfo)
        self.assertEqual(enrich_scholarship(row, after_noon)['intake_status'], 'closed')

    def test_non_imported_listing_is_unchanged(self):
        row = {'title': 'Existing listing', 'amount': 1000, 'organization_name': 'Provider'}
        self.assertEqual(enrich_scholarship(row), row)


if __name__ == '__main__': unittest.main()
