from flask import Blueprint, jsonify

from db import get_db_connection
from responses import error_response

calendar_bp = Blueprint("calendar", __name__, url_prefix="/api/calendar")


@calendar_bp.route("/deadlines", methods=["GET"])
def get_calendar_deadlines():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                s.scholarship_id,
                s.title,
                sp.organization_name,
                to_char(s.deadline, 'YYYY-MM-DD') as deadline,
                s.status
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where s.deadline is not null
              and coalesce(s.status, 'approved') = 'approved'
            order by s.deadline asc
        """)
        deadlines = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(deadlines)
    except Exception as e:
        return error_response(str(e), 500)
