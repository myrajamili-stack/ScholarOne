from datetime import datetime
from unittest import TestCase
from unittest.mock import patch

from app import create_app
from security import issue_access_token


class ScholarshipRecommendationTests(TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.connect = self.enterContext(patch("routes.eligibility.get_db_connection"))
        self.enterContext(patch("security.verify_active_account", return_value=None))
        self.enterContext(patch("scholarship_recommendations.malaysia_now",
                                return_value=datetime.fromisoformat("2026-11-24T11:00:00+08:00")))
        self.cursor = self.connect.return_value.cursor.return_value
        self.context = {"residency_state": "Johor", "household_income": 48000, "income_period": "annual"}
        self.catalogue = [
            self.listing(1, "Diploma", 3.0),
            self.listing(2, "Undergraduate", 2.5),
            self.listing(3, "Diploma", 3.0, eligibility_criteria="Submit a citizenship certificate."),
            self.listing(4, None, None, deadline=None),
            self.listing(5, "Diploma", 3.0, deadline_at="2026-11-24T11:00:00+08:00"),
            self.listing(6, "Diploma", 3.9),
            self.listing(7, "Diploma", 3.0, eligible_state="Sabah"),
        ]
        self.cursor.fetchall.return_value = self.catalogue

    @staticmethod
    def listing(identifier, level, cgpa, *, deadline_at=None, **values):
        return {
            "scholarship_id": identifier, "title": f"Award {identifier}", "study_level": level,
            "eligible_state": "Johor", "deadline": "2099-12-31",
            "import_metadata": {
                "deadline_at": deadline_at,
                "eligibility_rules": {"minimum_cgpa": cgpa, "maximum_income": 4000, "income_period": "monthly"},
            },
            **values,
        }

    @staticmethod
    def headers(role="student", student_id=11):
        return {"Authorization": "Bearer " + issue_access_token({"role": role, "user_id": student_id})}

    def recommendations(self, profile, context=None, student_id=11):
        self.cursor.fetchone.return_value = profile
        response = self.client.post("/api/scholarships/recommendations", json=context or {}, headers=self.headers(student_id=student_id))
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        return response.json["recommendations"]

    def test_catalogue_is_ranked_for_different_signed_in_profiles(self):
        diploma = self.recommendations({"education_level": "Diploma", "cgpa": 3.5}, self.context)
        self.assertEqual([(row["scholarship_id"], row["status"]) for row in diploma],
                         [(1, "eligible"), (3, "potentially_eligible"), (4, "insufficient_information")])
        checks = {check["criterion"]: check for check in diploma[0]["checks"]}
        self.assertIn("3.50", checks["CGPA"]["reason"])
        self.assertEqual(checks["Household income"]["status"], "matched")
        self.assertTrue(any("citizenship certificate" in check["reason"] for check in diploma[1]["checks"]))

        undergraduate = self.recommendations({"education_level": "Undergraduate", "cgpa": 2.8}, self.context, student_id=12)
        self.assertEqual([row["scholarship_id"] for row in undergraduate], [2, 4])
        self.assertEqual(self.cursor.execute.call_args_list[-2].args[1], (12,))
        catalogue_sql = self.cursor.execute.call_args.args[0]
        self.assertIn("where lower(s.status) in ('approved', 'active')", catalogue_sql)
        self.assertNotIn("limit", catalogue_sql.lower())
        self.connect.return_value.commit.assert_not_called()

    def test_missing_academics_are_insufficient_and_missing_context_is_potential(self):
        no_profile = self.recommendations(None, self.context)
        self.assertTrue(no_profile)
        self.assertTrue(all(row["status"] == "insufficient_information" for row in no_profile))
        no_context = self.recommendations({"education_level": "Diploma", "cgpa": 3.5})
        self.assertEqual(no_context[0]["status"], "potentially_eligible")
        self.assertTrue(any(check["criterion"] == "State" and check["status"] == "unknown" for check in no_context[0]["checks"]))

    def test_study_field_breaks_ties_without_changing_eligibility(self):
        self.cursor.fetchall.return_value = [
            self.listing(1, "Diploma", 3.0, category="General"),
            self.listing(2, "Diploma", 3.0, category="Computing"),
        ]
        ranked = self.recommendations({"education_level": "Diploma", "cgpa": 3.5,
                                       "field_of_study": "Computing"}, self.context)
        self.assertEqual([row["scholarship_id"] for row in ranked], [2, 1])
        self.assertEqual([row["status"] for row in ranked], ["eligible", "eligible"])
        self.assertIn("saved field of study", ranked[0]["relevance_reasons"][0])

    def test_invalid_context_and_other_roles_cannot_reach_database(self):
        url = "/api/scholarships/recommendations"
        self.assertEqual(self.client.post(url, json={}).status_code, 401)
        self.assertEqual(self.client.post(url, json={}, headers=self.headers("sponsor")).status_code, 403)
        for context in ({"student_id": 12}, {"cgpa": 4}, {"residency_state": "invalid"}, {"household_income": -1}):
            self.assertEqual(self.client.post(url, json=context, headers=self.headers()).status_code, 400)
        self.connect.assert_not_called()
