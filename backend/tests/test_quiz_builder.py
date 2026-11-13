from unittest.mock import patch
import unittest
from app import create_app
from routes.quizzes import validate_quiz
from security import issue_access_token

VALID = {'title':'Pathway Readiness','description':'Explore study interests.','questions':[{'question_text':'Which subject interests you?','options':[{'option_text':'Science','pathway_result':'STPM'},{'option_text':'Design','pathway_result':'Diploma'}]}]}

class QuizBuilderTests(unittest.TestCase):
    def test_drafts_can_be_incomplete_without_losing_question_content(self):
        data={'title':'My draft','status':'draft','questions':[{'question_text':'','options':[{'option_text':'','pathway_result':''}]}]}
        clean,errors=validate_quiz(data)
        self.assertEqual(errors,{})
        self.assertEqual(len(clean['questions']),1)
        self.assertEqual(len(clean['questions'][0]['options']),1)
    def test_publish_requires_questions_and_every_visible_answer(self):
        for questions in [[],[{'question_text':'','options':[]}],[{'question_text':'Question','options':[{'option_text':'A'},{'option_text':''}]}]]:
            with self.subTest(questions=questions):self.assertTrue(validate_quiz({**VALID,'questions':questions})[1])
    def test_field_limits_and_types(self):
        for data in [None,[],{'title':3},{**VALID,'title':'x'*101},{**VALID,'description':'x'*5001},{**VALID,'status':'invalid'},{**VALID,'questions':'invalid'},{**VALID,'questions':[{}]*51}]:
            with self.subTest(data=str(data)[:80]):self.assertTrue(validate_quiz(data)[1])
    def test_option_limits_and_unsupported_question_types(self):
        cases=[{'question_text':'x'*2001,'options':[]},{'question_text':'Q','question_type':'ranking','options':[]},{'question_text':'Q','options':[{'option_text':'x'*256},{'option_text':'B'}]},{'question_text':'Q','options':[{'option_text':'A','pathway_result':'x'*101},{'option_text':'B'}]},{'question_text':'Q','options':[{}]*11}]
        for question in cases:
            with self.subTest(question=str(question)[:80]):self.assertTrue(validate_quiz({**VALID,'questions':[question]})[1])
    def test_legacy_option_fallback_fits_database(self):
        clean,errors=validate_quiz({**VALID,'questions':[{'question_text':'Q','options':[{'option_text':'x'*255},{'option_text':'B'}]}]})
        self.assertEqual(errors,{})
        self.assertEqual(len(clean['questions'][0]['options'][0]['pathway_result']),100)
    @patch('routes.quizzes.get_db_connection')
    def test_owner_scope_and_validation_before_database(self,db):
        client=create_app().test_client()
        advisor={'Authorization':'Bearer '+issue_access_token({'user_id':7,'role':'advisor'})}
        other={'Authorization':'Bearer '+issue_access_token({'user_id':8,'role':'advisor'})}
        self.assertEqual(client.get('/api/quizzes/advisor/7/10').status_code,401)
        self.assertEqual(client.get('/api/quizzes/advisor/7/10',headers=other).status_code,403)
        self.assertEqual(client.post('/api/quizzes/advisor/7',headers=advisor,json={'title':'','questions':[]}).status_code,400)
        self.assertEqual(client.put('/api/quizzes/advisor/7/10',headers=advisor,json=VALID).status_code,400)
        db.assert_not_called()
