from uuid import UUID
from contextlib import closing
from flask import Blueprint, jsonify, request, g
from psycopg2.extras import Json
from db import get_db_connection
from security import student_access_required, advisor_access_required
from responses import error_response
from advisor_quiz_results import calculate_advisor_result, matches_outcome, matches_interest
from likert_assessments import calculate_likert_result, public_definition
from pathway_preference import CODE as PREFERENCE_CODE
from quiz_language import apply_quiz_language

student_quizzes_bp = Blueprint('student_quizzes', __name__, url_prefix='/api/quizzes')


def read_available_quiz(cursor, quiz_id, lock=False):
    cursor.execute("""select q.quiz_id,q.title,q.description,q.revision,u.full_name as advisor_name,q.assessment_definition
        from quiz q join app_user u on u.user_id=q.advisor_id
        where q.quiz_id=%s and q.status='published'
        and (q.assessment_definition is null or q.assessment_definition->>'key' in ('advisor-likert','advisor-mcq-language'))
        and u.role='advisor' and u.status='active'""" + (' for update of q' if lock else ''), (quiz_id,))
    row = cursor.fetchone()
    if not row: return None
    quiz = dict(row)
    definition = quiz.pop('assessment_definition', None)
    if definition and definition.get('key') == 'advisor-likert':
        quiz['assessment'] = definition
        quiz['questions'] = []
        return quiz
    cursor.execute('select question_id,question_text,question_type from quiz_question where quiz_id=%s order by question_id', (quiz_id,))
    questions = [dict(row) for row in cursor.fetchall()]
    cursor.execute('''select o.option_id,o.question_id,o.option_text,o.pathway_result from quiz_option o
        join quiz_question q on q.question_id=o.question_id where q.quiz_id=%s order by o.option_id''', (quiz_id,))
    options = cursor.fetchall()
    for question in questions:
        question['options'] = [dict(row) for row in options if row['question_id'] == question['question_id']]
    if not questions or any(row['question_type'] != 'multiple_choice' or len(row['options']) < 2 for row in questions):
        return None
    quiz['questions'] = questions
    apply_quiz_language(quiz, definition)
    return quiz


def serialized_attempt(row):
    value = row['attempt_date']
    return dict(attempt_id=row['attempt_id'], quiz_id=row['quiz_id'], submitted_at=value.isoformat() if hasattr(value, 'isoformat') else value,
                result=row['assessment_result'])


@student_quizzes_bp.route('/<int:quiz_id>/take', methods=['GET'])
@student_access_required
def take_quiz(quiz_id):
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                quiz = read_available_quiz(cursor, quiz_id)
        if not quiz: return error_response('This advisor quiz is unavailable or not ready to take.', 404)
        if quiz.get('assessment'):
            quiz['assessment'] = public_definition(quiz['assessment'])
        # Outcome mappings are processed by the server, not accepted from the browser.
        for question in quiz['questions']:
            for option in question['options']: option.pop('pathway_result', None)
        return jsonify(quiz=quiz)
    except Exception:
        return error_response('Unable to load this quiz. Please try again.', 503)


@student_quizzes_bp.route('/<int:quiz_id>/attempts', methods=['POST'])
@student_access_required
def submit_quiz(quiz_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or set(payload) != {'answers', 'revision', 'submission_id'} or type(payload.get('revision')) is not int:
        return error_response('Send answers, the quiz revision, and a submission identifier.', 400)
    try: submission_id = str(UUID(payload['submission_id']))
    except (ValueError, TypeError, AttributeError): return error_response('Send a valid submission identifier.', 400)
    submitted = {'answers': payload['answers'], 'revision': payload['revision']}
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('select pg_advisory_xact_lock(hashtextextended(%s,0))', (f'advisor-quiz:{g.student_id}:{quiz_id}:{submission_id}',))
                cursor.execute('''select attempt_id,quiz_id,attempt_date,assessment_answers,assessment_result
                    from quiz_attempt where student_id=%s and quiz_id=%s and submission_id=%s''', (g.student_id, quiz_id, submission_id))
                existing = cursor.fetchone()
                if existing:
                    if existing['assessment_answers'] != submitted:
                        return error_response('This submission identifier was already used with different answers.', 409)
                    return jsonify(attempt=serialized_attempt(existing)), 200
                quiz = read_available_quiz(cursor, quiz_id, lock=True)
                if not quiz: return error_response('This advisor quiz is no longer available.', 404)
                if quiz['revision'] != payload['revision']:
                    return error_response('This quiz changed after you opened it. Reload it before submitting.', 409)
                is_likert = bool(quiz.get('assessment'))
                result = calculate_likert_result(quiz, payload['answers']) if is_likert else calculate_advisor_result(quiz, payload['answers'])
                if quiz.get('assessment_code') == PREFERENCE_CODE:
                    result['linked_pathways'] = []
                    result_pathway = ' / '.join(result['leading_outcomes'])
                else:
                    matcher = matches_interest if is_likert else matches_outcome
                    terms = result['pathway_terms'] if is_likert else result['leading_outcomes']
                    cursor.execute('select to_jsonb(p) as record from academic_pathway p')
                    result['linked_pathways'] = [dict(pathway_id=row['record']['pathway_id'], title=row['record']['title']) for row in cursor.fetchall()
                        if row['record'].get('status') == 'active' and any(matcher(row['record'], term) for term in terms)]
                    result_pathway = result['leading_outcomes'][0]
                cursor.execute('''insert into quiz_attempt (student_id,quiz_id,score,result_pathway,assessment_answers,assessment_result,assessment_version,submission_id)
                    values (%s,%s,NULL,%s,%s,%s,%s,%s) returning attempt_id,quiz_id,attempt_date,assessment_result''',
                    (g.student_id,quiz_id,result_pathway[:100],Json(submitted),Json(result),quiz['revision'],submission_id))
                saved = cursor.fetchone()
                if not is_likert:
                    cursor.executemany('insert into quiz_answer (attempt_id,question_id,selected_option_id) values (%s,%s,%s)',
                                       [(saved['attempt_id'], row['question_id'], row['selected_option_id']) for row in result['answers']])
        return jsonify(attempt=serialized_attempt(saved)), 201
    except ValueError as error:
        return error_response(str(error), 400)
    except Exception:
        return error_response('Unable to save your quiz. Your answers are still here; please try again.', 503)


@student_quizzes_bp.route('/attempts', methods=['GET'])
@student_quizzes_bp.route('/<int:quiz_id>/attempts/latest', methods=['GET'])
@student_access_required
def saved_quizzes(quiz_id=None):
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""select distinct on (qa.quiz_id) qa.attempt_id,qa.quiz_id,qa.attempt_date,qa.assessment_result
                    from quiz_attempt qa where qa.student_id=%s and qa.assessment_result->>'kind'='advisor_quiz'
                    and (%s is null or qa.quiz_id=%s) order by qa.quiz_id,qa.attempt_date desc,qa.attempt_id desc""", (g.student_id,quiz_id,quiz_id))
                rows = cursor.fetchall()
        attempts = sorted([serialized_attempt(row) for row in rows], key=lambda row: row['submitted_at'], reverse=True)
        return jsonify(attempt=attempts[0] if attempts else None) if quiz_id is not None else jsonify(attempts=attempts)
    except Exception:
        return error_response('Unable to load saved advisor quiz results.', 503)


@student_quizzes_bp.route('/advisor/<int:advisor_id>/<int:quiz_id>/attempts', methods=['GET'])
@advisor_access_required
def advisor_submissions(advisor_id, quiz_id):
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""select quiz_id from quiz where quiz_id=%s and advisor_id=%s
                    and (assessment_definition is null or assessment_definition->>'key' in ('advisor-likert','advisor-mcq-language'))""", (quiz_id,advisor_id))
                if not cursor.fetchone(): return error_response('Quiz not found in your library.', 404)
                cursor.execute("""select qa.attempt_id,qa.quiz_id,qa.attempt_date,qa.assessment_result,u.full_name as student_name
                    from quiz_attempt qa join app_user u on u.user_id=qa.student_id where qa.quiz_id=%s
                    and qa.assessment_result->>'kind'='advisor_quiz' order by qa.attempt_date desc,qa.attempt_id desc limit 200""", (quiz_id,))
                rows = cursor.fetchall()
        return jsonify(attempts=[{**serialized_attempt(row), 'student_name':row['student_name']} for row in rows])
    except Exception:
        return error_response('Unable to load quiz submissions.', 503)


@student_quizzes_bp.route('/advisor/<int:advisor_id>/pathways', methods=['GET'])
@advisor_access_required
def advisor_pathway_choices(advisor_id):
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                cursor.execute('select to_jsonb(p) as record from academic_pathway p order by title')
                choices = [dict(pathway_id=row['record']['pathway_id'], title=row['record']['title']) for row in cursor.fetchall() if row['record'].get('status') == 'active']
        return jsonify(pathways=choices)
    except Exception:
        return error_response('Unable to load pathway choices.', 503)
