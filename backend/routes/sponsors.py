from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

sponsors_bp = Blueprint("sponsors", __name__, url_prefix="/api/sponsors")


def ensure_default_subscription_plans(cursor):
    default_plans = [
        ("Free", 0, 3, 1),
        ("Growth", 49, 10, 1),
        ("Professional", 99, 25, 1),
        ("Premium", 199, 999, 1),
    ]

    for plan_name, price, scholarship_limit, duration_month in default_plans:
        cursor.execute("""
            insert into subscription_plan (
                plan_name,
                price,
                scholarship_limit,
                duration_month
            )
            select %s, %s, %s, %s
            where not exists (
                select 1
                from subscription_plan
                where lower(plan_name) = lower(%s)
            )
        """, (plan_name, price, scholarship_limit, duration_month, plan_name))


@sponsors_bp.route("/<int:sponsor_id>/dashboard", methods=["GET"])
def get_sponsor_dashboard(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                u.full_name,
                u.email,
                u.phone_number,
                coalesce(s.organization_name, u.full_name) as organization_name,
                coalesce(s.organization_type, '') as organization_type,
                coalesce(s.website, '') as website,
                coalesce(s.subscription_status, 'free') as subscription_status
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                count(*) as total_scholarships,
                count(*) filter (where lower(coalesce(status, 'pending')) in ('active', 'approved')) as active_scholarships,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'pending') as pending_scholarships,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'rejected') as rejected_scholarships
            from scholarship
            where sponsor_id = %s
        """, (sponsor_id,))
        scholarship_summary = cursor.fetchone()

        cursor.execute("""
            select count(a.application_id) as total_applications
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            where s.sponsor_id = %s
        """, (sponsor_id,))
        total_applications = cursor.fetchone()["total_applications"]

        cursor.execute("""
            select
                s.scholarship_id,
                s.title,
                s.status,
                s.deadline,
                s.funding_type,
                s.created_at,
                count(a.application_id) as application_count
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            where s.sponsor_id = %s
            group by
                s.scholarship_id,
                s.title,
                s.status,
                s.deadline,
                s.funding_type,
                s.created_at
            order by s.created_at desc nulls last
            limit 6
        """, (sponsor_id,))
        scholarships = cursor.fetchall()

        cursor.execute("""
            select
                application_date,
                count(*) as total
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            where s.sponsor_id = %s
              and application_date is not null
            group by application_date
            order by application_date asc
            limit 18
        """, (sponsor_id,))
        application_trend = cursor.fetchall()

        cursor.execute("""
            select
                sub.subscription_id,
                sub.start_date,
                sub.end_date,
                coalesce(sub.subscription_status, 'inactive') as subscription_status,
                sp.plan_name,
                sp.scholarship_limit,
                sp.price,
                sp.duration_month
            from subscription sub
            left join subscription_plan sp on sp.plan_id = sub.plan_id
            where sub.sponsor_id = %s
            order by sub.start_date desc nulls last, sub.subscription_id desc
            limit 1
        """, (sponsor_id,))
        subscription = cursor.fetchone()

        cursor.execute("""
            select
                notification_id,
                message,
                notification_type,
                is_read,
                created_at
            from notification
            where user_id = %s
            order by created_at desc nulls last
            limit 5
        """, (sponsor_id,))
        notifications = cursor.fetchall()

        cursor.close()
        connection.close()

        scholarship_limit = 3
        plan_name = sponsor["subscription_status"].title()
        if subscription and subscription.get("scholarship_limit"):
            scholarship_limit = subscription["scholarship_limit"]
            plan_name = subscription.get("plan_name") or plan_name

        return jsonify({
            "sponsor": sponsor,
            "summary": {
                "total_scholarships": scholarship_summary["total_scholarships"],
                "active_scholarships": scholarship_summary["active_scholarships"],
                "pending_scholarships": scholarship_summary["pending_scholarships"],
                "rejected_scholarships": scholarship_summary["rejected_scholarships"],
                "total_applications": total_applications,
                "total_views": 0,
            },
            "subscription": {
                "plan_name": plan_name,
                "scholarship_limit": scholarship_limit,
                "used_scholarships": scholarship_summary["total_scholarships"],
                "status": subscription["subscription_status"] if subscription else sponsor["subscription_status"],
                "end_date": subscription["end_date"] if subscription else None,
            },
            "scholarships": scholarships,
            "application_trend": application_trend,
            "notifications": notifications,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/settings", methods=["GET"])
def get_sponsor_settings(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                u.full_name,
                u.email,
                u.phone_number,
                u.status,
                coalesce(s.organization_name, u.full_name) as organization_name,
                coalesce(s.organization_type, '') as organization_type,
                coalesce(s.website, '') as website,
                coalesce(s.subscription_status, 'free') as subscription_status
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        cursor.close()
        connection.close()

        if not sponsor:
            return error_response("Sponsor account not found", 404)

        return jsonify({"sponsor": sponsor})
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/settings", methods=["PATCH"])
def update_sponsor_settings(sponsor_id):
    data = request.get_json() or {}
    organization_name = (data.get("organization_name") or "").strip()
    organization_type = (data.get("organization_type") or "").strip()
    website = (data.get("website") or "").strip()
    phone_number = (data.get("phone_number") or "").strip()

    if not organization_name:
        return error_response("Organization name is required", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s
              and role = 'sponsor'
        """, (sponsor_id,))
        sponsor_user = cursor.fetchone()

        if not sponsor_user:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            update app_user
            set
                full_name = %s,
                phone_number = %s
            where user_id = %s
            returning user_id, full_name, email, phone_number, role, status, profile_picture, created_at
        """, (organization_name, phone_number or None, sponsor_id))
        updated_user = cursor.fetchone()

        cursor.execute("""
            insert into sponsor (
                sponsor_id,
                organization_name,
                organization_type,
                website,
                subscription_status
            )
            values (%s, %s, %s, %s, 'free')
            on conflict (sponsor_id)
            do update set
                organization_name = excluded.organization_name,
                organization_type = excluded.organization_type,
                website = excluded.website
            returning
                sponsor_id,
                organization_name,
                organization_type,
                website,
                subscription_status
        """, (sponsor_id, organization_name, organization_type or None, website or None))
        sponsor = cursor.fetchone()

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Provider settings updated successfully.",
            "user": updated_user,
            "sponsor": sponsor,
        })
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/scholarships", methods=["GET"])
def get_sponsor_scholarships(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                count(*) as total,
                count(*) filter (where lower(coalesce(status, 'pending')) in ('active', 'approved')) as active,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'rejected') as rejected
            from scholarship
            where sponsor_id = %s
        """, (sponsor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                s.scholarship_id,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                s.status,
                s.created_at,
                count(a.application_id) as application_count
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            where s.sponsor_id = %s
            group by
                s.scholarship_id,
                s.title,
                s.description,
                s.amount,
                s.category,
                s.eligibility_criteria,
                s.deadline,
                s.funding_type,
                s.status,
                s.created_at
            order by s.created_at desc nulls last, s.scholarship_id desc
        """, (sponsor_id,))
        scholarships = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "sponsor": sponsor,
            "summary": summary,
            "scholarships": scholarships,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/scholarships", methods=["POST"])
def create_sponsor_scholarship(sponsor_id):
    data = request.get_json() or {}
    required_fields = [
        "title",
        "description",
        "amount",
        "category",
        "eligibility_criteria",
        "deadline",
        "funding_type",
    ]
    missing_fields = [
        field for field in required_fields
        if data.get(field) is None or str(data.get(field)).strip() == ""
    ]

    if missing_fields:
        return error_response(f"Missing required fields: {', '.join(missing_fields)}", 400)

    try:
        amount = float(data["amount"])
    except (TypeError, ValueError):
        return error_response("Scholarship amount must be a valid number", 400)

    if amount < 0:
        return error_response("Scholarship amount cannot be negative", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select sp.scholarship_limit
            from subscription sub
            left join subscription_plan sp on sp.plan_id = sub.plan_id
            where sub.sponsor_id = %s
              and lower(coalesce(sub.subscription_status, 'inactive')) = 'active'
            order by sub.start_date desc nulls last, sub.subscription_id desc
            limit 1
        """, (sponsor_id,))
        subscription = cursor.fetchone()

        scholarship_limit = subscription["scholarship_limit"] if subscription and subscription.get("scholarship_limit") else 3

        cursor.execute("""
            select count(*) as total
            from scholarship
            where sponsor_id = %s
        """, (sponsor_id,))
        used_slots = cursor.fetchone()["total"]

        if used_slots >= scholarship_limit:
            cursor.close()
            connection.close()
            return error_response(
                f"Your current plan allows {scholarship_limit} scholarship listings. Upgrade your plan to add more.",
                403,
            )

        cursor.execute("""
            insert into scholarship (
                sponsor_id,
                title,
                description,
                amount,
                category,
                eligibility_criteria,
                deadline,
                funding_type,
                status
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, 'pending')
            returning
                scholarship_id,
                sponsor_id,
                title,
                description,
                amount,
                category,
                eligibility_criteria,
                deadline,
                funding_type,
                status,
                created_at
        """, (
            sponsor_id,
            data["title"].strip(),
            data["description"].strip(),
            amount,
            data["category"].strip(),
            data["eligibility_criteria"].strip(),
            data["deadline"],
            data["funding_type"].strip(),
        ))
        scholarship = cursor.fetchone()
        connection.commit()

        cursor.close()
        connection.close()

        return jsonify({
            "message": "Scholarship submitted for administrator review.",
            "scholarship": scholarship,
        }), 201
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/applications", methods=["GET"])
def get_sponsor_applications(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                count(*) as total,
                count(*) filter (where lower(coalesce(a.application_status, 'pending')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(a.application_status, 'pending')) = 'approved') as approved,
                count(*) filter (where lower(coalesce(a.application_status, 'pending')) = 'rejected') as rejected,
                count(*) filter (where a.application_date >= current_date - interval '7 days') as new_this_week
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            where s.sponsor_id = %s
        """, (sponsor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                s.title,
                count(a.application_id) as total
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            where s.sponsor_id = %s
            group by s.scholarship_id, s.title
            order by total desc, s.created_at desc nulls last
            limit 1
        """, (sponsor_id,))
        most_applied = cursor.fetchone()

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
                u.full_name as student_name,
                u.email as student_email,
                coalesce(st.education_level, '') as education_level,
                st.cgpa,
                coalesce(st.field_of_study, '') as field_of_study,
                coalesce(st.university, '') as university
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            join app_user u on u.user_id = a.student_id
            left join student st on st.student_id = a.student_id
            where s.sponsor_id = %s
            order by a.application_date desc nulls last, a.application_id desc
        """, (sponsor_id,))
        applications = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "sponsor": sponsor,
            "summary": {
                "total": summary["total"],
                "pending": summary["pending"],
                "approved": summary["approved"],
                "rejected": summary["rejected"],
                "new_this_week": summary["new_this_week"],
                "most_applied": most_applied["title"] if most_applied and most_applied["total"] else None,
            },
            "applications": applications,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/applications/<int:application_id>", methods=["PATCH"])
def update_sponsor_application(sponsor_id, application_id):
    data = request.get_json() or {}
    status = (data.get("status") or "").strip().lower()
    remarks = data.get("remarks")

    if status not in {"approved", "rejected", "pending"}:
        return error_response("Status must be pending, approved, or rejected", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update application a
            set
                application_status = %s,
                remarks = coalesce(%s, a.remarks)
            from scholarship s
            where s.scholarship_id = a.scholarship_id
              and s.sponsor_id = %s
              and a.application_id = %s
            returning
                a.application_id,
                a.student_id,
                a.scholarship_id,
                a.application_date,
                a.application_status,
                a.remarks
        """, (status, remarks, sponsor_id, application_id))
        application = cursor.fetchone()

        if not application:
            cursor.close()
            connection.close()
            return error_response("Application not found for this sponsor", 404)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": f"Application marked as {status}.",
            "application": application,
        })
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/statistics", methods=["GET"])
def get_sponsor_statistics(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                count(a.application_id) as total_applications,
                count(distinct a.student_id) as unique_students,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'approved') as awarded_students,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'pending') as pending_applications,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'rejected') as rejected_applications
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            where s.sponsor_id = %s
        """, (sponsor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                s.scholarship_id,
                s.title,
                count(a.application_id) as total_applications,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'approved') as awarded_students,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'pending') as pending_applications,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'rejected') as rejected_applications
            from scholarship s
            left join application a on a.scholarship_id = s.scholarship_id
            where s.sponsor_id = %s
            group by s.scholarship_id, s.title
            order by total_applications desc, s.created_at desc nulls last
            limit 8
        """, (sponsor_id,))
        scholarship_breakdown = cursor.fetchall()

        cursor.execute("""
            select
                coalesce(nullif(st.field_of_study, ''), 'Not provided') as field_of_study,
                count(a.application_id) as total_applications,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'approved') as awarded_students
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            left join student st on st.student_id = a.student_id
            where s.sponsor_id = %s
            group by coalesce(nullif(st.field_of_study, ''), 'Not provided')
            order by total_applications desc
            limit 6
        """, (sponsor_id,))
        field_breakdown = cursor.fetchall()

        cursor.execute("""
            select
                to_char(date_trunc('month', a.application_date), 'Mon YYYY') as month_label,
                count(a.application_id) as total_applications,
                count(a.application_id) filter (where lower(coalesce(a.application_status, 'pending')) = 'approved') as awarded_students
            from application a
            join scholarship s on s.scholarship_id = a.scholarship_id
            where s.sponsor_id = %s
              and a.application_date is not null
            group by date_trunc('month', a.application_date)
            order by date_trunc('month', a.application_date) asc
            limit 12
        """, (sponsor_id,))
        monthly_trend = cursor.fetchall()

        cursor.close()
        connection.close()

        total_applications = summary["total_applications"] or 0
        awarded_students = summary["awarded_students"] or 0
        success_rate = round((awarded_students / total_applications) * 100, 1) if total_applications else 0
        top_field = field_breakdown[0]["field_of_study"] if field_breakdown else None

        return jsonify({
            "sponsor": sponsor,
            "summary": {
                "total_applications": total_applications,
                "unique_students": summary["unique_students"] or 0,
                "awarded_students": awarded_students,
                "pending_applications": summary["pending_applications"] or 0,
                "rejected_applications": summary["rejected_applications"] or 0,
                "success_rate": success_rate,
                "top_field": top_field,
            },
            "scholarship_breakdown": scholarship_breakdown,
            "field_breakdown": field_breakdown,
            "monthly_trend": monthly_trend,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/subscriptions", methods=["GET"])
def get_sponsor_subscriptions(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name,
                coalesce(s.subscription_status, 'free') as subscription_status
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        ensure_default_subscription_plans(cursor)
        connection.commit()

        cursor.execute("""
            select
                plan_id,
                plan_name,
                price,
                scholarship_limit,
                duration_month
            from subscription_plan
            order by price asc, scholarship_limit asc
        """)
        plans = cursor.fetchall()

        cursor.execute("""
            select
                sub.subscription_id,
                sub.plan_id,
                sub.start_date,
                sub.end_date,
                coalesce(sub.subscription_status, 'inactive') as subscription_status,
                sp.plan_name,
                sp.price,
                sp.scholarship_limit,
                sp.duration_month
            from subscription sub
            left join subscription_plan sp on sp.plan_id = sub.plan_id
            where sub.sponsor_id = %s
            order by sub.start_date desc nulls last, sub.subscription_id desc
            limit 1
        """, (sponsor_id,))
        current_subscription = cursor.fetchone()

        cursor.execute("""
            select count(*) as used_scholarships
            from scholarship
            where sponsor_id = %s
        """, (sponsor_id,))
        used_scholarships = cursor.fetchone()["used_scholarships"]

        cursor.close()
        connection.close()

        current_plan = current_subscription
        if not current_plan:
            free_plan = next((plan for plan in plans if plan["plan_name"].lower() == "free"), None)
            current_plan = {
                "subscription_id": None,
                "plan_id": free_plan["plan_id"] if free_plan else None,
                "start_date": None,
                "end_date": None,
                "subscription_status": sponsor["subscription_status"],
                "plan_name": free_plan["plan_name"] if free_plan else sponsor["subscription_status"].title(),
                "price": free_plan["price"] if free_plan else 0,
                "scholarship_limit": free_plan["scholarship_limit"] if free_plan else 3,
                "duration_month": free_plan["duration_month"] if free_plan else 1,
            }

        return jsonify({
            "sponsor": sponsor,
            "current_subscription": current_plan,
            "plans": plans,
            "usage": {
                "used_scholarships": used_scholarships,
                "scholarship_limit": current_plan["scholarship_limit"] or 3,
            },
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/subscriptions", methods=["POST"])
def create_sponsor_subscription(sponsor_id):
    data = request.get_json() or {}
    plan_id = data.get("plan_id")

    if not plan_id:
        return error_response("plan_id is required", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id
            from app_user u
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        ensure_default_subscription_plans(cursor)

        cursor.execute("""
            select
                plan_id,
                plan_name,
                price,
                scholarship_limit,
                duration_month
            from subscription_plan
            where plan_id = %s
        """, (plan_id,))
        plan = cursor.fetchone()

        if not plan:
            cursor.close()
            connection.close()
            return error_response("Subscription plan not found", 404)

        cursor.execute("""
            update subscription
            set subscription_status = 'inactive'
            where sponsor_id = %s
              and lower(coalesce(subscription_status, 'inactive')) = 'active'
        """, (sponsor_id,))

        cursor.execute("""
            insert into subscription (
                sponsor_id,
                plan_id,
                start_date,
                end_date,
                subscription_status
            )
            values (
                %s,
                %s,
                current_date,
                (current_date + (%s || ' months')::interval)::date,
                'active'
            )
            returning
                subscription_id,
                sponsor_id,
                plan_id,
                start_date,
                end_date,
                subscription_status
        """, (sponsor_id, plan_id, plan["duration_month"] or 1))
        subscription = cursor.fetchone()

        cursor.execute("""
            update sponsor
            set subscription_status = %s
            where sponsor_id = %s
        """, (plan["plan_name"].lower(), sponsor_id))

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": f"{plan['plan_name']} plan activated.",
            "subscription": subscription,
            "plan": plan,
        }), 201
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/appeals", methods=["GET"])
def get_sponsor_appeals(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                count(*) filter (where lower(coalesce(status, 'pending')) = 'rejected') as rejected,
                count(*) filter (where lower(coalesce(status, 'pending')) = 'appeal_submitted') as under_review,
                count(*) filter (where lower(coalesce(status, 'pending')) in ('active', 'approved')) as approved_after_review
            from scholarship
            where sponsor_id = %s
        """, (sponsor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                scholarship_id,
                title,
                description,
                amount,
                category,
                eligibility_criteria,
                deadline,
                funding_type,
                status,
                created_at
            from scholarship
            where sponsor_id = %s
              and lower(coalesce(status, 'pending')) in ('rejected', 'appeal_submitted')
            order by created_at desc nulls last, scholarship_id desc
        """, (sponsor_id,))
        scholarships = cursor.fetchall()

        cursor.execute("""
            select
                log_id,
                user_id,
                action,
                description,
                action_time
            from audit_log
            where user_id = %s
              and action = 'sponsor_appeal_submitted'
            order by action_time desc nulls last, log_id desc
            limit 8
        """, (sponsor_id,))
        appeal_history = cursor.fetchall()

        cursor.close()
        connection.close()

        latest_status = "No rejected submissions"
        if summary["under_review"]:
            latest_status = "Under Review"
        elif summary["rejected"]:
            latest_status = "Action Needed"
        elif summary["approved_after_review"]:
            latest_status = "Resolved"

        return jsonify({
            "sponsor": sponsor,
            "summary": {
                "rejected": summary["rejected"] or 0,
                "under_review": summary["under_review"] or 0,
                "resolved": summary["approved_after_review"] or 0,
                "latest_status": latest_status,
            },
            "scholarships": scholarships,
            "appeal_history": appeal_history,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/appeals", methods=["POST"])
def create_sponsor_appeal(sponsor_id):
    data = request.get_json() or {}
    scholarship_id = data.get("scholarship_id")
    appeal_message = (data.get("appeal_message") or "").strip()

    if not scholarship_id:
        return error_response("scholarship_id is required", 400)

    if len(appeal_message) < 20:
        return error_response("Appeal message must be at least 20 characters.", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                scholarship_id,
                title,
                status
            from scholarship
            where scholarship_id = %s
              and sponsor_id = %s
        """, (scholarship_id, sponsor_id))
        scholarship = cursor.fetchone()

        if not scholarship:
            cursor.close()
            connection.close()
            return error_response("Rejected scholarship listing not found for this sponsor.", 404)

        current_status = (scholarship["status"] or "pending").lower()
        if current_status not in {"rejected", "appeal_submitted"}:
            cursor.close()
            connection.close()
            return error_response("Only rejected scholarship listings can be appealed.", 400)

        if current_status == "appeal_submitted":
            cursor.close()
            connection.close()
            return error_response("An appeal has already been submitted for this scholarship.", 400)

        cursor.execute("""
            update scholarship
            set status = 'appeal_submitted'
            where scholarship_id = %s
              and sponsor_id = %s
            returning scholarship_id, title, status
        """, (scholarship_id, sponsor_id))
        updated_scholarship = cursor.fetchone()

        cursor.execute("""
            insert into audit_log (
                user_id,
                action,
                description
            )
            values (%s, 'sponsor_appeal_submitted', %s)
            returning log_id, user_id, action, description, action_time
        """, (
            sponsor_id,
            f"Appeal submitted for scholarship #{scholarship_id} ({scholarship['title']}): {appeal_message}",
        ))
        appeal_log = cursor.fetchone()

        cursor.execute("""
            insert into notification (
                user_id,
                message,
                notification_type,
                is_read
            )
            values (%s, %s, 'appeal', false)
        """, (
            sponsor_id,
            f"Your appeal for {scholarship['title']} has been submitted for administrator review.",
        ))

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Appeal submitted for administrator review.",
            "scholarship": updated_scholarship,
            "appeal": appeal_log,
        }), 201
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/messages", methods=["GET"])
def get_sponsor_messages(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as sponsor_id,
                coalesce(s.organization_name, u.full_name) as organization_name
            from app_user u
            left join sponsor s on s.sponsor_id = u.user_id
            where u.user_id = %s
              and u.role = 'sponsor'
        """, (sponsor_id,))
        sponsor = cursor.fetchone()

        if not sponsor:
            cursor.close()
            connection.close()
            return error_response("Sponsor account not found", 404)

        cursor.execute("""
            select
                notification_id,
                user_id,
                message,
                notification_type,
                is_read,
                created_at
            from notification
            where user_id = %s
            order by created_at desc nulls last, notification_id desc
        """, (sponsor_id,))
        notifications = cursor.fetchall()

        cursor.close()
        connection.close()

        total_messages = len(notifications)
        unread_messages = len([notification for notification in notifications if not notification["is_read"]])
        latest_notification = notifications[0] if notifications else None

        return jsonify({
            "sponsor": sponsor,
            "summary": {
                "total": total_messages,
                "unread": unread_messages,
                "read": total_messages - unread_messages,
                "latest_sender": "Administrator" if latest_notification else "No messages yet",
                "latest_type": latest_notification["notification_type"] if latest_notification else "No updates",
            },
            "notifications": notifications,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/messages/read-all", methods=["PATCH"])
def mark_all_sponsor_messages_read(sponsor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update notification
            set is_read = true
            where user_id = %s
              and is_read = false
            returning notification_id
        """, (sponsor_id,))
        updated_messages = cursor.fetchall()

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "All provider messages marked as read.",
            "updated_count": len(updated_messages),
        })
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@sponsors_bp.route("/<int:sponsor_id>/messages/<int:notification_id>", methods=["PATCH"])
def update_sponsor_message_status(sponsor_id, notification_id):
    data = request.get_json() or {}
    is_read = data.get("is_read", True)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update notification
            set is_read = %s
            where notification_id = %s
              and user_id = %s
            returning
                notification_id,
                user_id,
                message,
                notification_type,
                is_read,
                created_at
        """, (bool(is_read), notification_id, sponsor_id))
        notification = cursor.fetchone()

        if not notification:
            cursor.close()
            connection.close()
            return error_response("Provider message not found.", 404)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Provider message updated.",
            "notification": notification,
        })
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)
