from contextlib import closing

from flask import Blueprint, jsonify, request, g
from db import get_db_connection
from responses import error_response
from security import student_access_required
from scholarship_filters import ELIGIBLE_STATES
from eligibility_matching import check_eligibility, number
from scholarship_recommendations import recommend_scholarships
from scholarship_availability import PUBLISHED_SCHOLARSHIP

eligibility_bp = Blueprint('eligibility', __name__, url_prefix='/api/scholarships')


def eligibility_context_error(data):
    if not isinstance(data, dict) or set(data) - {'residency_state', 'household_income', 'income_period'}:
        return error_response('Send only state, household income and income period. Academic information comes from your signed-in profile.', 400)
    if data.get('residency_state') not in (None, '') and (not isinstance(data['residency_state'], str) or data['residency_state'] not in ELIGIBLE_STATES - {'All States'}):
        return error_response('Select a valid state.', 400)
    if data.get('household_income') not in (None, '') and number(data['household_income']) is None:
        return error_response('Enter a valid household income of 0 or more.', 400)
    if data.get('income_period') not in (None, '', 'monthly', 'annual'):
        return error_response('Select monthly or annual income.', 400)


def read_student_profile(cursor):
    cursor.execute("""select education_level, cgpa, field_of_study,
        coalesce(to_jsonb(student)->'academic_qualifications', '{}'::jsonb) as academic_qualifications
        from student where student_id=%s""", (g.student_id,))
    return cursor.fetchone()


@eligibility_bp.route('/recommendations', methods=['POST'])
@student_access_required
def recommendations():
    data = request.get_json(silent=True)
    validation_error = eligibility_context_error(data)
    if validation_error:
        return validation_error
    try:
        with closing(get_db_connection()) as connection, closing(connection.cursor()) as cursor:
            profile = read_student_profile(cursor) or {}
            cursor.execute(f"""select s.scholarship_id, s.title, sp.organization_name, s.deadline,
                                     s.study_level, s.category, s.eligible_state, s.eligibility_criteria, s.import_metadata
                              from scholarship s left join sponsor sp on sp.sponsor_id=s.sponsor_id
                              where {PUBLISHED_SCHOLARSHIP}""")
            catalogue = cursor.fetchall()
        return jsonify(recommendations=recommend_scholarships(profile, catalogue, data)), 200, {"Cache-Control": "no-store"}
    except Exception:
        return error_response('Unable to load your scholarship recommendations. Please try again.', 503)


@eligibility_bp.route('/<int:scholarship_id>/eligibility', methods=['POST'])
@student_access_required
def eligibility_check(scholarship_id):
    data = request.get_json(silent=True)
    validation_error = eligibility_context_error(data)
    if validation_error:
        return validation_error
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        profile = read_student_profile(cursor)
        if not profile:
            return error_response('Student profile not found.', 404)
        cursor.execute(f"select * from scholarship s where s.scholarship_id=%s and {PUBLISHED_SCHOLARSHIP}", (scholarship_id,))
        scholarship = cursor.fetchone()
        if not scholarship:
            return error_response('Scholarship is no longer available.', 404)
        return jsonify(check_eligibility(profile, scholarship, data))
    except Exception:
        return error_response('Unable to check eligibility right now. Please try again.', 503)
    finally:
        if cursor: cursor.close()
        if connection: connection.close()
