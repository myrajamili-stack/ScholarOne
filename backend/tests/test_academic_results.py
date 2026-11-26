from unittest import TestCase

from academic_results import validate_academic_requirements, validate_qualifications
from eligibility_matching import check_eligibility


class AcademicResultsTests(TestCase):
    def test_grade_formats_and_cgpa_are_validated_by_qualification(self):
        records = {
            "spm": {"subjects": [{"subject": " Mathematics ", "grade": "A+"}]},
            "igcse_o_level": {"grading_scale": "igcse_numeric", "subjects": [{"subject": "Biology", "grade": "9"}]},
            "stpm": {"cgpa": "3.67", "subjects": [{"subject": "Chemistry", "grade": "A-"}], "muet_band": "4.5"},
            "a_level": {"subjects": [{"subject": "Chemistry", "grade": "A*"}], "institution": "College"},
            "diploma": {"cgpa": "3.5", "programme_name": "Diploma in Computing"},
        }
        clean = validate_qualifications(records)
        self.assertEqual(clean["spm"]["subjects"], [{"subject": "Mathematics", "grade": "A+"}])
        self.assertEqual(clean["stpm"]["cgpa"], 3.67)
        for scale, grade in [("igcse_letters", "G"), ("igcse_numeric", "1"), ("o_level", "E")]:
            self.assertTrue(validate_qualifications({"igcse_o_level": {
                "grading_scale": scale, "subjects": [{"subject": "Custom subject", "grade": grade}]
            }}))
        for invalid in (
            {"spm": {"cgpa": 3.5}}, {"a_level": {"cgpa": 3.5}},
            {"diploma": {"cgpa": "NaN"}}, {"foundation": {"cgpa": True}}, {"bachelors": {"cgpa": 4.01}},
            {"igcse_o_level": {"grading_scale": "igcse_numeric", "subjects": [{"subject": "Biology", "grade": "A"}]}},
            {"spm": {"subjects": [{"subject": "Biology", "grade": "A"}, {"subject": " biology ", "grade": "B"}]}},
            {"stpm": {"cgpa": 3, "subjects": [], "muet_band": "6"}},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_qualifications(invalid)

    def test_explicit_needs_use_completed_results_and_leave_missing_data_unknown(self):
        profile = {"education_level": "Foundation", "cgpa": 4, "academic_qualifications": validate_qualifications({
            "spm": {"subjects": [{"subject": "Mathematics", "grade": "A-"}]},
            "igcse_o_level": {"grading_scale": "igcse_numeric", "subjects": [{"subject": "Biology", "grade": "7"}]},
            "diploma": {"cgpa": "2.75", "field_of_study": "Computing"},
        })}

        def checks(rule):
            listing = {"study_level": "SPM", "import_metadata": {"eligibility_rules": {"academic_requirements": rule}}}
            return {result["criterion"]: result["status"] for result in check_eligibility(profile, listing)["checks"]}

        spm = checks({"qualification": "spm", "subject_minimums": {"Mathematics": "B+", "English": "A"}, "minimum_as": 2})
        self.assertEqual(spm["Academic qualification"], "matched")
        self.assertEqual(spm["Grade for mathematics"], "matched")
        self.assertEqual(spm["Grade for english"], "unknown")
        self.assertEqual(spm["SPM As"], "unknown")
        self.assertEqual(checks({"qualification": "igcse_o_level", "grading_scale": "igcse_numeric",
                                 "subject_minimums": {"Biology": "8"}})["Grade for biology"], "mismatch")
        self.assertEqual(checks({"qualification": "igcse_o_level", "grading_scale": "igcse_letters",
                                 "subject_minimums": {"Biology": "A"}})["Subject grades"], "unknown")
        diploma = checks({"qualification": "diploma", "minimum_cgpa": 3, "fields_of_study": ["Computing"]})
        self.assertEqual(diploma["CGPA"], "mismatch")
        self.assertEqual(diploma["Field of study"], "matched")
        self.assertEqual(checks({"qualification": "stpm", "minimum_cgpa": 3})["Academic qualification"], "unknown")
        with self.assertRaises(ValueError):
            validate_academic_requirements({"qualification": "spm", "minimum_cgpa": 3})
