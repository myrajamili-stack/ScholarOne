from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

applications_bp = Blueprint("applications", __name__, url_prefix="/api/applications")


@applications_bp.route("", methods=["POST"])
def create_application():
    data = request.get_json() or {}
    student_id = data.get("student_id")
    scholarship_id = data.get("scholarship_id")
    remarks = data.get("remarks")

    if not student_id or not scholarship_id:
        return error_response("student_id and scholarship_id are required")

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s and role = 'student'
        """, (student_id,))
        if not cursor.fetchone():
            return error_response("Student account not found.", 404)

        cursor.execute("""
            select scholarship_id
            from scholarship
            where scholarship_id = %s
              and lower(coalesce(status, '')) in ('approved', 'active')
        """, (scholarship_id,))
        if not cursor.fetchone():
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

        cursor.execute("""
            insert into application (
                student_id,
                scholarship_id,
                application_date,
                application_status,
                remarks
            )
            values (%s, %s, current_date, %s, %s)
            returning *
        """, (student_id, scholarship_id, "pending", remarks))
        application = cursor.fetchone()
        connection.commit()
        return jsonify({"message": "Application submitted", "application": application}), 201
    except Exception as e:
        return error_response(str(e), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@applications_bp.route("/student/<int:student_id>", methods=["GET"])
def get_student_applications(student_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                application.application_id,
                application.student_id,
                application.scholarship_id,
                application.application_date,
                coalesce(application.application_status, 'pending') as application_status,
                coalesce(application.remarks, '') as remarks,
                scholarship.title as scholarship_title,
                scholarship.deadline,
                scholarship.amount,
                scholarship.funding_type,
                scholarship.category,
                coalesce(sponsor.organization_name, sponsor_user.full_name, 'ScholarOne Partner') as organization_name
            from application
            join scholarship
                on scholarship.scholarship_id = application.scholarship_id
            left join sponsor
                on sponsor.sponsor_id = scholarship.sponsor_id
            left join app_user as sponsor_user
                on sponsor_user.user_id = scholarship.sponsor_id
            where application.student_id = %s
            order by application.application_date desc nulls last, application.application_id desc
        """, (student_id,))
        return jsonify(cursor.fetchall())
    except Exception as e:
        return error_response(str(e), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
