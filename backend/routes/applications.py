from flask import Blueprint, jsonify, request, g

from db import get_db_connection
from responses import error_response, internal_error_response
from security import student_access_required
from notification_delivery import notify
from scholarship_availability import PUBLISHED_SCHOLARSHIP, intake_status

applications_bp = Blueprint("applications", __name__, url_prefix="/api/applications")


@applications_bp.route("", methods=["POST"])
@student_access_required
def create_application():
    data = request.get_json(silent=True)
    if not isinstance(data, dict): return error_response('Send an application object.', 400)
    student_id = g.student_id
    if "student_id" in data and (type(data["student_id"]) is not int or data["student_id"] != student_id):
        return error_response("You can only submit your own applications.", 403)
    scholarship_id = data.get("scholarship_id")
    remarks = data.get("remarks")

    if remarks is not None and (not isinstance(remarks, str) or len(remarks)>2000):
        return error_response("Remarks must be text of at most 2000 characters.", 400)
    if type(scholarship_id) is not int or scholarship_id <= 0:
        return error_response("scholarship_id is required")

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s and role = 'student' for update
        """, (student_id,))
        if not cursor.fetchone():
            return error_response("Student account not found.", 404)

        cursor.execute(f"""
            select scholarship_id,sponsor_id,title,deadline,import_metadata
            from scholarship s
            where scholarship_id = %s
              and {PUBLISHED_SCHOLARSHIP}
            for share
        """, (scholarship_id,))
        scholarship = cursor.fetchone()
        if not scholarship or (scholarship.get("import_metadata") or {}).get("external_listing", bool(scholarship.get("import_metadata"))):
            return error_response("Scholarship is not available for application.", 404)

        cursor.execute("""
            select
                application_id,
                student_id,
                scholarship_id,
                application_date,
                application_status,
                remarks
            from application
            where student_id = %s and scholarship_id = %s
            limit 1
        """, (student_id, scholarship_id))
        existing_application = cursor.fetchone()
        if existing_application:
            return jsonify({
                "message": "You have already applied for this scholarship.",
                "application": existing_application,
            }), 409

        if intake_status(scholarship) == "closed":
            return error_response("Scholarship is not available for application.", 404)

        cursor.execute("""
            insert into application (
                student_id,
                scholarship_id,
                application_date,
                application_status,
                remarks
            )
            values (%s, %s, (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date, %s, %s)
            returning *
        """, (student_id, scholarship_id, "pending", remarks))
        application = cursor.fetchone()
        message = f"Application #{application['application_id']} for '{scholarship['title']}' was submitted and is pending review."
        notify(cursor,student_id,message,'application_submitted')
        notify(cursor,scholarship['sponsor_id'],message,'application_submitted')
        connection.commit()
        return jsonify({"message": "Application submitted", "application": application}), 201
    except Exception:
        if connection: connection.rollback()
        return error_response('Unable to submit your application. No changes were saved. Please retry.', 503)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@applications_bp.route("/student/<int:student_id>", methods=["GET"])
@student_access_required
def get_student_applications(student_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(f"""
            select
                application.application_id,
                application.student_id,
                application.scholarship_id,
                application.application_date,
                coalesce(application.application_status, 'pending') as application_status,
                coalesce(application.remarks, '') as remarks,
                s.title as scholarship_title,
                s.deadline,
                s.amount,
                s.funding_type,
                s.category,
                coalesce({PUBLISHED_SCHOLARSHIP}, false) as listing_published,
                coalesce(sponsor.organization_name, sponsor_user.full_name, 'ScholarOne Partner') as organization_name
            from application
            left join scholarship s
                on s.scholarship_id = application.scholarship_id
            left join sponsor
                on sponsor.sponsor_id = s.sponsor_id
            left join app_user as sponsor_user
                on sponsor_user.user_id = s.sponsor_id
            where application.student_id = %s
            order by application.application_date desc nulls last, application.application_id desc
        """, (student_id,))
        return jsonify(cursor.fetchall())
    except Exception as e:
        return internal_error_response(e)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
