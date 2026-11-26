import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


prepare = module("prepare_all_financial_aid")
importer = module("import_all_financial_aid")


class AllFinancialAidImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dataset = importer.read_dataset()
        cls.records = cls.dataset["records"]

    def record(self, contains):
        return next(row for row in self.records if contains.lower() in row["title"].lower())

    def test_every_source_appearance_is_accounted_for_once(self):
        self.assertEqual(self.dataset["source_entry_count"], 124)
        self.assertEqual(len(self.records), 116)
        self.assertEqual(sorted(number for row in self.records for number in row["import_metadata"]["source_record_numbers"]), list(range(1, 125)))

    def test_aliases_make_repeated_runs_insert_nothing(self):
        existing = [{**row, "scholarship_id": n} for n, row in enumerate(self.records, 1)]
        insert, skip = importer.plan_import(self.records, existing)
        self.assertEqual(insert, [])
        self.assertEqual(len(skip), 116)

    def test_different_names_of_same_scheme_are_not_reimported(self):
        record = self.record("HPIPT) Selangor / Iltizam")
        variant = next(value for value in record["import_metadata"]["title_aliases"] if value.startswith("Iltizam Mahasiswa Selangor ("))
        insert, skip = importer.plan_import([record], [{"title": variant, "scholarship_id": 555, "import_metadata": None}])
        self.assertEqual(insert, [])
        self.assertEqual(skip[0]["scholarship_id"], 555)

    def test_shared_provider_url_does_not_merge_different_programmes(self):
        rows = [row for row in self.records if row["title"].startswith("Yayasan Terengganu – Domestic IPT")]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["import_metadata"]["source_url"], rows[1]["import_metadata"]["source_url"])
        insert, skip = importer.plan_import(rows, [])
        self.assertEqual(len(insert), 2)
        self.assertEqual(skip, [])

    def test_ambiguous_existing_duplicates_abort_instead_of_guessing(self):
        row = self.record("BUDI")
        with self.assertRaisesRegex(ValueError, "Ambiguous"):
            importer.plan_import([row], [{"scholarship_id": n, "title": row["title"]} for n in [1, 2]])

    def test_wrapped_prose_is_not_mistaken_for_a_field_label(self):
        fields = prepare.source_fields(["Funding Amount:", "Maximum duration: subject to", "eligibility and approval.", "Eligibility Criteria:", "Malaysian citizen."])
        self.assertEqual(fields["funding amount"][-1], "eligibility and approval.")
        self.assertEqual(fields["eligibility criteria"], ["Malaysian citizen."])
        ns = self.record("Living Allowance Assistance for Negeri Sembilan")
        self.assertIn("RM5,000", ns["eligibility_criteria"])
        self.assertIn("STR) 2026", ns["eligibility_criteria"])
        tapem = self.record("Bantuan Ke Institusi Pengajian Tinggi (IPT)")
        self.assertIn("registered voter in Melaka", tapem["eligibility_criteria"])
        self.assertIn("Government of Melaka", tapem["import_metadata"]["source_sponsor"])

    def test_source_titles_and_bullets_do_not_lose_internal_dashes(self):
        self.assertEqual(prepare.clean_line("– FlySiswa 2026"), "– FlySiswa 2026")
        self.assertIn("Education Loan", self.record("Domestic IPTA Top-Up")["title"])
        self.assertNotIn("One-off assistance", self.record("MAINJ – IPT Registration")["title"])

    def test_diploma_and_postgraduate_funding_and_repayment_survive(self):
        row = self.record("Perak State Higher Education Loan")
        self.assertIn("3.75", row["eligibility_criteria"])
        self.assertIn("12 months", row["eligibility_criteria"])
        self.assertIn("repayment exemption", " ".join(row["description"].split()))
        self.assertIn("PhD", row["import_metadata"]["study_levels"])
        pp = self.record("Penang State Student Loan")
        self.assertIn("1%", pp["eligibility_criteria"])
        self.assertIn("5 years", pp["eligibility_criteria"])

    def test_relative_and_uncertain_dates_are_not_invented(self):
        self.assertIsNone(self.record("Bantuan Ke Institusi Pengajian Tinggi (IPT)")["deadline"])
        self.assertIsNone(self.record("Bantuan Pelajar IPT Kelantan")["deadline"])
        self.assertTrue(self.record("Bantuan Pelajar IPT Kelantan")["import_metadata"]["declared_closed"])
        self.assertEqual(self.record("Living Allowance Assistance for Negeri Sembilan")["deadline"], "2026-12-06")
        self.assertEqual(self.record("Aspirasi IPT) 2026")["deadline"], "2026-12-31")
        self.assertEqual(self.record("Yayasan Sabah – Higher Education Loan")["deadline"], "2026-05-21")

    def test_historical_funding_and_conflicting_opening_dates_stay_qualified(self):
        row = self.record("Sumbangan Dana Pendidikan Kerajaan Negeri Perlis")
        self.assertIsNone(row["amount"])
        self.assertIn("not confirmed 2026 amounts", row["import_metadata"]["amount_note"])
        aspirasi = self.record("Aspirasi IPT) 2026")["import_metadata"]
        self.assertEqual(len(aspirasi["source_variants"]), 2)
        self.assertTrue(any("conflicting opening dates" in note for note in aspirasi["import_notes"]))

    def test_missing_urls_are_reported_not_fabricated(self):
        missing = [row["title"] for row in self.records if not row["import_metadata"]["source_urls"]]
        self.assertEqual(missing, ["Yayasan Pahang Education Loan (Pinjaman Pendidikan Yayasan Pahang)"])

    def test_level_filters_do_not_treat_the_word_foundation_as_a_qualification(self):
        levels = self.record("Bantuan Persediaan Yayasan Terengganu (BPYT)")["import_metadata"]["study_levels"]
        self.assertNotIn("Foundation", levels)
        self.assertIn("Certificate", levels)
        self.assertEqual(self.record("UNISEL Student Financial Assistance")["import_metadata"]["eligible_states"], ["All States"])
        self.assertEqual(self.record("Bantuan Kecemasan (Emergency Assistance)")["import_metadata"]["eligible_states"], ["Kuala Lumpur", "Putrajaya", "Labuan"])


if __name__ == "__main__":
    unittest.main()
