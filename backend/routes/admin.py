import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response
from security import admin_access_required
from stripe_billing import billing_ready

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def count_rows(cursor, table_name, where_clause=""):
    query = f"select count(*) as total from {table_name} {where_clause}"
    cursor.execute(query)
    return cursor.fetchone()["total"]


@admin_bp.route("/users", methods=["GET"])
@admin_access_required
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
@admin_access_required
def update_admin_user_status(user_id):
    data = request.get_json() or {}
    status = str(data.get("status", "")).strip().lower()

    if status not in ["active", "disabled", "suspended", "pending"]:
        return error_response("Status must be active, pending, disabled, or suspended.", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("select status, role from app_user where user_id = %s for update", (user_id,))
        previous_user = cursor.fetchone()
        if not previous_user:
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("User account not found.", 404)
        if status == "pending" and previous_user["role"] != "sponsor":
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("Pending verification applies to providers.", 400)

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

        if previous_user["role"] == "sponsor" and previous_user["status"] == "pending" and status != "pending":
            message = "Your provider account has been approved. You can now access your workspace and submit scholarships for review." if status == "active" else "Your provider registration was not approved. Please contact ScholarOne support for assistance."
            cursor.execute("""insert into notification (user_id, message, notification_type, is_read)
                values (%s, %s, 'provider_verification', false)""", (user_id, message))

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
                count(*) filter (where lower(coalesce(status, 'pending')) = 'rejected') as rejected,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'appeal_submitted') as appeals
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
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "recent_users": recent_users,
            "recent_scholarships": recent_scholarships,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@admin_bp.route('/pathways', methods=['GET'])
@admin_access_required
def get_admin_pathways():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute('SELECT to_jsonb(p) AS record FROM academic_pathway p')
        pathways = [row['record'] for row in cursor.fetchall()]
        cursor.execute("""
            SELECT q.quiz_id, q.title, q.description, coalesce(q.status, 'draft') AS status, q.created_at,
                u.full_name AS advisor_name,
                (SELECT count(*) FROM quiz_question WHERE quiz_id=q.quiz_id) AS question_count,
                (SELECT count(*) FROM quiz_attempt WHERE quiz_id=q.quiz_id) AS attempt_count,
                coalesce((SELECT json_agg(DISTINCT o.pathway_result)
                    FROM quiz_option o JOIN quiz_question question ON question.question_id=o.question_id
                    WHERE question.quiz_id=q.quiz_id AND nullif(trim(o.pathway_result),'') IS NOT NULL), '[]') AS pathway_results
            FROM quiz q LEFT JOIN app_user u ON u.user_id=q.advisor_id
            ORDER BY q.created_at DESC NULLS LAST, q.quiz_id DESC
        """)
        quizzes = cursor.fetchall()
        for quiz in quizzes:
            created_at = quiz['created_at']
            if created_at:
                quiz['created_at'] = created_at.isoformat()
                if created_at.tzinfo is None:
                    quiz['created_at'] += '+08:00'
        return jsonify({'pathways': pathways, 'quizzes': quizzes})
    except Exception:
        return error_response('Unable to load academic pathways and quizzes.', 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route('/subscriptions', methods=['GET'])
@admin_access_required
def get_admin_subscriptions():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            SELECT sub.subscription_id, sub.sponsor_id, sub.start_date, sub.end_date,
                coalesce(sub.subscription_status, 'inactive') AS subscription_status,
                coalesce(s.organization_name, u.full_name, 'Unknown provider') AS provider_name,
                u.email AS provider_email, sp.plan_name, sp.price, sp.scholarship_limit,
                CASE WHEN sub.stripe_subscription_id IS NOT NULL THEN (NOT sub.cancel_at_period_end)::text ELSE to_jsonb(sub)->>'auto_renew' END AS auto_renew,
                (SELECT count(*) FROM scholarship listing WHERE listing.sponsor_id=sub.sponsor_id) AS listing_count
            FROM subscription sub
            LEFT JOIN sponsor s ON s.sponsor_id=sub.sponsor_id
            LEFT JOIN app_user u ON u.user_id=sub.sponsor_id
            LEFT JOIN subscription_plan sp ON sp.plan_id=sub.plan_id
            ORDER BY sub.start_date DESC NULLS LAST, sub.subscription_id DESC
        """)
        subscriptions = cursor.fetchall()
        for subscription in subscriptions:
            for key in ('start_date', 'end_date'):
                if subscription[key]:
                    subscription[key] = subscription[key].isoformat()
        cursor.execute("""
            SELECT plan_id, plan_name, price, scholarship_limit, duration_month,
                coalesce(to_jsonb(subscription_plan)->'benefits', 'null'::jsonb) AS benefits
            FROM subscription_plan ORDER BY price, plan_id
        """)
        plans = cursor.fetchall()
        cursor.execute("""
            SELECT u.user_id AS sponsor_id, coalesce(s.organization_name, u.full_name) AS provider_name,
                u.email AS provider_email, current_sub.subscription_id, current_sub.plan_id,
                current_sub.start_date, current_sub.end_date,
                coalesce(current_sub.subscription_status, 'free') AS subscription_status,
                coalesce(current_sub.plan_name, free_plan.plan_name, 'Free') AS plan_name,
                coalesce(current_sub.price, free_plan.price, 0) AS price,
                coalesce(current_sub.scholarship_limit, free_plan.scholarship_limit, 3) AS scholarship_limit,
                (SELECT count(*) FROM scholarship listing WHERE listing.sponsor_id=u.user_id) AS listing_count
            FROM app_user u
            LEFT JOIN sponsor s ON s.sponsor_id=u.user_id
            LEFT JOIN LATERAL (
                SELECT sub.subscription_id, sub.plan_id, sub.start_date, sub.end_date,
                    sub.subscription_status, sp.plan_name, sp.price, sp.scholarship_limit
                FROM subscription sub JOIN subscription_plan sp ON sp.plan_id=sub.plan_id
                WHERE sub.sponsor_id=u.user_id AND lower(sub.subscription_status)='active'
                    AND (sub.start_date IS NULL OR sub.start_date <= current_date)
                    AND (sub.end_date IS NULL OR sub.end_date >= current_date)
                    AND (sub.stripe_subscription_id IS NULL OR sub.end_date > (now() AT TIME ZONE 'UTC'))
                ORDER BY sub.start_date DESC NULLS LAST, sub.subscription_id DESC LIMIT 1
            ) current_sub ON true
            LEFT JOIN LATERAL (
                SELECT plan_name, price, scholarship_limit FROM subscription_plan
                WHERE lower(plan_name)='free' ORDER BY plan_id LIMIT 1
            ) free_plan ON true
            WHERE u.role='sponsor' ORDER BY provider_name, u.user_id
        """)
        providers = cursor.fetchall()
        for provider in providers:
            for key in ('start_date', 'end_date'):
                if provider[key]:
                    provider[key] = provider[key].isoformat()
        cursor.execute('''SELECT payment_id, invoice_number, plan_name, amount, currency,
            payment_status, invoice_url, invoice_pdf, created_at, paid_at
            FROM subscription_payment ORDER BY created_at DESC LIMIT 500''')
        payments = cursor.fetchall()
        cursor.execute("""SELECT coalesce(sum(amount), 0) AS revenue FROM subscription_payment
            WHERE payment_status='paid' AND currency='myr'
            AND paid_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Kuala_Lumpur') AT TIME ZONE 'Asia/Kuala_Lumpur'""")
        revenue = cursor.fetchone()['revenue']
        return jsonify({
            'subscriptions': subscriptions, 'providers': providers, 'plans': plans,
            'payments_enabled': billing_ready(), 'monthly_revenue': revenue, 'payments': payments,
        })
    except Exception:
        return error_response('Unable to load subscription records.', 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route('/subscription-plans/<int:plan_id>', methods=['PATCH'])
@admin_access_required
def update_admin_subscription_plan(plan_id):
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response('Send valid plan details.', 400)
    try:
        if isinstance(data.get('price'), bool):
            raise ValueError()
        price = Decimal(str(data.get('price')))
        if not price.is_finite() or price < 0 or price > Decimal('99999999.99') or price.as_tuple().exponent < -2:
            raise ValueError()
        limit = data.get('scholarship_limit')
        duration = data.get('duration_month')
        if type(limit) is not int or not 1 <= limit <= 1000000:
            return error_response('Listing allowance must be a whole number from 1 to 1,000,000.', 400)
        if type(duration) is not int or not 1 <= duration <= 120:
            return error_response('Plan duration must be a whole number from 1 to 120 months.', 400)
        if price > 0 and duration != 1:
            return error_response('Paid Stripe subscription plans must renew every month. Set duration to 1 month.', 400)
        benefits = data.get('benefits')
        if not isinstance(benefits, list) or len(benefits) > 20:
            return error_response('Use up to 20 plan benefits.', 400)
        if any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 200 for item in benefits):
            return error_response('Each benefit must contain 1–200 characters.', 400)
        benefits = list(dict.fromkeys(item.strip() for item in benefits))
    except (InvalidOperation, ValueError, TypeError):
        return error_response('Enter a valid price with at most two decimal places.', 400)

    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        # Serialize schema initialization before locking an individual plan.
        cursor.execute('ALTER TABLE subscription_plan ADD COLUMN IF NOT EXISTS benefits jsonb')
        cursor.execute('SELECT plan_id FROM subscription_plan WHERE plan_id=%s FOR UPDATE', (plan_id,))
        if not cursor.fetchone():
            connection.rollback()
            return error_response('Subscription plan not found.', 404)
        cursor.execute("""
            UPDATE subscription_plan SET price=%s, scholarship_limit=%s, duration_month=%s, benefits=%s::jsonb
            WHERE plan_id=%s
            RETURNING plan_id, plan_name, price, scholarship_limit, duration_month, benefits
        """, (price, limit, duration, json.dumps(benefits), plan_id))
        plan = cursor.fetchone()
        connection.commit()
        return jsonify({'plan': plan, 'message': 'Plan configuration saved.'})
    except Exception:
        if connection:
            connection.rollback()
        return error_response('Unable to save subscription plan configuration.', 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/reports", methods=["GET"])
@admin_access_required
def get_admin_reports():
    """Read-only analytics; application decisions remain with providers."""
    start = request.args.get("start") or None
    end = request.args.get("end") or None
    try:
        start = date.fromisoformat(start) if start else None
        end = date.fromisoformat(end) if end else None
        if start and end and start > end:
            raise ValueError()
    except ValueError:
        return error_response("Choose valid dates with the start on or before the end.", 400)

    connection = cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        # Malaysia calendar dates, with inclusive end dates, across all charts.
        def period(column):
            return f"(%s::date is null or ({column} at time zone 'Asia/Kuala_Lumpur')::date >= %s::date) and (%s::date is null or ({column} at time zone 'Asia/Kuala_Lumpur')::date <= %s::date)"
        params = (start, start, end, end)
        cursor.execute("select coalesce(role, 'unknown') as label, count(*) as count from app_user where " + period("created_at") + " group by role", params)
        roles = cursor.fetchall()
        cursor.execute("select coalesce(nullif(category, ''), 'Other') as label, count(*) as count from scholarship where " + period("created_at") + " group by coalesce(nullif(category, ''), 'Other') order by count desc, label", params)
        categories = cursor.fetchall()
        cursor.execute("select lower(coalesce(application_status, 'pending')) as label, count(*) as count from application where " + period("application_date") + " group by lower(coalesce(application_status, 'pending'))", params)
        statuses = cursor.fetchall()
        cursor.execute("select to_char(application_date at time zone 'Asia/Kuala_Lumpur', 'YYYY-MM') as month, count(*) as count from application where application_date is not null and " + period("application_date") + " group by month order by month", params)
        trend = cursor.fetchall()
        cursor.execute("""select s.scholarship_id, s.title, coalesce(sp.organization_name, 'Unknown provider') as provider,
            count(*) as count from application a join scholarship s on s.scholarship_id = a.scholarship_id
            left join sponsor sp on sp.sponsor_id = s.sponsor_id where """ + period("a.application_date") + " group by s.scholarship_id, s.title, sp.organization_name order by count desc, s.title limit 10", params)
        scholarships = cursor.fetchall()
        cursor.execute("""select count(*) as active_subscriptions from subscription
            where lower(subscription_status) = 'active'
            and (start_date is null or start_date <= current_date)
            and (end_date is null or end_date >= current_date)""")
        active = cursor.fetchone()["active_subscriptions"]
        return jsonify({"roles": roles, "categories": categories, "statuses": statuses,
                        "trend": trend, "scholarships": scholarships, "active_subscriptions": active,
                        "generated_at": datetime.now(timezone.utc).isoformat(),
                        "start": start.isoformat() if start else None, "end": end.isoformat() if end else None})
    except Exception:
        return error_response("Unable to load report analytics. Please try again.", 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@admin_bp.route("/audit-logs", methods=["GET"])
@admin_access_required
def get_admin_audit_logs():
    connection = None
    cursor = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select al.log_id, al.user_id, al.action, al.description, al.action_time,
                   u.full_name as user_name, u.role,
                   to_jsonb(al)->>'module' as module
            from audit_log al
            left join app_user u on u.user_id = al.user_id
            order by al.action_time desc nulls last, al.log_id desc
        """)
        return jsonify({"logs": cursor.fetchall()})
    except Exception:
        return error_response("Unable to load audit logs. Please try again.", 500)
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
