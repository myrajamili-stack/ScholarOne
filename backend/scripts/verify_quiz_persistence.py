"""Explicit live save/reload verification using temporary accounts, with cleanup.

Run from backend: python -B scripts/verify_quiz_persistence.py --run
Creates three test accounts and one advisor quiz; commits genuine API submissions,
reloads them using fresh connections, then removes only these identified fixtures.
Never resets sequences or changes existing accounts, quizzes, or student results.
"""
from pathlib import Path
import sys
from uuid import uuid4
from contextlib import closing
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from werkzeug.security import generate_password_hash
from db import get_db_connection
from app import create_app


def verify():
    nonce = uuid4().hex[:16]
    password = uuid4().hex
    fixtures = []
    quiz_id = None
    client = create_app().test_client()
    def expect(response, status):
        if response.status_code != status:
            raise AssertionError(f'Expected HTTP {status}, got {response.status_code}: {response.get_json()}')
        return response.get_json()
    def headers(email):
        data = expect(client.post('/api/auth/login', json={'email': email, 'password': password}), 200)
        return {'Authorization': 'Bearer ' + data['access_token']}
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                for index, role in enumerate(('student', 'student', 'advisor')):
                    email = f'quiz-check-{nonce}-{index}@example.invalid'
                    cursor.execute('''insert into app_user (full_name,email,password,role,status)
                        values (%s,%s,%s,%s,'active') returning user_id''',
                        ('ScholarOne Verification Account', email, generate_password_hash(password, method='pbkdf2:sha256'), role))
                    user_id = cursor.fetchone()['user_id']; fixtures.append((user_id, email, role))
                    if role == 'student':
                        cursor.execute("insert into student (student_id,education_level,cgpa,field_of_study) values (%s,'Diploma',3.50,'Computing')", (user_id,))
                    else:
                        cursor.execute('insert into advisor (advisor_id) values (%s)', (user_id,))
                cursor.execute("select pathway_id,title,field from academic_pathway where status='active' and field in ('Computing','Business') order by field")
                routes = {row['field']: row for row in cursor.fetchall()}
                cursor.execute("select quiz_id,assessment_definition from quiz where assessment_definition->>'key'='career-assessment' and status='published' limit 1")
                career = cursor.fetchone()
        print('Temporary test accounts created; authenticating through the real login API.', flush=True)
        first, second, advisor = [headers(row[1]) for row in fixtures]
        assert 'Computing' in routes and 'Business' in routes and career, 'Published pathways and Career Assessment are required.'
        options = [{'option_text': 'Technical study', 'pathway_result': routes['Computing']['title']},
                   {'option_text': 'Business study', 'pathway_result': routes['Business']['title']}]
        definition = {'title': f'Verification Quiz {nonce}', 'description': 'Temporary automated persistence verification.', 'status': 'published',
                      'questions': [{'question_text': 'Which activity interests you?', 'options': options}, {'question_text': 'Which course would you explore?', 'options': options}]}
        created = expect(client.post(f'/api/quizzes/advisor/{fixtures[2][0]}', json=definition, headers=advisor), 201)['quiz']
        quiz_id = created['quiz_id']
        current = expect(client.get(f'/api/quizzes/{quiz_id}/take', headers=first), 200)['quiz']
        answers = {str(row['question_id']): row['options'][0]['option_id'] for row in current['questions']}
        submitted = {'answers': answers, 'revision': current['revision'], 'submission_id': str(uuid4())}
        saved = expect(client.post(f'/api/quizzes/{quiz_id}/attempts', json=submitted, headers=first), 201)['attempt']
        reloaded = expect(client.get(f'/api/quizzes/{quiz_id}/attempts/latest', headers=first), 200)['attempt']
        assert reloaded == saved
        assert saved['result']['linked_pathways']
        assert expect(client.post(f'/api/quizzes/{quiz_id}/attempts', json=submitted, headers=first), 200)['attempt']['attempt_id'] == saved['attempt_id']
        assert expect(client.get(f'/api/quizzes/{quiz_id}/attempts/latest', headers=second), 200)['attempt'] is None
        submitted = {'answers': {str(row['question_id']): row['options'][1]['option_id'] for row in current['questions']},
                     'revision': current['revision'], 'submission_id': str(uuid4())}
        retake = expect(client.post(f'/api/quizzes/{quiz_id}/attempts', json=submitted, headers=first), 201)['attempt']
        assert retake['result']['leading_outcomes'] != saved['result']['leading_outcomes']
        assert expect(client.get(f'/api/quizzes/{quiz_id}/attempts/latest', headers=first), 200)['attempt']['attempt_id'] == retake['attempt_id']
        submissions = expect(client.get(f'/api/quizzes/advisor/{fixtures[2][0]}/{quiz_id}/attempts', headers=advisor), 200)['attempts']
        assert len(submissions) == 2
        expect(client.get(f'/api/quizzes/advisor/{fixtures[2][0]}/{quiz_id}/attempts', headers=first), 403)
        print('Advisor quiz save/reload, retake, idempotency, student isolation and advisor results passed.', flush=True)
        source = career['assessment_definition']['data']
        answers = {row['id']: row['correct'] for row in source['aptitude']}
        answers.update({row['id']: {'I':5,'R':4,'C':4}.get(row['group'],2) for row in source['riasec']})
        answers.update({row['id']: 3 for row in source['ocean']})
        payload = {'answers': answers, 'rankings': [row['id'] for row in source['values'][:3]],
                   'assessment_version': career['assessment_definition']['version'], 'submission_id': str(uuid4())}
        career_saved = expect(client.post('/api/quizzes/career-assessment/attempts', json=payload, headers=first), 201)['attempt']
        assert expect(client.get('/api/quizzes/career-assessment/attempts/latest', headers=first), 200)['attempt'] == career_saved
        assert expect(client.get('/api/quizzes/career-assessment/attempts/latest', headers=second), 200)['attempt'] is None
        recommendations = expect(client.get('/api/pathways/recommendations', headers=first), 200)
        assert recommendations['has_assessment'] and recommendations['has_advisor_results']
        assert any('advisor quiz outcome' in reason for row in recommendations['pathways'] for reason in row['reasons'])
        print('Career Assessment save/reload and both assessment-to-pathway recommendation links passed.', flush=True)
    finally:
        if fixtures:
            with closing(get_db_connection()) as connection, connection:
                with connection.cursor() as cursor:
                    ids = [row[0] for row in fixtures]
                    # Verify identities before deleting anything; never use broad name patterns.
                    cursor.execute('select user_id,email from app_user where user_id=any(%s)', (ids,))
                    expected = {row[0]:row[1] for row in fixtures}
                    assert all(expected[row['user_id']] == row['email'] for row in cursor.fetchall())
                    cursor.execute('delete from quiz_answer where attempt_id in (select attempt_id from quiz_attempt where student_id=any(%s))', (ids,))
                    cursor.execute('delete from quiz_attempt where student_id=any(%s)', (ids,))
                    if quiz_id is not None:
                        cursor.execute('delete from quiz_option where question_id in (select question_id from quiz_question where quiz_id=%s)', (quiz_id,))
                        cursor.execute('delete from quiz_question where quiz_id=%s', (quiz_id,))
                        cursor.execute('delete from quiz where quiz_id=%s and advisor_id=%s', (quiz_id,fixtures[2][0]))
                    cursor.execute('delete from student where student_id=any(%s)', (ids,))
                    cursor.execute('delete from advisor where advisor_id=any(%s)', (ids,))
                    cursor.execute('delete from app_user where user_id=any(%s)', (ids,))
            print('Temporary test accounts, quiz and results removed. Existing records were preserved.', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] != ['--run']:
        raise SystemExit('Use --run to explicitly allow temporary database fixtures and cleanup.')
    verify()
