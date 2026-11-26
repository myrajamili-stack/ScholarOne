from contextlib import closing
from datetime import date, timedelta

from flask import Blueprint, current_app, g, jsonify

from db import get_db_connection
from responses import error_response
from security import student_access_required
from scholarship_availability import (
    HAS_SCHOLARSHIP_DEADLINE, PUBLISHED_SCHOLARSHIP, REMINDER_WINDOW_DAYS,
    intake_status, malaysia_now, scholarship_deadline,
)

scholarship_reminders_bp = Blueprint("scholarship_reminders", __name__, url_prefix="/api/scholarship-reminders")


def malaysia_today(now=None):
    return (now or malaysia_now()).date()


def reminder_response(row, today=None):
    today = today or malaysia_today()
    deadline, instant = scholarship_deadline(row)
    days = (deadline - today).days
    public_row = {key: value for key, value in row.items() if key != "import_metadata"}
    if instant:
        public_row["deadline_at"] = instant.isoformat()
    return {**public_row, "deadline": deadline.isoformat(), "remind_on": (deadline - timedelta(days=REMINDER_WINDOW_DAYS)).isoformat(),
            "days_until": days, "is_due": 0 <= days <= REMINDER_WINDOW_DAYS}


def active_student(cursor):
    cursor.execute("SELECT st.student_id FROM student st JOIN app_user u ON u.user_id=st.student_id WHERE st.student_id=%s AND u.role='student' AND lower(u.status)='active'", (g.student_id,))
    return cursor.fetchone() is not None


@scholarship_reminders_bp.route("", methods=["GET"])
@student_access_required
def list_reminders():
    try:
        with closing(get_db_connection()) as connection:
            with connection.cursor() as cursor:
                if not active_student(cursor):
                    return error_response("Active student account not found.", 403)
                cursor.execute(f"""SELECT s.scholarship_id,s.title,coalesce(s.import_metadata->>'source_sponsor',sp.organization_name) AS organization_name,s.deadline::date AS deadline,s.import_metadata
                    FROM scholarship_reminder r JOIN scholarship s ON s.scholarship_id=r.scholarship_id
                    LEFT JOIN sponsor sp ON sp.sponsor_id=s.sponsor_id
                    WHERE r.student_id=%s AND {HAS_SCHOLARSHIP_DEADLINE}
                    AND {PUBLISHED_SCHOLARSHIP}""", (g.student_id,))
                now = malaysia_now()
                today = malaysia_today(now)
                reminders = [reminder_response(row, today) for row in cursor.fetchall()
                             if intake_status(row, now, today) == "dated"]
                reminders.sort(key=lambda row: (row["deadline"], row.get("deadline_at", ""), row["scholarship_id"]))
        return jsonify(reminders)
    except Exception:
        current_app.logger.error("Could not load scholarship reminders")
        return error_response("Unable to load your scholarship reminders. Please try again.", 503)


@scholarship_reminders_bp.route("/<int:scholarship_id>", methods=["PUT", "DELETE"])
@student_access_required
def update_reminder(scholarship_id):
    from flask import request

    try:
        with closing(get_db_connection()) as connection:
            with connection:
                with connection.cursor() as cursor:
                    if not active_student(cursor):
                        return error_response("Active student account not found.", 403)
                    if request.method == "DELETE":
                        cursor.execute("DELETE FROM scholarship_reminder WHERE student_id=%s AND scholarship_id=%s", (g.student_id, scholarship_id))
                        response = {"enabled": False, "scholarship_id": scholarship_id}
                    else:
                        cursor.execute(f"""SELECT s.scholarship_id,s.title,coalesce(s.import_metadata->>'source_sponsor',sp.organization_name) AS organization_name,s.deadline::date AS deadline,s.import_metadata
                            FROM scholarship s LEFT JOIN sponsor sp ON sp.sponsor_id=s.sponsor_id
                            WHERE s.scholarship_id=%s AND {HAS_SCHOLARSHIP_DEADLINE}
                            AND {PUBLISHED_SCHOLARSHIP}
                            FOR SHARE OF s""", (scholarship_id,))
                        scholarship = cursor.fetchone()
                        if not scholarship:
                            return error_response("This scholarship is unavailable or has no deadline.", 404)
                        now = malaysia_now()
                        today = malaysia_today(now)
                        if intake_status(scholarship, now, today) == "closed":
                            return error_response("This scholarship deadline has already passed.", 409)
                        reminder = reminder_response(scholarship, today)
                        cursor.execute("INSERT INTO scholarship_reminder (student_id,scholarship_id) VALUES (%s,%s) ON CONFLICT (student_id,scholarship_id) DO NOTHING", (g.student_id, scholarship_id))
                        response = {"enabled": True, "reminder": reminder}
        return jsonify(response)
    except Exception:
        current_app.logger.error("Could not update scholarship reminder")
        return error_response("Unable to update the reminder. Please try again.", 503)
