from contextlib import closing
from uuid import UUID

from flask import Blueprint, current_app, jsonify, request
from psycopg2.extras import Json

from db import get_db_connection
from responses import error_response
from security import advisor_access_required
from likert_assessments import builder_config, number_questions, validate_definition
from pathway_preference import CATEGORIES, CODE as PREFERENCE_CODE, OPTION_COUNT, QUESTION_COUNT as PREFERENCE_QUESTION_COUNT
from quiz_language import apply_quiz_language
from .advisor_scheduling import active_advisor

quizzes_bp = Blueprint('quizzes', __name__, url_prefix='/api/quizzes')
QUESTION_COUNT = """CASE WHEN q.assessment_definition->>'key' = 'advisor-likert'
    THEN jsonb_array_length(q.assessment_definition->'questions')
    ELSE (SELECT count(*) FROM quiz_question WHERE quiz_id=q.quiz_id) END"""


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
    assessment_type = data.get('assessment_type', 'likert' if 'assessment' in data else 'multiple_choice')
    is_preference = data.get('assessment_code') == PREFERENCE_CODE
    if data.get('assessment_code', '') not in ('', PREFERENCE_CODE):
        errors['assessment_code'] = 'Choose a supported answer outcome mode.'
    if assessment_type == 'likert':
        if is_preference:
            errors['assessment_code'] = 'APPA-001 uses multiple-choice questions.'
        assessment, validation = validate_definition(data.get('assessment'), status == 'published')
        if status == 'published' and isinstance(description, str) and not description.strip():
            errors['description'] = 'Enter the assessment purpose before publishing.'
        errors.update(validation)
        if errors:
            return None, errors
        return dict(title=title.strip(), description=description.strip(), status=status, assessment=assessment, questions=[]), {}
    if assessment_type != 'multiple_choice':
        errors['assessment_type'] = 'Choose multiple choice or Likert scale.'
    elif 'assessment' in data:
        errors['assessment_type'] = 'Likert settings require the Likert assessment type.'
    language = data.get('language', 'en')
    if language not in ('en', 'ms', 'both'):
        errors['language'] = 'Choose English, Malay or both.'
    questions = data.get('questions', [])
    max_questions = PREFERENCE_QUESTION_COUNT if is_preference else 50
    if not isinstance(questions, list) or len(questions) > max_questions:
        return None, {**errors, 'questions': f'Use at most {max_questions} questions.'}
    if status == 'published' and is_preference and len(questions) != max_questions:
        errors['questions'] = f'Add exactly {max_questions} questions before publishing APPA-001.'
    elif status == 'published' and not questions:
        errors['questions'] = 'Add at least one question before publishing.'
    cleaned_questions = []
    translations = []
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
        translated_text = ''
        if language == 'both':
            translated_text = translated_label(question, 'question_text_ms', 2000, key, status, errors)
        options = question.get('options', [])
        max_options = OPTION_COUNT if is_preference else 10
        if not isinstance(options, list) or len(options) > max_options:
            errors[key + '.options'] = f'Use at most {max_options} answer options.'
            continue
        if status == 'published' and is_preference and len(options) != max_options:
            errors[key + '.options'] = f'Add exactly {max_options} answers to each APPA-001 question.'
        elif status == 'published' and len(options) < 2:
            errors[key + '.options'] = 'Add at least two answers to each question.'
        cleaned_options = []
        translated_options = []
        for option_index, option in enumerate(options):
            option_key = key + f'.options.{option_index}'
            if not isinstance(option, dict):
                errors[option_key] = 'Enter a valid answer option.'
                continue
            option_text = option.get('option_text', '')
            if language == 'both':
                translated_options.append(translated_label(option, 'option_text_ms', 255, option_key, status, errors))
            pathway = option.get('pathway_result', '')
            if not isinstance(option_text, str) or len(option_text.strip()) > 255:
                errors[option_key + '.option_text'] = 'Use at most 255 characters for an answer.'
            elif status == 'published' and not option_text.strip():
                errors[option_key + '.option_text'] = 'Enter this answer before publishing.'
            if is_preference and (not isinstance(pathway, str) or
                                  (pathway not in CATEGORIES and (pathway != '' or status == 'published'))):
                errors[option_key + '.pathway_result'] = 'Choose F, S, D or T.'
            elif not isinstance(pathway, str) or len(pathway.strip()) > 100:
                errors[option_key + '.pathway_result'] = 'Use at most 100 characters for the pathway.'
            if isinstance(option_text, str) and isinstance(pathway, str):
                cleaned_options.append({
                    'option_text': option_text.strip(),
                    'pathway_result': pathway if is_preference else pathway.strip() or option_text.strip()[:100],
                })
        if isinstance(text, str):
            cleaned_questions.append({'question_text': text.strip(), 'question_type': 'multiple_choice', 'options': cleaned_options})
            if language == 'both':
                translations.append({'question': translated_text, 'options': translated_options})
    if errors:
        return None, errors
    clean = {'title': title.strip(), 'description': description.strip(), 'status': status, 'questions': cleaned_questions}
    if language != 'en' or is_preference:
        clean['localization'] = dict(key='advisor-mcq-language', language=language, translations=translations)
        if is_preference:
            clean['localization']['assessment_code'] = PREFERENCE_CODE
    return clean, {}


def translated_label(row, field, limit, path, status, errors):
    value = row.get(field, '')
    if not isinstance(value, str) or len(value.strip()) > limit or (status == 'published' and not value.strip()):
        errors[f'{path}.{field}'] = f'Enter the Malay text (up to {limit} characters).'
        return ''
    return value.strip()


def read_quiz(cursor, advisor_id, quiz_id, lock=False):
    if lock:
        # Read the attempt count after acquiring the row lock shared with submissions.
        cursor.execute('SELECT quiz_id FROM quiz WHERE advisor_id=%s AND quiz_id=%s FOR UPDATE', (advisor_id, quiz_id))
        if not cursor.fetchone():
            return None
    cursor.execute(f'''SELECT q.quiz_id, q.title, q.description, q.status, q.revision, q.created_at,
        q.assessment_definition IS NOT NULL AND coalesce(q.assessment_definition->>'key','') NOT IN ('advisor-likert','advisor-mcq-language') AS managed_assessment,
        CASE WHEN q.assessment_definition->>'key'='advisor-likert' THEN q.assessment_definition END AS assessment,
        CASE WHEN q.assessment_definition->>'key'='advisor-mcq-language' THEN q.assessment_definition END AS localization,
        (SELECT count(*) FROM quiz_attempt WHERE quiz_id=q.quiz_id) AS attempt_count,
        {QUESTION_COUNT} AS question_count,
        coalesce((SELECT round(avg(score),2) FROM quiz_attempt WHERE quiz_id=q.quiz_id),0) AS average_score
        FROM quiz q WHERE q.advisor_id=%s AND q.quiz_id=%s''', (advisor_id, quiz_id))
    quiz = cursor.fetchone()
    if not quiz:
        return None
    quiz = dict(quiz)
    quiz['assessment_type'] = 'likert' if quiz.get('assessment') is not None else 'multiple_choice'
    if quiz['created_at']:
        quiz['created_at'] = quiz['created_at'].isoformat() + '+08:00'
    if quiz['assessment_type'] == 'likert':
        quiz['assessment'] = number_questions(quiz['assessment'])
        quiz['next_question_number'] = quiz['assessment']['next_question_number']
        quiz['questions'] = []
        return quiz
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
    apply_quiz_language(quiz, quiz.get('localization'))
    quiz['next_question_number'] = (quiz.get('localization') or {}).get('next_question_number', 1)
    return quiz


def question_content(quiz):
    questions = []
    for question in quiz['questions']:
        options = []
        for option in question['options']:
            text = option['option_text'].strip()
            pathway = option['pathway_result'].strip()
            options.append({'option_text': text, 'pathway_result': pathway if quiz.get('assessment_code') == PREFERENCE_CODE else pathway or text[:100]})
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
        write_options(cursor, question_id, question['options'])


def write_options(cursor, question_id, options):
    for option in options:
        cursor.execute('INSERT INTO quiz_option(question_id,option_text,pathway_result) VALUES(%s,%s,%s)',
                       (question_id, option['option_text'], option['pathway_result']))


def ordered_ids(existing, submitted, field):
    ids = [row.get(field) for row in submitted]
    retained = [value for value in ids if value is not None]
    if (any(field not in row for row in submitted)
            or any(type(value) is not int for value in retained)
            or retained != [row[field] for row in existing if row[field] in retained]
            or ids != retained + [None] * (len(ids) - len(retained))):
        raise ValueError('Reload the draft to retain its existing question and answer order.')
    return ids


def preference_edit_ids(existing_questions, submitted_questions):
    question_ids = ordered_ids(existing_questions, submitted_questions, 'question_id')
    existing = {question['question_id']: question['options'] for question in existing_questions}
    return [(question_id, ordered_ids(existing.get(question_id, []), question['options'], 'option_id'))
            for question_id, question in zip(question_ids, submitted_questions)]


def update_preference_questions(cursor, quiz_id, existing, questions, identities):
    retained = [question_id for question_id, _ in identities if question_id is not None]
    removed = [question['question_id'] for question in existing if question['question_id'] not in retained]
    if removed:
        cursor.execute('DELETE FROM quiz_option WHERE question_id=ANY(%s)', (removed,))
        cursor.execute('DELETE FROM quiz_question WHERE quiz_id=%s AND question_id=ANY(%s)', (quiz_id, removed))
    for question, (question_id, option_ids) in zip(questions, identities):
        if question_id is None:
            write_questions(cursor, quiz_id, [question])
            continue
        cursor.execute('UPDATE quiz_question SET question_text=%s WHERE quiz_id=%s AND question_id=%s',
                       (question['question_text'], quiz_id, question_id))
        cursor.execute('DELETE FROM quiz_option WHERE question_id=%s AND NOT (option_id=ANY(%s))',
                       (question_id, [option_id for option_id in option_ids if option_id is not None]))
        for option, option_id in zip(question['options'], option_ids):
            if option_id is None:
                write_options(cursor, question_id, [option])
            else:
                cursor.execute('UPDATE quiz_option SET option_text=%s,pathway_result=%s WHERE question_id=%s AND option_id=%s',
                               (option['option_text'], option['pathway_result'], question_id, option_id))


def quiz_error():
    current_app.logger.exception('Quiz request failed')
    return error_response('Unable to load or save quizzes. Please try again.', 503)


@quizzes_bp.route('', methods=['GET'])
def get_quizzes():
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute(f'''SELECT q.quiz_id,coalesce(q.title,'Untitled Quiz') AS title,q.description,q.created_at,q.advisor_id,
                    u.full_name AS advisor_name,a.specialization AS advisor_specialization,
                    {QUESTION_COUNT} AS question_count
                    FROM quiz q LEFT JOIN advisor a ON a.advisor_id=q.advisor_id LEFT JOIN app_user u ON u.user_id=q.advisor_id
                    WHERE q.status='published' AND (q.advisor_id IS NULL OR (u.role='advisor' AND u.status='active'))
                    ORDER BY q.created_at DESC NULLS LAST,q.quiz_id DESC''')
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
                cursor.execute(f'''SELECT q.quiz_id,q.title,q.description,q.created_at,q.status,q.revision,
                    q.assessment_definition IS NOT NULL AND coalesce(q.assessment_definition->>'key','') NOT IN ('advisor-likert','advisor-mcq-language') AS managed_assessment,
                    CASE WHEN q.assessment_definition->>'key'='advisor-likert' THEN 'likert' ELSE 'multiple_choice' END AS assessment_type,
                    {QUESTION_COUNT} AS question_count,
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


@quizzes_bp.route('/advisor/<int:advisor_id>/assessment-templates', methods=['GET'])
@advisor_access_required
def assessment_templates(advisor_id):
    return jsonify(builder_config())


@quizzes_bp.route('/advisor/<int:advisor_id>', methods=['POST'])
@advisor_access_required
def create_advisor_quiz(advisor_id):
    data = request.get_json(silent=True)
    clean, errors = validate_quiz(data)
    if errors:
        return jsonify(error='Please correct the highlighted fields.', fields=errors), 400
    if clean.get('assessment') and clean['status'] != 'draft':
        return error_response('Save the Likert assessment as a draft before publishing.', 409)
    if clean.get('assessment'):
        try:
            clean['assessment'] = number_questions(clean['assessment'])
        except ValueError as error:
            return error_response(str(error), 400)
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
                        if (any(quiz[key] != clean[key] for key in ('title', 'description', 'status'))
                                or quiz.get('assessment') != clean.get('assessment') or quiz.get('localization') != clean.get('localization')
                                or question_content(quiz) != clean['questions']):
                            return error_response('This quiz was already saved with different content. Open it from your quiz list.', 409)
                        return jsonify(message='Quiz already saved.', quiz=quiz), 200
                cursor.execute('INSERT INTO advisor(advisor_id) VALUES(%s) ON CONFLICT(advisor_id) DO NOTHING', (advisor_id,))
                definition = clean.get('assessment') or clean.get('localization')
                cursor.execute('''INSERT INTO quiz(advisor_id,title,description,status,creation_id,assessment_definition)
                    VALUES(%s,%s,%s,%s,%s,%s) RETURNING quiz_id''', (advisor_id, clean['title'], clean['description'], clean['status'], creation_id,
                                                                 Json(definition) if definition else None))
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
                    response = jsonify(quiz=quiz)
                    response.headers['Cache-Control'] = 'no-store'
                    return response
                if quiz['managed_assessment']:
                    return error_response('This assessment is managed separately from the quiz builder.', 409)
                if data['revision'] != quiz['revision']:
                    return jsonify(code='quiz_revision_conflict',
                                   error='This quiz has changed since you opened it. Reload the latest version before saving.'), 409
                type_changed = bool(quiz.get('assessment')) != bool(clean.get('assessment'))
                if type_changed:
                    if data.get('assessment_type') not in ('likert', 'multiple_choice'):
                        return error_response('Select the new assessment type explicitly.', 409)
                    if quiz['status'] != 'draft' or clean['status'] != 'draft' or quiz['attempt_count']:
                        return error_response('Only drafts without student submissions can change assessment type. Save the change as a draft.', 409)
                    if (quiz['question_count'] or quiz.get('assessment') or quiz.get('localization')) and data.get('confirm_type_change') is not True:
                        return error_response('Confirm replacing the current questions and assessment settings before changing the type.', 409)
                if quiz.get('localization') and not type_changed and 'language' not in data:
                    return error_response('Reload the quiz to retain its language settings.', 409)
                old_preference = quiz.get('assessment_code') == PREFERENCE_CODE
                new_preference = (clean.get('localization') or {}).get('assessment_code') == PREFERENCE_CODE
                if old_preference and not type_changed and 'assessment_code' not in data:
                    return error_response('Reload the quiz to retain its outcome settings.', 409)
                if old_preference != new_preference and not type_changed:
                    if quiz['status'] != 'draft' or clean['status'] != 'draft' or quiz['attempt_count']:
                        return error_response('Only drafts without student submissions can change outcome mode. Save the change as a draft.', 409)
                questions_changed = question_content(quiz) != clean['questions']
                identities = None
                if (old_preference or new_preference) and not clean.get('assessment'):
                    try:
                        identities = preference_edit_ids(quiz['questions'], data.get('questions', []))
                    except ValueError as error:
                        return error_response(str(error), 400)
                    original = [(question['question_id'], [option['option_id'] for option in question['options']])
                                for question in quiz['questions']]
                    questions_changed = questions_changed or original != identities
                definition = clean.get('assessment') or clean.get('localization')
                if clean.get('assessment'):
                    try:
                        definition = number_questions(definition, quiz.get('assessment'), quiz['next_question_number'])
                    except ValueError as error:
                        return error_response(str(error), 400)
                elif quiz['next_question_number'] > 1:
                    definition = {**(definition or dict(key='advisor-mcq-language', language='en', translations=[])),
                                  'next_question_number': quiz['next_question_number']}
                assessment_changed = (quiz.get('assessment') or quiz.get('localization')) != definition
                if quiz['attempt_count'] and (questions_changed or assessment_changed):
                    return error_response('Questions are locked after student submissions. You can edit the title, description, and publication status.', 409)
                if questions_changed and identities is not None:
                    update_preference_questions(cursor, quiz_id, quiz['questions'], clean['questions'], identities)
                elif questions_changed:
                    cursor.execute('DELETE FROM quiz_option WHERE question_id IN (SELECT question_id FROM quiz_question WHERE quiz_id=%s)', (quiz_id,))
                    cursor.execute('DELETE FROM quiz_question WHERE quiz_id=%s', (quiz_id,))
                    write_questions(cursor, quiz_id, clean['questions'])
                if assessment_changed:
                    cursor.execute('UPDATE quiz SET assessment_definition=%s WHERE quiz_id=%s AND advisor_id=%s',
                                   (Json(definition) if definition else None, quiz_id, advisor_id))
                cursor.execute('''UPDATE quiz SET title=%s,description=%s,status=%s,revision=revision+1
                    WHERE quiz_id=%s AND advisor_id=%s''', (clean['title'], clean['description'], clean['status'], quiz_id, advisor_id))
                updated = read_quiz(cursor, advisor_id, quiz_id)
        return jsonify(message='Quiz updated.', quiz=updated)
    except Exception:
        return quiz_error()
