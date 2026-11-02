import copy
from datetime import datetime
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import MagicMock, patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app import create_app
from career_assessment import answer_rows, calculate_result
from scripts.seed_career_assessment import prepare_definition, read_source
from security import issue_access_token


class AssessmentPersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = read_source()
        cls.definition, questions = prepare_definition(cls.data)
        cls.definition["database_ids"] = {
            question["source_id"]: {"question_id": index + 1,
                                    "option_ids": [1000 + index * 10 + i for i in range(len(question["options"]))]}
            for index, question in enumerate(questions)
        }
        cls.answers = {
            **{q["id"]: q["correct"] for q in cls.data["aptitude"]},
            **{q["id"]: 3 for q in cls.data["riasec"]},
            **{q["id"]: 3 for q in cls.data["ocean"]},
        }
        cls.rankings = ["value-1", "value-5", "value-6"]

    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()
        self.headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 11, "role": "student"})}
        self.payload = {"answers": self.answers, "rankings": self.rankings, "assessment_version": 1,
                        "submission_id": "9a60f924-026e-4ccf-8a79-3d365d10cbb4"}
        self.saved = {"attempt_id": 42, "attempt_date": datetime(2026, 10, 30, 12),
                      "assessment_result": calculate_result(self.definition, self.answers, self.rankings)}

    def database(self, rows):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.side_effect = rows
        return connection, cursor

    def test_backend_scoring_matches_frontend_for_two_opposite_profiles(self):
        root = BACKEND.parent
        javascript = """
          import data from './frontend/src/data/career-assessment.ts';
          import {scoreCareerAssessment} from './frontend/src/utils/careerAssessment.ts';
          const scenarios=[{R:4,I:5,A:1,S:2,E:1,C:4},{R:1,I:1,A:4,S:5,E:3,C:1}];
          const results=scenarios.map((ratings,index)=>{
            const answers=Object.fromEntries([
              ...data.aptitude.map(q=>[q.id,index ? (q.correct+1)%4 : q.correct]),
              ...data.riasec.map(q=>[q.id,ratings[q.group]]),
              ...data.ocean.map((q,i)=>[q.id,(i+index)%5+1])]);
            const rankings=['value-4','value-6','value-3'];
            return {answers,rankings,result:scoreCareerAssessment(answers,rankings)};
          });
          process.stdout.write(JSON.stringify(results));
        """
        cases = json.loads(subprocess.run(["node", "--input-type=module", "-e", javascript],
                                          cwd=root, capture_output=True, text=True, check=True).stdout)
        for case in cases:
            self.assertEqual(calculate_result(self.definition, case["answers"], case["rankings"]), case["result"])

    def test_rejects_missing_out_of_range_and_boolean_answers(self):
        for answers in [{}, {**self.answers, "riasec-1": 6}, {**self.answers, "aptitude-1": True}]:
            with self.assertRaises(ValueError):
                calculate_result(self.definition, answers, self.rankings)

    def test_rejects_duplicate_unknown_and_non_string_rankings(self):
        for rankings in [["value-1"] * 3, ["other", "value-1", "value-2"], [[1], "value-1", "value-2"]]:
            with self.assertRaises(ValueError):
                calculate_result(self.definition, self.answers, rankings)

    def test_creates_35_answer_rows_and_preserves_rank_order(self):
        rows = answer_rows(self.definition, self.answers, self.rankings, 42)
        self.assertEqual(len(rows), 35)
        self.assertTrue(all(row[0] == 42 for row in rows))
        self.assertEqual([row[3] for row in rows[-3:]], [1, 2, 3])
        mapping = self.definition["database_ids"]["work-values-ranking"]
        self.assertEqual([row[2] for row in rows[-3:]], [mapping["option_ids"][i] for i in [0, 4, 5]])

    @patch("routes.assessment_attempts.get_db_connection")
    def test_missing_or_forged_token_cannot_access_database(self, get_connection):
        for headers in [{}, {"Authorization": "Bearer forged-token"}]:
            self.assertEqual(self.client.get('/api/quizzes/career-assessment/attempts/latest', headers=headers).status_code, 401)
            self.assertEqual(self.client.post('/api/quizzes/career-assessment/attempts', headers=headers, json=self.payload).status_code, 401)
        get_connection.assert_not_called()

    @patch("routes.assessment_attempts.get_db_connection")
    def test_non_student_token_is_rejected(self, get_connection):
        headers = {"Authorization": "Bearer " + issue_access_token({"user_id": 10, "role": "advisor"})}
        self.assertEqual(self.client.get('/api/quizzes/career-assessment/attempts/latest', headers=headers).status_code, 403)
        get_connection.assert_not_called()

    @patch("routes.assessment_attempts.get_db_connection")
    def test_saved_result_is_server_calculated_and_student_id_is_from_token(self, get_connection):
        connection, cursor = self.database([{"student_id": 11}, {"quiz_id": 3, "assessment_definition": self.definition}, None, self.saved])
        get_connection.return_value = connection
        response = self.client.post('/api/quizzes/career-assessment/attempts', headers=self.headers,
                                    json={**self.payload, "student_id": 999, "result": {"hollandCode": "FAKE"}})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['attempt']['result'], self.saved['assessment_result'])
        insert = next(call for call in cursor.execute.call_args_list if 'INSERT INTO quiz_attempt' in call.args[0])
        self.assertEqual(insert.args[1][0], 11)
        self.assertEqual(len(cursor.executemany.call_args.args[1]), 35)
        connection.close.assert_called_once()

    @patch("routes.assessment_attempts.get_db_connection")
    def test_identical_retry_returns_same_attempt_without_inserting(self, get_connection):
        existing = {**self.saved, "assessment_answers": {"answers": self.answers, "rankings": self.rankings}}
        connection, cursor = self.database([{"student_id": 11}, {"quiz_id": 3, "assessment_definition": self.definition}, existing])
        get_connection.return_value = connection
        response = self.client.post('/api/quizzes/career-assessment/attempts', headers=self.headers, json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['attempt']['attempt_id'], 42)
        cursor.executemany.assert_not_called()

    @patch("routes.assessment_attempts.get_db_connection")
    def test_reused_submission_id_with_different_answers_is_rejected(self, get_connection):
        previous = copy.deepcopy(self.answers)
        previous['riasec-1'] = 1
        existing = {**self.saved, "assessment_answers": {"answers": previous, "rankings": self.rankings}}
        connection, cursor = self.database([{"student_id": 11}, {"quiz_id": 3, "assessment_definition": self.definition}, existing])
        get_connection.return_value = connection
        response = self.client.post('/api/quizzes/career-assessment/attempts', headers=self.headers, json=self.payload)
        self.assertEqual(response.status_code, 409)
        cursor.executemany.assert_not_called()

    @patch("routes.assessment_attempts.get_db_connection")
    def test_load_queries_only_the_signed_in_student(self, get_connection):
        connection, cursor = self.database([{"student_id": 11}, self.saved])
        get_connection.return_value = connection
        response = self.client.get('/api/quizzes/career-assessment/attempts/latest?student_id=999', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(cursor.execute.call_args.args[1][0], 11)

    @patch("routes.assessment_attempts.get_db_connection")
    def test_failure_returns_generic_error_without_success(self, get_connection):
        connection, cursor = self.database([{"student_id": 11}, {"quiz_id": 3, "assessment_definition": self.definition}, None, self.saved])
        cursor.executemany.side_effect = RuntimeError('private connection details')
        get_connection.return_value = connection
        response = self.client.post('/api/quizzes/career-assessment/attempts', headers=self.headers, json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private', response.get_data(as_text=True))
        self.assertIsNotNone(connection.__exit__.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
