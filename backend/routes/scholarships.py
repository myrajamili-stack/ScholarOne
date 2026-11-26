from flask import Blueprint, jsonify

from db import get_db_connection
from responses import error_response, internal_error_response
from scholarship_imports import enrich_scholarship
from scholarship_availability import PUBLISHED_SCHOLARSHIP, malaysia_now

scholarships_bp = Blueprint("scholarships", __name__, url_prefix="/api/scholarships")


@scholarships_bp.route("", methods=["GET"])
def get_scholarships():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(f"""
            select
                s.scholarship_id,
                s.sponsor_id,
                sp.organization_name,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.study_level,
                s.eligible_state,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                s.status,
                s.created_at,
                s.import_metadata
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where {PUBLISHED_SCHOLARSHIP}
            order by s.created_at desc
        """)
        scholarships = cursor.fetchall()
        cursor.close()
        connection.close()
        now = malaysia_now()
        return jsonify([enrich_scholarship(scholarship, now) for scholarship in scholarships])
    except Exception as e:
        return internal_error_response(e)


@scholarships_bp.route("/<int:scholarship_id>", methods=["GET"])
def get_scholarship(scholarship_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(f"""
            select
                s.*,
                sp.organization_name
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where s.scholarship_id = %s
              and {PUBLISHED_SCHOLARSHIP}
        """, (scholarship_id,))
        scholarship = cursor.fetchone()
        cursor.close()
        connection.close()

        if not scholarship:
            return error_response("Scholarship not found", 404)

        return jsonify(enrich_scholarship(scholarship))
    except Exception as e:
        return internal_error_response(e)
