from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def count_rows(cursor, table_name, where_clause=""):
    query = f"select count(*) as total from {table_name} {where_clause}"
    cursor.execute(query)
    return cursor.fetchone()["total"]


@admin_bp.route("/users", methods=["GET"])
def get_admin_users():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                count(*) as total_users,
                count(*) filter (where role = 'student') as students,
                count(*) filter (where role = 'sponsor') as sponsors,
                count(*) filter (where role = 'advisor') as advisors,
                count(*) filter (where role = 'admin') as admins,
                count(*) filter (where lower(coalesce(status, 'active')) = 'active') as active_users,
                count(*) filter (where lower(coalesce(status, 'active')) in ('disabled', 'suspended')) as restricted_users
            from app_user
        """)
        summary = cursor.fetchone()

        cursor.execute("""
            select
                u.user_id,
                u.full_name,
                u.email,
                u.phone_number,
                u.role,
                coalesce(u.status, 'active') as status,
                u.created_at,
                st.education_level,
                st.field_of_study,
                st.university,
                sp.organization_name,
                sp.organization_type,
                sp.website,
                adv.specialization,
                adv.qualification,
                adm.department,
                adm.role_level
            from app_user u
            left join student st on st.student_id = u.user_id
            left join sponsor sp on sp.sponsor_id = u.user_id
            left join advisor adv on adv.advisor_id = u.user_id
            left join admin adm on adm.admin_id = u.user_id
            order by u.created_at desc nulls last, u.user_id desc
        """)
        users = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "summary": summary,
            "users": users,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@admin_bp.route("/users/<int:user_id>/status", methods=["PATCH"])
def update_admin_user_status(user_id):
    data = request.get_json() or {}
    status = str(data.get("status", "")).strip().lower()

    if status not in ["active", "disabled", "suspended"]:
        return error_response("Status must be active, disabled, or suspended.", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update app_user
            set status = %s
            where user_id = %s
            returning user_id, full_name, email, phone_number, role, status, created_at
        """, (status, user_id))
        updated_user = cursor.fetchone()

        if not updated_user:
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("User account not found.", 404)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "User status updated successfully.",
            "user": updated_user,
        })
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@admin_bp.route("/scholarships", methods=["GET"])
def get_admin_scholarships():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_scholarships,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, 'pending')) IN ('approved', 'active')
                ) AS approved,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, 'pending')) = 'pending'
                ) AS pending,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, 'pending')) = 'rejected'
                ) AS rejected,
                COUNT(*) FILTER (
                    WHERE LOWER(COALESCE(status, 'pending')) = 'appeal_submitted'
                ) AS appeals
            FROM scholarship
            """
        )
        summary_row = cursor.fetchone()

        cursor.execute(
            """
            SELECT
                s.scholarship_id,
                s.sponsor_id,
                COALESCE(sp.organization_name, u.full_name, 'Unknown provider') AS organization_name,
                u.email AS sponsor_email,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                COALESCE(s.status, 'pending') AS status,
                s.created_at,
                COUNT(a.application_id) AS application_count
            FROM scholarship s
            LEFT JOIN sponsor sp ON sp.sponsor_id = s.sponsor_id
            LEFT JOIN app_user u ON u.user_id = s.sponsor_id
            LEFT JOIN application a ON a.scholarship_id = s.scholarship_id
            GROUP BY
                s.scholarship_id,
                s.sponsor_id,
                sp.organization_name,
                u.full_name,
                u.email,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                s.status,
                s.created_at
            ORDER BY
                CASE LOWER(COALESCE(s.status, 'pending'))
                    WHEN 'pending' THEN 0
                    WHEN 'appeal_submitted' THEN 1
                    WHEN 'rejected' THEN 2
                    WHEN 'approved' THEN 3
                    WHEN 'active' THEN 4
                    ELSE 5
                END,
                s.created_at DESC NULLS LAST,
                s.scholarship_id DESC
            """
        )
        scholarships = cursor.fetchall()

        summary = {
            "total_scholarships": summary_row["total_scholarships"] if summary_row else 0,
            "approved": summary_row["approved"] if summary_row else 0,
            "pending": summary_row["pending"] if summary_row else 0,
            "rejected": summary_row["rejected"] if summary_row else 0,
            "appeals": summary_row["appeals"] if summary_row else 0,
        }

        return jsonify({"summary": summary, "scholarships": scholarships})
    except Exception as exc:
        return error_response(str(exc), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/scholarships/<int:scholarship_id>/status", methods=["PATCH"])
def update_admin_scholarship_status(scholarship_id):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip().lower()
    allowed_statuses = {"pending", "approved", "rejected"}

    if status not in allowed_statuses:
        return error_response("Status must be pending, approved, or rejected.", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            UPDATE scholarship
            SET status = %s
            WHERE scholarship_id = %s
            RETURNING scholarship_id, title, status
            """,
            (status, scholarship_id),
        )
        scholarship = cursor.fetchone()

        if not scholarship:
            connection.rollback()
            return error_response("Scholarship listing not found.", 404)

        connection.commit()
        return jsonify(
            {
                "message": f"Scholarship marked as {status}.",
                "scholarship": scholarship,
            }
        )
    except Exception as exc:
        if connection:
            connection.rollback()
        return error_response(str(exc), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/applications", methods=["GET"])
def get_admin_applications():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                count(*) as total_applications,
                count(*) filter (
                    where lower(coalesce(application_status, 'pending')) = 'pending'
                ) as pending,
                count(*) filter (
                    where lower(coalesce(application_status, 'pending')) = 'approved'
                ) as approved,
                count(*) filter (
                    where lower(coalesce(application_status, 'pending')) = 'rejected'
                ) as rejected,
                count(*) filter (
                    where application_date >= current_date - interval '7 days'
                ) as new_this_week
            from application
        """)
        summary_row = cursor.fetchone()

        cursor.execute("""
            select
                s.scholarship_id,
                s.title,
                coalesce(sp.organization_name, sponsor_user.full_name, 'Unknown provider') as organization_name,
                count(a.application_id) as total_applications,
                count(a.application_id) filter (
                    where lower(coalesce(a.application_status, 'pending')) = 'pending'
                ) as pending,
                count(a.application_id) filter (
                    where lower(coalesce(a.application_status, 'pending')) = 'approved'
                ) as approved,
                count(a.application_id) filter (
                    where lower(coalesce(a.application_status, 'pending')) = 'rejected'
                ) as rejected
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            left join app_user sponsor_user on sponsor_user.user_id = s.sponsor_id
            group by
                s.scholarship_id,
                s.title,
                sp.organization_name,
                sponsor_user.full_name,
                s.created_at
            order by total_applications desc, s.created_at desc nulls last
            limit 6
        """)
        scholarship_breakdown = cursor.fetchall()

        cursor.execute("""
            select
                a.application_id,
                a.student_id,
                a.scholarship_id,
                a.application_date,
                coalesce(a.application_status, 'pending') as application_status,
                coalesce(a.remarks, '') as remarks,
                s.title as scholarship_title,
                s.funding_type,
                coalesce(sp.organization_name, sponsor_user.full_name, 'Unknown provider') as organization_name,
                sponsor_user.email as sponsor_email,
                student_user.full_name as student_name,
                student_user.email as student_email,
                coalesce(st.education_level, '') as education_level,
                st.cgpa,
                coalesce(st.field_of_study, '') as field_of_study,
                coalesce(st.university, '') as university
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            left join sponsor sp on sp.sponsor_id = s.sponsor_id
            left join app_user sponsor_user on sponsor_user.user_id = s.sponsor_id
            join app_user student_user on student_user.user_id = a.student_id
            left join student st on st.student_id = a.student_id
            order by a.application_date desc nulls last, a.application_id desc
        """)
        applications = cursor.fetchall()

        most_applied = None
        for scholarship in scholarship_breakdown:
            if scholarship["total_applications"] > 0:
                most_applied = {
                    "title": scholarship["title"],
                    "total_applications": scholarship["total_applications"],
                }
                break

        summary = {
            "total_applications": summary_row["total_applications"] if summary_row else 0,
            "pending": summary_row["pending"] if summary_row else 0,
            "approved": summary_row["approved"] if summary_row else 0,
            "rejected": summary_row["rejected"] if summary_row else 0,
            "new_this_week": summary_row["new_this_week"] if summary_row else 0,
            "most_applied": most_applied,
        }

        return jsonify({
            "summary": summary,
            "applications": applications,
            "scholarship_breakdown": scholarship_breakdown,
        })
    except Exception as exc:
        return error_response(str(exc), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/applications/<int:application_id>/status", methods=["PATCH"])
def update_admin_application_status(application_id):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip().lower()
    remarks = data.get("remarks")
    allowed_statuses = {"pending", "approved", "rejected"}

    if status not in allowed_statuses:
        return error_response("Status must be pending, approved, or rejected.", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            update application
            set
                application_status = %s,
                remarks = coalesce(%s, remarks)
            where application_id = %s
            returning application_id, student_id, scholarship_id, application_status, remarks
            """,
            (status, remarks, application_id),
        )
        application = cursor.fetchone()

        if not application:
            connection.rollback()
            return error_response("Student application not found.", 404)

        connection.commit()
        return jsonify({
            "message": f"Application marked as {status}.",
            "application": application,
        })
    except Exception as exc:
        if connection:
            connection.rollback()
        return error_response(str(exc), 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/dashboard", methods=["GET"])
def get_admin_dashboard():
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                count(*) as total_users,
                count(*) filter (where role = 'student') as students,
                count(*) filter (where role = 'sponsor') as sponsors,
                count(*) filter (where role = 'advisor') as advisors,
                count(*) filter (where role = 'admin') as admins,
                count(*) filter (where lower(coalesce(status, 'active')) = 'active') as active_users
            from app_user
        """)
        users = cursor.fetchone()

        cursor.execute("""
            select
                count(*) as total_scholarships,
                count(*) filter (where lower(coalesce(status, 'pending')) in ('active', 'approved')) as approved,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'rejected') as rejected
            from scholarship
        """)
        scholarships = cursor.fetchone()

        cursor.execute("""
            select
                count(*) as total_applications,
                count(*) filter (where lower(coalesce(application_status, 'pending')) = 'approved') as approved,
                count(*) filter (where lower(coalesce(application_status, 'pending')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(application_status, 'pending')) = 'rejected') as rejected
            from application
        """)
        applications = cursor.fetchone()

        cursor.execute("""
            select
                count(*) as total_subscriptions,
                count(*) filter (where lower(coalesce(subscription_status, 'active')) = 'active') as active,
                count(*) filter (where lower(coalesce(subscription_status, 'active')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(subscription_status, 'active')) in ('inactive', 'expired', 'cancelled')) as inactive
            from subscription
        """)
        subscription_summary = cursor.fetchone()
        subscription_total = subscription_summary["total_subscriptions"] if subscription_summary else 0
        pathway_total = count_rows(cursor, "academic_pathway")
        quiz_total = count_rows(cursor, "quiz")
        report_total = count_rows(cursor, "report")

        cursor.execute("""
            select user_id, full_name, email, role, status, created_at
            from app_user
            order by created_at desc nulls last, user_id desc
            limit 5
        """)
        recent_users = cursor.fetchall()

        cursor.execute("""
            select scholarship_id, title, status, created_at
            from scholarship
            order by created_at desc nulls last, scholarship_id desc
            limit 5
        """)
        recent_scholarships = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "summary": {
                "users": users,
                "scholarships": scholarships,
                "applications": applications,
                "subscriptions": subscription_total,
                "subscription_summary": subscription_summary,
                "academic_pathways": pathway_total,
                "quizzes": quiz_total,
                "reports": report_total,
            },
            "recent_users": recent_users,
            "recent_scholarships": recent_scholarships,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)
