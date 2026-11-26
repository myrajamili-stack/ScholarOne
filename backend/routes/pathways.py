import json
from flask import Blueprint, jsonify, request, g
from psycopg2.errors import UniqueViolation, ForeignKeyViolation, UndefinedColumn
from db import get_db_connection
from responses import error_response
from security import student_access_required, admin_access_required
from academic_pathways import validate_pathway, recommend_pathways
from account_deletion import has_linked_records

pathways_bp = Blueprint('pathways', __name__, url_prefix='/api')


def published(cursor):
    cursor.execute('select to_jsonb(p) as record from academic_pathway p order by title, pathway_id')
    return [row['record'] for row in cursor.fetchall() if row['record'].get('status') == 'active']


@pathways_bp.route('/pathways', methods=['GET'])
@student_access_required
def catalogue():
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            rows = published(cursor)
        q = request.args.get('q', '').strip().lower()
        field = request.args.get('field', '').strip().lower()
        level = request.args.get('level', '').strip().lower()
        if any(len(value) > 150 for value in (q, field, level)):
            return error_response('Search terms must be at most 150 characters.', 400)
        rows = [row for row in rows if (not q or q in f"{row['title']} {row['description']} {row['field']}".lower())
                and (not field or row['field'].lower() == field) and (not level or row['level'].lower() == level)]
        return jsonify(pathways=rows)
    except Exception:
        return error_response('Unable to load the pathway catalogue.', 503)
    finally:
        if connection: connection.close()


@pathways_bp.route('/pathways/recommendations', methods=['GET'])
@student_access_required
def recommendations():
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            rows = published(cursor)
            cursor.execute("""select education_level, field_of_study, cgpa,
                coalesce(to_jsonb(student)->'academic_qualifications', '{}'::jsonb) as academic_qualifications
                from student where student_id=%s""", (g.student_id,))
            profile = cursor.fetchone()
            if not profile: return error_response('Student profile not found.', 404)
            cursor.execute("""select qa.assessment_result from quiz_attempt qa join quiz q on q.quiz_id=qa.quiz_id
                where qa.student_id=%s and q.assessment_definition->>'key'='career-assessment'
                and qa.assessment_result is not null order by qa.attempt_date desc, qa.attempt_id desc limit 1""", (g.student_id,))
            latest = cursor.fetchone()
            cursor.execute("""select qa.quiz_id,qa.assessment_result from quiz_attempt qa join quiz q on q.quiz_id=qa.quiz_id
                join app_user u on u.user_id=q.advisor_id where qa.student_id=%s and q.status='published' and u.status='active'
                and qa.assessment_result->>'kind'='advisor_quiz' order by qa.attempt_date desc,qa.attempt_id desc limit 100""", (g.student_id,))
            advisor_rows = cursor.fetchall()
            outcomes, interests, seen = [], [], set()
            for row in advisor_rows:
                result = row.get('assessment_result') or {}
                if row.get('quiz_id') in seen or result.get('kind') != 'advisor_quiz': continue
                seen.add(row['quiz_id'])
                if result.get('assessment_type') == 'likert':
                    interests.extend(result.get('pathway_terms') or [])
                else:
                    outcomes.extend(result.get('leading_outcomes') or [])
        return jsonify(pathways=recommend_pathways(rows, profile, latest['assessment_result'] if latest else None, outcomes, interests),
                       has_advisor_results=bool(outcomes or interests),
                       has_assessment=bool(latest), has_education_level=bool(profile.get('education_level')),
                       note='Suggestions use academic history, study field and saved assessment interests when available. Confirm entry requirements and costs with the institution.')
    except Exception:
        return error_response('Unable to load pathway recommendations.', 503)
    finally:
        if connection: connection.close()


@pathways_bp.route('/pathways/<int:pathway_id>', methods=['GET'])
@student_access_required
def pathway_detail(pathway_id):
    connection = None
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute('select to_jsonb(p) as record from academic_pathway p where pathway_id=%s', (pathway_id,))
            row = cursor.fetchone()
        if not row or row['record'].get('status') != 'active':
            return error_response('This pathway is no longer available.', 404)
        return jsonify(pathway=row['record'])
    except Exception:
        return error_response('Unable to load this pathway.', 503)
    finally:
        if connection: connection.close()


@pathways_bp.route('/admin/pathways', methods=['POST'])
@pathways_bp.route('/admin/pathways/<int:pathway_id>', methods=['GET', 'PUT', 'DELETE'])
@admin_access_required
def manage_pathway(pathway_id=None):
    connection = None
    cursor = None
    committed = False
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        if pathway_id is not None:
            cursor.execute('select to_jsonb(p) as record from academic_pathway p where pathway_id=%s for update', (pathway_id,))
            row = cursor.fetchone()
            if not row: return error_response('Pathway not found.', 404)
            if request.method == 'GET': return jsonify(pathway=row['record'])
        if request.method == 'DELETE':
            data = request.get_json(silent=True)
            if not isinstance(data, dict) or type(data.get('confirm_pathway_id')) is not int or data['confirm_pathway_id'] != pathway_id:
                return error_response('Confirm the pathway before deleting it.', 400)
            if has_linked_records(cursor, 'academic_pathway', pathway_id):
                return error_response('This pathway has linked records. Change it to Draft instead.', 409)
            cursor.execute('delete from academic_pathway where pathway_id=%s', (pathway_id,))
            result = None
        else:
            try: clean = validate_pathway(request.get_json(silent=True))
            except ValueError as error: return error_response(str(error), 400)
            if pathway_id is not None and 'career_goal' not in clean['guidance']:
                saved_goal = (row['record'].get('guidance') or {}).get('career_goal')
                if saved_goal:
                    clean['guidance']['career_goal'] = saved_goal
            cursor.execute('select pathway_id from academic_pathway where lower(trim(title))=lower(%s) and (%s is null or pathway_id<>%s)', (clean['title'], pathway_id, pathway_id))
            if cursor.fetchone(): return error_response('A pathway with this title already exists.', 409)
            values = (clean['title'], clean['description'], clean['field'], clean['level'], clean['status'], json.dumps(clean['guidance']))
            if pathway_id is None:
                cursor.execute('insert into academic_pathway (title,description,field,level,status,guidance) values (%s,%s,%s,%s,%s,%s::jsonb) returning *', values)
            else:
                cursor.execute('update academic_pathway set title=%s,description=%s,field=%s,level=%s,status=%s,guidance=%s::jsonb,updated_at=current_timestamp where pathway_id=%s returning *', (*values, pathway_id))
            result = cursor.fetchone()
        cursor.execute('insert into audit_log (user_id,action,description) values (%s,%s,%s)',
                       (g.admin_id, 'manage_pathway', f'{request.method} pathway {pathway_id if pathway_id is not None else result["pathway_id"]}'))
        connection.commit(); committed = True
        return jsonify(message='Pathway deleted.' if request.method == 'DELETE' else 'Pathway saved.', pathway=result), 201 if pathway_id is None else 200
    except UniqueViolation:
        return error_response('A pathway with this title already exists.', 409)
    except ForeignKeyViolation:
        return error_response('This pathway has linked records. Change it to Draft instead.', 409)
    except UndefinedColumn:
        return error_response('Pathway storage needs setup. Run backend/scripts/enable_academic_pathways.py.', 503)
    except Exception:
        return error_response('Unable to save pathway changes. No changes were saved.', 503)
    finally:
        if connection and not committed: connection.rollback()
        if cursor: cursor.close()
        if connection: connection.close()
