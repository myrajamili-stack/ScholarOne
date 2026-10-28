from flask import Blueprint, jsonify

from db import get_db_connection
from responses import error_response

scholarships_bp = Blueprint("scholarships", __name__, url_prefix="/api/scholarships")


@scholarships_bp.route("", methods=["GET"])
def get_scholarships():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                s.scholarship_id,
                s.sponsor_id,
                sp.organization_name,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                s.status,
                s.created_at
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where lower(coalesce(s.status, 'pending')) in ('approved', 'active')
            order by s.created_at desc
        """)
        scholarships = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(scholarships)
    except Exception as e:
        return error_response(str(e), 500)


@scholarships_bp.route("/<int:scholarship_id>", methods=["GET"])
def get_scholarship(scholarship_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                s.*,
                sp.organization_name
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where s.scholarship_id = %s
              and lower(coalesce(s.status, 'pending')) in ('approved', 'active')
        """, (scholarship_id,))
        scholarship = cursor.fetchone()
        cursor.close()
        connection.close()

        if not scholarship:
            return error_response("Scholarship not found", 404)

        return jsonify(scholarship)
    except Exception as e:
        return error_response(str(e), 500)
