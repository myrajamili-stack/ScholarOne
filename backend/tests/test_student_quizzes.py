from pathlib import Path
import sys
import unittest
from datetime import datetime
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app
from security import issue_access_token
from advisor_quiz_results import calculate_advisor_result, matches_outcome
from academic_pathways import recommend_pathways
from pathway_seed import starter_pathways

SUBMISSION = '8cb1967c-6071-43b9-a58f-2e3eb9392105'


def quiz():
    return dict(quiz_id=9, title='Study Interests', revision=2, questions=[
        dict(question_id=10, question_text='Preferred activity?', options=[dict(option_id=100, option_text='Build software', pathway_result='Computing'), dict(option_id=101, option_text='Run a business', pathway_result='Business')]),
        dict(question_id=20, question_text='Preferred project?', options=[dict(option_id=200, option_text='Write an app', pathway_result='Computing'), dict(option_id=201, option_text='Plan a business', pathway_result='Business')])])


class AdvisorOutcomeTests(unittest.TestCase):
    def test_counts_outcomes_without_inventing_exam_grade(self):
        result = calculate_advisor_result(quiz(), {'10': 100, '20': 200})
        self.assertEqual(result['leading_outcomes'], ['Computing'])
        self.assertEqual(result['outcomes'], [{'label': 'Computing', 'selections': 2}])
        self.assertNotIn('score', result)
        self.assertEqual(len(result['answers']), 2)

    def test_ties_preserve_all_joint_outcomes(self):
        result = calculate_advisor_result(quiz(), {'10': 100, '20': 201})
        self.assertTrue(result['has_tie'])
        self.assertEqual(set(result['leading_outcomes']), {'Computing', 'Business'})

    def test_missing_extra_wrong_question_and_boolean_answers_rejected(self):
        for answers in ({}, {'10': 100}, {'10': 100, '20': 100}, {'10': True, '20': 200}, {'10': 100, '20': 200, '30': 300}, []):
            with self.subTest(answers=answers), self.assertRaises(ValueError): calculate_advisor_result(quiz(), answers)

    def test_advisor_outcomes_affect_pathway_recommendations_with_reason(self):
        rows = [{**row, 'pathway_id': index + 1} for index, row in enumerate(starter_pathways())]
        results = recommend_pathways(rows, {'education_level': 'Diploma'}, advisor_outcomes=['Business'])
        self.assertIn('UiTM', results[0]['title'])
        self.assertTrue(any('advisor quiz outcome' in reason for reason in results[0]['reasons']))
        self.assertFalse(matches_outcome(rows[0], 'unrelated outcome'))


class StudentQuizApiTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch('security.verify_active_account', return_value=None))
        self.connect = self.enterContext(patch('routes.student_quizzes.get_db_connection'))
        self.cursor = self.connect.return_value.cursor.return_value.__enter__.return_value
        self.read = self.enterContext(patch('routes.student_quizzes.read_available_quiz', return_value=quiz()))
        self.client = create_app().test_client()
        self.headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 11, 'role': 'student'})}
        self.payload = {'answers': {'10': 100, '20': 200}, 'revision': 2, 'submission_id': SUBMISSION}
        self.result = calculate_advisor_result(quiz(), self.payload['answers'])
        self.saved = dict(attempt_id=42, quiz_id=9, attempt_date=datetime(2026,11,20,12), assessment_result=self.result)

    def test_submission_saves_result_and_each_answer_under_signed_in_student(self):
        self.cursor.fetchone.side_effect = [None, self.saved]
        self.cursor.fetchall.return_value = []
        response = self.client.post('/api/quizzes/9/attempts', json=self.payload, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.json)
        self.assertEqual(response.json['attempt']['result']['leading_outcomes'], ['Computing'])
        insert = next(call for call in self.cursor.execute.call_args_list if 'insert into quiz_attempt' in call.args[0])
        self.assertEqual(insert.args[1][:2], (11, 9))
        self.assertIn('NULL', insert.args[0])
        self.assertEqual(self.cursor.executemany.call_args.args[1], [(42,10,100),(42,20,200)])

    def test_retry_is_idempotent_and_rejects_conflicting_answers(self):
        self.cursor.fetchone.return_value = {**self.saved, 'assessment_answers': {'answers': self.payload['answers'], 'revision': 2}}
        self.assertEqual(self.client.post('/api/quizzes/9/attempts', json=self.payload, headers=self.headers).status_code, 200)
        self.read.assert_not_called()
        response = self.client.post('/api/quizzes/9/attempts', json={**self.payload, 'answers': {'10': 101, '20': 201}}, headers=self.headers)
        self.assertEqual(response.status_code, 409)
        self.cursor.executemany.assert_not_called()

    def test_draft_or_unavailable_quiz_and_stale_revision_are_rejected(self):
        self.cursor.fetchone.return_value = None
        self.assertEqual(self.client.post('/api/quizzes/9/attempts', json={**self.payload, 'revision': 1}, headers=self.headers).status_code, 409)
        self.read.return_value = None
        self.assertEqual(self.client.get('/api/quizzes/9/take', headers=self.headers).status_code, 404)
        self.assertEqual(self.client.post('/api/quizzes/9/attempts', json=self.payload, headers=self.headers).status_code, 404)
        self.cursor.executemany.assert_not_called()

    def test_take_payload_does_not_expose_outcome_mappings(self):
        response = self.client.get('/api/quizzes/9/take', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('pathway_result', response.json['quiz']['questions'][0]['options'][0])

    def test_reload_only_reads_own_saved_results(self):
        self.cursor.fetchall.return_value = [self.saved]
        response = self.client.get('/api/quizzes/9/attempts/latest', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['attempt']['result'], self.result)
        self.assertEqual(self.cursor.execute.call_args.args[1], (11,9,9))

    def test_advisor_submission_access_requires_quiz_ownership(self):
        headers = {'Authorization': 'Bearer ' + issue_access_token({'user_id': 7, 'role': 'advisor'})}
        self.cursor.fetchone.return_value = None
        response = self.client.get('/api/quizzes/advisor/7/9/attempts', headers=headers)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(self.cursor.execute.call_args.args[1], (9,7))
        self.assertEqual(self.client.get('/api/quizzes/advisor/8/9/attempts', headers=headers).status_code, 403)

    def test_invalid_identity_and_submission_fields_never_reach_database(self):
        for payload in ({**self.payload, 'student_id': 12}, {**self.payload, 'submission_id': 'bad'}, {**self.payload, 'revision': True}):
            self.assertEqual(self.client.post('/api/quizzes/9/attempts', json=payload, headers=self.headers).status_code, 400)
        self.connect.assert_not_called()

    def test_failed_save_does_not_return_success(self):
        self.cursor.fetchone.return_value = None
        self.cursor.fetchall.return_value = []
        self.cursor.executemany.side_effect = RuntimeError('private database detail')
        self.cursor.fetchone.side_effect = [None, self.saved]
        response = self.client.post('/api/quizzes/9/attempts', json=self.payload, headers=self.headers)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private database detail', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
