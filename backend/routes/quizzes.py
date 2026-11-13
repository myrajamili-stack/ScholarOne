from contextlib import closing
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request

from db import get_db_connection
from responses import error_response
from security import advisor_access_required
from .advisor_scheduling import active_advisor

quizzes_bp = Blueprint('quizzes', __name__, url_prefix='/api/quizzes')


def validate_quiz(data):
    if not isinstance(data, dict):
        return None, {'form': 'Send a valid quiz object.'}
    errors = {}
    title = data.get('title', '')
    description = data.get('description', '')
    status = data.get('status', 'published')
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 100:
        errors['title'] = 'Enter a quiz title of 1–100 characters.'
    if not isinstance(description, str) or len(description.strip()) > 5000:
        errors['description'] = 'Use at most 5000 characters for the description.'
    if status not in ('draft', 'published'):
        errors['status'] = 'Choose draft or published.'
    questions = data.get('questions', [])
    if not isinstance(questions, list) or len(questions) > 50:
        return None, {**errors, 'questions': 'Use at most 50 questions.'}
    if status == 'published' and not questions:
        errors['questions'] = 'Add at least one question before publishing.'
    cleaned_questions = []
    for question_index, question in enumerate(questions):
        key = f'questions.{question_index}'
        if not isinstance(question, dict):
            errors[key] = 'Enter a valid question.'
            continue
        text = question.get('question_text', '')
        if not isinstance(text, str) or len(text.strip()) > 2000:
            errors[key + '.question_text'] = 'Use at most 2000 characters for a question.'
        elif status == 'published' and not text.strip():
            errors[key + '.question_text'] = 'Enter the question text before publishing.'
        if question.get('question_type', 'multiple_choice') != 'multiple_choice':
            errors[key] = 'The quiz builder supports multiple-choice questions.'
        options = question.get('options', [])
        if not isinstance(options, list) or len(options) > 10:
            errors[key + '.options'] = 'Use at most 10 answer options.'
            continue
        if status == 'published' and len(options) < 2:
            errors[key + '.options'] = 'Add at least two answers to each question.'
        cleaned_options = []
        for option_index, option in enumerate(options):
            option_key = key + f'.options.{option_index}'
            if not isinstance(option, dict):
                errors[option_key] = 'Enter a valid answer option.'
                continue
            option_text = option.get('option_text', '')
            pathway = option.get('pathway_result', '')
            if not isinstance(option_text, str) or len(option_text.strip()) > 255:
                errors[option_key + '.option_text'] = 'Use at most 255 characters for an answer.'
            elif status == 'published' and not option_text.strip():
                errors[option_key + '.option_text'] = 'Enter this answer before publishing.'
            if not isinstance(pathway, str) or len(pathway.strip()) > 100:
                errors[option_key + '.pathway_result'] = 'Use at most 100 characters for the pathway.'
            if isinstance(option_text, str) and isinstance(pathway, str):
                cleaned_options.append({
                    'option_text': option_text.strip(),
                    'pathway_result': pathway.strip() or option_text.strip()[:100],
                })
        if isinstance(text, str):
            cleaned_questions.append({'question_text': text.strip(), 'question_type': 'multiple_choice', 'options': cleaned_options})
    if errors:
        return None, errors
    return {'title': title.strip(), 'description': description.strip(), 'status': status, 'questions': cleaned_questions}, {}


def read_quiz(cursor, advisor_id, quiz_id, lock=False):
    cursor.execute('''SELECT q.quiz_id, q.title, q.description, q.status, q.revision, q.created_at,
        q.assessment_definition IS NOT NULL AS managed_assessment,
        (SELECT count(*) FROM quiz_attempt WHERE quiz_id=q.quiz_id) AS attempt_count,
        (SELECT count(*) FROM quiz_question WHERE quiz_id=q.quiz_id) AS question_count,
        coalesce((SELECT round(avg(score),2) FROM quiz_attempt WHERE quiz_id=q.quiz_id),0) AS average_score
        FROM quiz q WHERE q.advisor_id=%s AND q.quiz_id=%s''' + (' FOR UPDATE OF q' if lock else ''), (advisor_id, quiz_id))
    quiz = cursor.fetchone()
    if not quiz:
        return None
    quiz = dict(quiz)
    if quiz['created_at']:
        quiz['created_at'] = quiz['created_at'].isoformat() + '+08:00'
    cursor.execute('''SELECT question_id, coalesce(question_text,'') AS question_text, coalesce(question_type,'multiple_choice') AS question_type
        FROM quiz_question WHERE quiz_id=%s ORDER BY question_id''', (quiz_id,))
    questions = [dict(question) for question in cursor.fetchall()]
    cursor.execute('''SELECT o.option_id, o.question_id, coalesce(o.option_text,'') AS option_text,
        coalesce(o.pathway_result, left(o.option_text,100),'') AS pathway_result
        FROM quiz_option o JOIN quiz_question q ON q.question_id=o.question_id
        WHERE q.quiz_id=%s ORDER BY o.option_id''', (quiz_id,))
    options = cursor.fetchall()
    for question in questions:
        question['options'] = [dict(option) for option in options if option['question_id'] == question['question_id']]
    quiz['questions'] = questions
    return quiz


def question_content(quiz):
    questions = []
    for question in quiz['questions']:
        options = []
        for option in question['options']:
            text = option['option_text'].strip()
            options.append({'option_text': text, 'pathway_result': option['pathway_result'].strip() or text[:100]})
        questions.append({
            'question_text': question['question_text'].strip(),
            'question_type': question['question_type'],
            'options': options,
        })
    return questions


def write_questions(cursor, quiz_id, questions):
    for question in questions:
        cursor.execute('''INSERT INTO quiz_question(quiz_id,question_text,question_type)
            VALUES(%s,%s,'multiple_choice') RETURNING question_id''', (quiz_id, question['question_text']))
        question_id = cursor.fetchone()['question_id']
        for option in question['options']:
            cursor.execute('INSERT INTO quiz_option(question_id,option_text,pathway_result) VALUES(%s,%s,%s)',
                           (question_id, option['option_text'], option['pathway_result']))


def quiz_error():
    current_app.logger.exception('Quiz request failed')
    return error_response('Unable to load or save quizzes. Please try again.', 503)


@quizzes_bp.route('', methods=['GET'])
def get_quizzes():
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('''SELECT q.quiz_id,coalesce(q.title,'Untitled Quiz') AS title,q.description,q.created_at,q.advisor_id,
                    u.full_name AS advisor_name,a.specialization AS advisor_specialization,
                    (SELECT count(*) FROM quiz_question WHERE quiz_id=q.quiz_id) AS question_count
                    FROM quiz q LEFT JOIN advisor a ON a.advisor_id=q.advisor_id LEFT JOIN app_user u ON u.user_id=q.advisor_id
                    WHERE q.status='published' ORDER BY q.created_at DESC NULLS LAST,q.quiz_id DESC''')
                quizzes = cursor.fetchall()
        return jsonify(quizzes)
    except Exception:
        return quiz_error()


@quizzes_bp.route('/advisor/<int:advisor_id>', methods=['GET'])
@advisor_access_required
def get_advisor_quizzes(advisor_id):
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id):
                    return error_response('Advisor account not found.', 404)
                cursor.execute('''SELECT q.quiz_id,q.title,q.description,q.created_at,q.status,q.revision,
                    q.assessment_definition IS NOT NULL AS managed_assessment,
                    (SELECT count(*) FROM quiz_question WHERE quiz_id=q.quiz_id) AS question_count,
                    (SELECT count(*) FROM quiz_attempt WHERE quiz_id=q.quiz_id) AS attempt_count,
                    coalesce((SELECT round(avg(score),2) FROM quiz_attempt WHERE quiz_id=q.quiz_id),0) AS average_score
                    FROM quiz q WHERE q.advisor_id=%s ORDER BY q.created_at DESC NULLS LAST,q.quiz_id DESC''', (advisor_id,))
                quizzes = [dict(quiz) for quiz in cursor.fetchall()]
                for quiz in quizzes:
                    if quiz['created_at']:
                        quiz['created_at'] = quiz['created_at'].isoformat() + '+08:00'
                cursor.execute('''SELECT count(DISTINCT q.quiz_id) AS total_quizzes,
                    count(DISTINCT q.quiz_id) FILTER(WHERE q.status='published') AS published_count,
                    count(qa.attempt_id) AS total_attempts,count(DISTINCT qa.student_id) AS students_completed,
                    coalesce(round(avg(qa.score),2),0) AS average_score
                    FROM quiz q LEFT JOIN quiz_attempt qa ON qa.quiz_id=q.quiz_id WHERE q.advisor_id=%s''', (advisor_id,))
                summary = cursor.fetchone()
        return jsonify(summary=summary, quizzes=quizzes)
    except Exception:
        return quiz_error()


@quizzes_bp.route('/advisor/<int:advisor_id>', methods=['POST'])
@advisor_access_required
def create_advisor_quiz(advisor_id):
    data = request.get_json(silent=True)
    clean, errors = validate_quiz(data)
    if errors:
        return jsonify(error='Please correct the highlighted fields.', fields=errors), 400
    creation_id = data.get('creation_id')
    if creation_id is not None:
        try:
            creation_id = str(UUID(creation_id))
        except (ValueError, TypeError, AttributeError):
            return error_response('Send a valid quiz creation identifier.', 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id, lock=True):
                    return error_response('Advisor account not found.', 404)
                if creation_id:
                    cursor.execute('SELECT quiz_id FROM quiz WHERE advisor_id=%s AND creation_id=%s', (advisor_id, creation_id))
                    existing = cursor.fetchone()
                    if existing:
                        quiz = read_quiz(cursor, advisor_id, existing['quiz_id'])
                        if any(quiz[key] != clean[key] for key in ('title', 'description', 'status')) or question_content(quiz) != clean['questions']:
                            return error_response('This quiz was already saved with different content. Open it from your quiz list.', 409)
                        return jsonify(message='Quiz already saved.', quiz=quiz), 200
                cursor.execute('INSERT INTO advisor(advisor_id) VALUES(%s) ON CONFLICT(advisor_id) DO NOTHING', (advisor_id,))
                cursor.execute('''INSERT INTO quiz(advisor_id,title,description,status,creation_id)
                    VALUES(%s,%s,%s,%s,%s) RETURNING quiz_id''', (advisor_id, clean['title'], clean['description'], clean['status'], creation_id))
                quiz_id = cursor.fetchone()['quiz_id']
                write_questions(cursor, quiz_id, clean['questions'])
                quiz = read_quiz(cursor, advisor_id, quiz_id)
        return jsonify(message='Quiz saved.', quiz=quiz), 201
    except Exception:
        return quiz_error()


@quizzes_bp.route('/advisor/<int:advisor_id>/<int:quiz_id>', methods=['GET', 'PUT'])
@advisor_access_required
def edit_advisor_quiz(advisor_id, quiz_id):
    clean = None
    if request.method == 'PUT':
        data = request.get_json(silent=True)
        clean, errors = validate_quiz(data)
        if errors:
            return jsonify(error='Please correct the highlighted fields.', fields=errors), 400
        if type(data.get('revision')) is not int:
            return error_response('Reload the quiz before editing.', 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id, lock=request.method == 'PUT'):
                    return error_response('Advisor account not found.', 404)
                quiz = read_quiz(cursor, advisor_id, quiz_id, lock=request.method == 'PUT')
                if not quiz:
                    return error_response('Quiz not found.', 404)
                if request.method == 'GET':
                    return jsonify(quiz=quiz)
                if quiz['managed_assessment']:
                    return error_response('This assessment is managed separately from the quiz builder.', 409)
                if data['revision'] != quiz['revision']:
                    return error_response('This quiz has changed since you opened it. Reload the latest version before saving.', 409)
                questions_changed = question_content(quiz) != clean['questions']
                if quiz['attempt_count'] and questions_changed:
                    return error_response('Questions are locked after student submissions. You can edit the title, description, and publication status.', 409)
                if questions_changed:
                    cursor.execute('DELETE FROM quiz_option WHERE question_id IN (SELECT question_id FROM quiz_question WHERE quiz_id=%s)', (quiz_id,))
                    cursor.execute('DELETE FROM quiz_question WHERE quiz_id=%s', (quiz_id,))
                    write_questions(cursor, quiz_id, clean['questions'])
                cursor.execute('''UPDATE quiz SET title=%s,description=%s,status=%s,revision=revision+1
                    WHERE quiz_id=%s AND advisor_id=%s''', (clean['title'], clean['description'], clean['status'], quiz_id, advisor_id))
                updated = read_quiz(cursor, advisor_id, quiz_id)
        return jsonify(message='Quiz updated.', quiz=updated)
    except Exception:
        return quiz_error()
