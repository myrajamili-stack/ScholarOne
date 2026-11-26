from contextlib import closing
from flask import Blueprint, jsonify

from db import get_db_connection
from responses import internal_error_response
from scholarship_availability import HAS_SCHOLARSHIP_DEADLINE, PUBLISHED_SCHOLARSHIP, intake_status, malaysia_now, scholarship_deadline

calendar_bp = Blueprint("calendar", __name__, url_prefix="/api/calendar")


@calendar_bp.route("/deadlines", methods=["GET"])
def get_calendar_deadlines():
    try:
        with closing(get_db_connection()) as connection, closing(connection.cursor()) as cursor:
            cursor.execute(f"""
            select
                s.scholarship_id,
                s.title,
                coalesce(s.import_metadata->>'source_sponsor', sp.organization_name) as organization_name,
                s.deadline::date as deadline,
                s.status,
                s.import_metadata
            from scholarship s
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            where {HAS_SCHOLARSHIP_DEADLINE} and {PUBLISHED_SCHOLARSHIP}
        """)
            now = malaysia_now()
            deadlines = []
            for row in cursor.fetchall():
                if intake_status(row, now) != "dated":
                    continue
                deadline, instant = scholarship_deadline(row)
                item = {key: value for key, value in row.items() if key != "import_metadata"}
                item["deadline"] = deadline.isoformat()
                if instant:
                    item["deadline_at"] = instant.isoformat()
                deadlines.append(item)
            deadlines.sort(key=lambda item: (item["deadline"], item.get("deadline_at", ""), item["scholarship_id"]))
        return jsonify(deadlines)
    except Exception as e:
        return internal_error_response(e)
