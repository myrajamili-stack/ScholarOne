from datetime import datetime, timezone
import json
from unittest import TestCase
from unittest.mock import MagicMock, patch
from uuid import uuid4

from app import create_app
from pathway_seed import starter_pathways
from scripts.seed_career_assessment import prepare_definition, read_source
from security import issue_access_token


class PathwayWorkflowTests(TestCase):
    def setUp(self):
        self.client = create_app().test_client()
        self.connections = {}
        for route in ("students", "assessment_attempts", "pathways"):
            self.connections[route] = self.enterContext(patch(f"routes.{route}.get_db_connection")).return_value
        account = self.enterContext(patch("db.get_db_connection"))
        account.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = {"status": "active"}
        self.student = self.headers(11, "student")
        self.admin = self.headers(1, "admin")

    @staticmethod
    def headers(user_id, role):
        return {"Authorization": "Bearer " + issue_access_token({"user_id": user_id, "role": role})}

    def test_saved_profile_and_assessment_change_recommendations(self):
        profile = {"user_id": 11, "full_name": "Test Student", "education_level": None}
        student_cursor = self.connections["students"].cursor.return_value

        def write_profile(sql, params):
            if "update student" in sql:
                self.assertEqual(params[-1], 11)
                profile.update(education_level=params[3], cgpa=params[5], field_of_study=params[6])
            student_cursor.fetchone.return_value = dict(profile)

        student_cursor.execute.side_effect = write_profile
        saved = {}
        assessment_cursor = self.connections["assessment_attempts"].cursor.return_value.__enter__.return_value
        source = read_source()
        definition, questions = prepare_definition(source)
        definition["database_ids"] = {
            question["source_id"]: {"question_id": index + 1,
                                    "option_ids": [1000 + 10 * index + offset for offset in range(len(question["options"]))]}
            for index, question in enumerate(questions)
        }

        def write_attempt(sql, params):
            row = None
            if "FROM student st" in sql:
                row = {"student_id": 11}
            elif "SELECT quiz_id, assessment_definition" in sql:
                row = {"quiz_id": 7, "assessment_definition": definition}
            elif "INSERT INTO quiz_attempt" in sql:
                self.assertEqual(params[:2], (11, 7))
                saved.update(attempt_id=42, attempt_date=datetime(2026, 11, 24, tzinfo=timezone.utc),
                             assessment_result=params[4].adapted)
                row = saved
            assessment_cursor.fetchone.return_value = row

        assessment_cursor.execute.side_effect = write_attempt
        routes = [{"record": {**row, "pathway_id": index}} for index, row in enumerate(starter_pathways(), 1)]
        pathway_cursor = self.connections["pathways"].cursor.return_value.__enter__.return_value

        def read_recommendation_inputs(sql, params=()):
            if "from student" in sql:
                self.assertEqual(params, (11,))
                pathway_cursor.fetchone.return_value = dict(profile)
            elif "career-assessment" in sql:
                self.assertEqual(params, (11,))
                pathway_cursor.fetchone.return_value = saved or None
            pathway_cursor.fetchall.return_value = routes if "from academic_pathway" in sql else []

        pathway_cursor.execute.side_effect = read_recommendation_inputs

        def recommend():
            response = self.client.get("/api/pathways/recommendations", headers=self.student)
            self.assertEqual(response.status_code, 200, response.json)
            return response.json

        self.assertFalse(recommend()["has_education_level"])
        response = self.client.put("/api/students/11/profile", headers=self.student,
                                   json={"full_name": "Test Student", "education_level": "Diploma", "cgpa": 3.5})
        self.assertEqual(response.status_code, 200, response.json)
        before = recommend()
        self.assertTrue(before["has_education_level"])
        self.assertFalse(before["has_assessment"])
        self.assertEqual(len(before["pathways"]), 2)
        answers = {
            **{question["id"]: question["correct"] for question in source["aptitude"]},
            **{question["id"]: 5 if question["group"] in "RIC" else 1 for question in source["riasec"]},
            **{question["id"]: 3 for question in source["ocean"]},
        }
        response = self.client.post("/api/quizzes/career-assessment/attempts", headers=self.student, json={
            "answers": answers, "rankings": ["value-1", "value-5", "value-6"],
            "assessment_version": definition["version"], "submission_id": str(uuid4()),
        })
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(len(assessment_cursor.executemany.call_args.args[1]), 35)
        after = recommend()
        self.assertTrue(after["has_assessment"])
        self.assertIn("UTM", after["pathways"][0]["title"])
        self.assertTrue(any("latest saved assessment" in reason for reason in after["pathways"][0]["reasons"]))
        self.assertGreater(after["pathways"][0]["ranking_points"], before["pathways"][0]["ranking_points"])

    def test_admin_publish_unpublish_controls_catalogue_details_and_recommendations(self):
        record = {}
        audit = MagicMock()
        connection = self.connections["pathways"]
        cursor = connection.cursor.return_value
        cursor.__enter__.return_value = cursor

        def execute(sql, params=()):
            row = None
            if sql.startswith(("insert into academic_pathway", "update academic_pathway")):
                record.update(zip(("title", "description", "field", "level", "status"), params[:5]))
                record.update(pathway_id=42, guidance=json.loads(params[5]))
                row = dict(record)
            elif sql.startswith("select to_jsonb(p)") and params == (42,):
                row = {"record": dict(record)}
            elif sql.startswith("select education_level"):
                row = {"education_level": "SPM"}
            elif sql.startswith("insert into audit_log"):
                audit(*params)
            cursor.fetchone.return_value = row
            cursor.fetchall.return_value = [{"record": dict(record)}] if sql.startswith("select to_jsonb(p)") else []

        cursor.execute.side_effect = execute

        def assert_visibility(is_visible):
            for endpoint in ("/api/pathways", "/api/pathways/recommendations"):
                response = self.client.get(endpoint, headers=self.student)
                self.assertEqual(response.status_code, 200, response.json)
                self.assertEqual([row["pathway_id"] for row in response.json["pathways"]], [42] if is_visible else [])
            self.assertEqual(self.client.get("/api/pathways/42", headers=self.student).status_code, 200 if is_visible else 404)

        draft = {**starter_pathways()[0], "status": "draft"}
        self.assertEqual(self.client.post("/api/admin/pathways", headers=self.student, json=draft).status_code, 403)
        self.assertEqual(self.client.post("/api/admin/pathways", headers=self.admin, json=draft).status_code, 201)
        assert_visibility(False)
        self.assertEqual(self.client.put("/api/admin/pathways/42", headers=self.admin,
                                         json={**draft, "status": "active"}).status_code, 200)
        assert_visibility(True)
        self.assertEqual(self.client.put("/api/admin/pathways/42", headers=self.admin, json=draft).status_code, 200)
        assert_visibility(False)
        self.assertEqual(audit.call_count, 3)
        self.assertTrue(all(call.args[0] == 1 for call in audit.call_args_list))
