from contextlib import closing
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from db import get_db_connection
from responses import error_response
from advisor_scheduling import malaysia_now, read_schedule
from .advisor_scheduling import active_advisor
from security import advisor_access_required

advisors_bp = Blueprint("advisors", __name__, url_prefix="/api/advisors")


@advisors_bp.route("", methods=["GET"])
def get_advisors():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                a.advisor_id,
                u.full_name,
                u.email,
                u.profile_picture,
                u.status,
                a.specialization,
                a.qualification,
                a.experience_years,
                coalesce((SELECT round(avg(rating),1) FROM review WHERE advisor_id=a.advisor_id), a.average_rating, 0) AS average_rating, a.institution, a.professional_title, a.bio
            from advisor a
            join app_user u on u.user_id = a.advisor_id
            where coalesce(u.status, 'active') = 'active'
            order by u.full_name asc
        """)
        advisors = cursor.fetchall()
        cursor.close()
        connection.close()
        return jsonify(advisors)
    except Exception as e:
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/schedule", methods=["GET"])
@advisor_access_required
def get_advisor_schedule(advisor_id):
    try:
        today = malaysia_now().date()
        week_start = date.fromisoformat(request.args.get('week_start', (today - timedelta(days=today.weekday())).isoformat()))
        week_end = week_start + timedelta(days=7)
    except (ValueError, OverflowError):
        return error_response("Choose a valid week start (YYYY-MM-DD).", 400)
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s
              and role = 'advisor'
        """, (advisor_id,))

        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Advisor account not found", 404)

        cursor.execute("""
            select count(*) as count
            from appointment
            where advisor_id = %s
              and appointment_datetime::date = %s
              and lower(coalesce(appointment_status, 'pending')) <> 'cancelled'
        """, (advisor_id, malaysia_now().date()))
        today_count = cursor.fetchone()["count"]

        cursor.execute("""
            select count(*) as count
            from appointment
            where advisor_id = %s
              and appointment_datetime >= %s
              and lower(coalesce(appointment_status, 'pending')) in ('pending', 'confirmed')
        """, (advisor_id, malaysia_now()))
        upcoming_count = cursor.fetchone()["count"]

        cursor.execute("""
            select count(*) as count
            from appointment
            where advisor_id = %s
              and lower(coalesce(appointment_status, 'pending')) = 'pending'
        """, (advisor_id,))
        pending_count = cursor.fetchone()["count"]

        cursor.execute("""
            select
                ap.appointment_id,
                ap.appointment_datetime,
                ap.duration_minutes,
                ap.consultation_topic, ap.student_message,
                ap.appointment_status,
                coalesce(u.full_name, 'Student') as student_name
            from appointment ap
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
              and ap.appointment_datetime >= %s and ap.appointment_datetime < %s
            order by ap.appointment_datetime asc
        """, (advisor_id, week_start, week_end))
        appointments = cursor.fetchall()

        saved_schedule = read_schedule(cursor, advisor_id)
        for appointment in appointments:
            if appointment["appointment_datetime"]:
                appointment["appointment_datetime"] = appointment["appointment_datetime"].isoformat() + "+08:00"

        cursor.close()
        connection.close()

        return jsonify({
            "summary": {
                "this_week_count": sum(1 for item in appointments if (item['appointment_status'] or 'pending').lower() != 'cancelled'),
                "today_count": today_count,
                "upcoming_count": upcoming_count,
                "pending_count": pending_count,
            },
            "week_start": week_start.isoformat(),
            "appointments": appointments,
            **saved_schedule,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/appointments", methods=["GET"])
@advisor_access_required
def get_advisor_appointments(advisor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s
              and role = 'advisor'
        """, (advisor_id,))

        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Advisor account not found", 404)

        cursor.execute("""
            select
                count(*) filter (where lower(coalesce(appointment_status, 'pending')) = 'confirmed') as confirmed,
                count(*) filter (where lower(coalesce(appointment_status, 'pending')) = 'pending') as pending,
                count(*) filter (where lower(coalesce(appointment_status, 'pending')) = 'completed') as completed,
                count(*) as total
            from appointment
            where advisor_id = %s
        """, (advisor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                ap.appointment_id,
                ap.appointment_datetime,
                ap.duration_minutes,
                ap.consultation_topic, ap.student_message, ap.student_id,
                u.profile_picture AS student_photo,
                coalesce(ap.appointment_status, 'pending') as appointment_status,
                coalesce(u.full_name, 'Student') as student_name,
                u.email as student_email,
                u.phone_number as student_phone,
                s.education_level,
                s.field_of_study,
                s.university
            from appointment ap
            left join student s on s.student_id = ap.student_id
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
            order by ap.appointment_datetime asc nulls last
        """, (advisor_id,))
        appointments = cursor.fetchall()
        for appointment in appointments:
            if appointment["appointment_datetime"]:
                appointment["appointment_datetime"] = appointment["appointment_datetime"].isoformat() + "+08:00"

        cursor.close()
        connection.close()

        return jsonify({
            "summary": summary,
            "appointments": appointments,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/appointments/<int:appointment_id>/status", methods=["PATCH"])
@advisor_access_required
def update_advisor_appointment_status(advisor_id, appointment_id):
    data = request.get_json() or {}
    status = data.get("status")

    if status not in ["pending", "confirmed", "completed", "cancelled"]:
        return error_response("Invalid appointment status", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        # Coordinate status changes with new bookings so reactivating a cancelled
        # appointment cannot reserve a slot that another student has since booked.
        cursor.execute("SELECT user_id FROM app_user WHERE user_id = %s AND role = 'advisor' FOR UPDATE", (advisor_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Advisor account not found", 404)
        cursor.execute("SELECT student_id, appointment_datetime, duration_minutes FROM appointment WHERE appointment_id = %s AND advisor_id = %s FOR UPDATE", (appointment_id, advisor_id))
        current = cursor.fetchone()
        if not current:
            cursor.close()
            connection.close()
            return error_response("Appointment not found", 404)
        if current["student_id"]:
            cursor.execute("SELECT student_id FROM student WHERE student_id = %s FOR UPDATE", (current["student_id"],))
        if status in ("pending", "confirmed") and current["appointment_datetime"]:
            cursor.execute("""SELECT appointment_id FROM appointment
                WHERE appointment_id <> %s AND (advisor_id = %s OR student_id = %s)
                  AND lower(coalesce(appointment_status, 'pending')) <> 'cancelled'
                  AND appointment_datetime < %s + (%s * interval '1 minute')
                  AND appointment_datetime + (duration_minutes * interval '1 minute') > %s LIMIT 1""",
                (appointment_id, advisor_id, current["student_id"], current["appointment_datetime"], current.get("duration_minutes", 30), current["appointment_datetime"]))
            if cursor.fetchone():
                connection.rollback()
                cursor.close()
                connection.close()
                return error_response("This appointment overlaps an existing booking.", 409)
        cursor.execute("""
            update appointment
            set appointment_status = %s
            where appointment_id = %s
              and advisor_id = %s
            returning appointment_id
        """, (status, appointment_id, advisor_id))

        if not cursor.fetchone():
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("Appointment not found", 404)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"message": "Appointment status updated"})
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/feedback", methods=["GET"])
@advisor_access_required
def get_advisor_feedback(advisor_id):
    try:
        page = int(request.args.get('page', '1'))
        if page < 1 or page > 1000000:
            raise ValueError
    except ValueError:
        return error_response('Choose a valid review page.', 400)
    page_size = 12
    month_start = malaysia_now().date().replace(day=1)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id):
                    return error_response('Advisor account not found.', 404)
                cursor.execute("""SELECT count(*) AS total_reviews,
                    count(DISTINCT student_id) AS students_reviewed,
                    coalesce(round(avg(rating),1),0) AS average_rating,
                    coalesce(round(100.0 * count(*) FILTER (WHERE rating >= 4)
                        / nullif(count(*),0),0),0) AS satisfaction_rate
                    FROM review WHERE advisor_id=%s""", (advisor_id,))
                summary = cursor.fetchone()
                cursor.execute('SELECT rating,count(*) AS total FROM review WHERE advisor_id=%s GROUP BY rating', (advisor_id,))
                counts = {row['rating']: row['total'] for row in cursor.fetchall()}
                distribution = [{'rating': rating, 'total': counts.get(rating, 0)} for rating in range(5, 0, -1)]
                cursor.execute("""SELECT r.review_id,r.rating,r.comment,r.created_at,
                    coalesce(u.full_name,'Student') AS student_name,s.education_level,s.field_of_study
                    FROM review r LEFT JOIN student s ON s.student_id=r.student_id
                    LEFT JOIN app_user u ON u.user_id=r.student_id WHERE r.advisor_id=%s
                    ORDER BY r.created_at DESC NULLS LAST,r.review_id DESC LIMIT %s OFFSET %s""",
                    (advisor_id, page_size, (page - 1) * page_size))
                reviews = [dict(row) for row in cursor.fetchall()]
                for review in reviews:
                    if review['created_at']:
                        review['created_at'] = review['created_at'].isoformat() + '+08:00'
                cursor.execute("""SELECT to_char(months.month,'YYYY-MM') AS month,
                    to_char(months.month,'Mon') AS label,count(r.review_id) AS total_reviews,
                    round(avg(r.rating),1) AS average_rating
                    FROM generate_series(%s::date - interval '5 months',%s::date,interval '1 month') AS months(month)
                    LEFT JOIN review r ON r.advisor_id=%s AND r.created_at>=months.month
                        AND r.created_at<months.month+interval '1 month'
                    GROUP BY months.month ORDER BY months.month""", (month_start, month_start, advisor_id))
                trend = cursor.fetchall()
        return jsonify(summary=summary, rating_distribution=distribution, reviews=reviews, trend=trend,
                       pagination={'page': page, 'page_size': page_size, 'total': summary['total_reviews'],
                                   'total_pages': max(1, (summary['total_reviews'] + page_size - 1) // page_size)})
    except Exception:
        current_app.logger.exception('Advisor feedback could not be loaded')
        return error_response('Unable to load feedback. Please try again.', 503)


@advisors_bp.route("/<int:advisor_id>/messages", methods=["GET"])
@advisor_access_required
def get_advisor_messages(advisor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select user_id
            from app_user
            where user_id = %s
              and role = 'advisor'
        """, (advisor_id,))

        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return error_response("Advisor account not found", 404)

        cursor.execute("""
            with advisor_conversations as (
                select conversation_id
                from conversation_participant
                where user_id = %s
            ),
            latest_messages as (
                select distinct on (m.conversation_id)
                    m.conversation_id,
                    m.message_text,
                    m.sent_at,
                    m.sender_id,
                    m.is_read
                from message m
                join advisor_conversations ac on ac.conversation_id = m.conversation_id
                order by m.conversation_id, m.sent_at desc nulls last, m.message_id desc
            )
            select
                c.conversation_id,
                c.created_at,
                other_user.user_id as student_id,
                coalesce(other_user.full_name, 'Student') as student_name,
                other_user.email as student_email,
                s.education_level,
                s.field_of_study,
                lm.message_text as latest_message,
                lm.sent_at as latest_message_at,
                lm.sender_id as latest_sender_id,
                count(m.message_id) filter (
                    where m.sender_id <> %s
                      and coalesce(m.is_read, false) = false
                ) as unread_count
            from conversation c
            join advisor_conversations ac on ac.conversation_id = c.conversation_id
            left join conversation_participant cp_other
                on cp_other.conversation_id = c.conversation_id
               and cp_other.user_id <> %s
            left join app_user other_user on other_user.user_id = cp_other.user_id
            left join student s on s.student_id = other_user.user_id
            left join latest_messages lm on lm.conversation_id = c.conversation_id
            left join message m on m.conversation_id = c.conversation_id
            group by
                c.conversation_id,
                c.created_at,
                other_user.user_id,
                other_user.full_name,
                other_user.email,
                s.education_level,
                s.field_of_study,
                lm.message_text,
                lm.sent_at,
                lm.sender_id
            order by lm.sent_at desc nulls last, c.created_at desc
        """, (advisor_id, advisor_id, advisor_id))
        conversations = cursor.fetchall()

        cursor.execute("""
            select
                m.message_id,
                m.conversation_id,
                m.sender_id,
                coalesce(u.full_name, 'User') as sender_name,
                u.role as sender_role,
                m.message_text,
                m.sent_at,
                m.is_read
            from message m
            join conversation_participant cp on cp.conversation_id = m.conversation_id
            left join app_user u on u.user_id = m.sender_id
            where cp.user_id = %s
            order by m.sent_at asc nulls last, m.message_id asc
        """, (advisor_id,))
        messages = cursor.fetchall()

        cursor.close()
        connection.close()

        messages_by_conversation = {}
        for message in messages:
            messages_by_conversation.setdefault(message["conversation_id"], []).append(message)

        total_unread = sum(int(conversation["unread_count"] or 0) for conversation in conversations)
        latest_conversation = conversations[0] if conversations else None

        return jsonify({
            "summary": {
                "total_conversations": len(conversations),
                "unread_messages": total_unread,
                "latest_sender": latest_conversation["student_name"] if latest_conversation else None,
            },
            "conversations": conversations,
            "messages_by_conversation": messages_by_conversation,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/messages/<int:conversation_id>", methods=["POST"])
@advisor_access_required
def send_advisor_message(advisor_id, conversation_id):
    from .messaging import send_message
    return send_message(conversation_id)
