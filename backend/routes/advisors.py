from flask import Blueprint, jsonify, request

from db import get_db_connection
from responses import error_response

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
                a.average_rating
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


@advisors_bp.route("/<int:advisor_id>/dashboard", methods=["GET"])
def get_advisor_dashboard(advisor_id):
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select
                u.user_id as advisor_id,
                u.full_name,
                u.email,
                coalesce(a.specialization, '') as specialization,
                coalesce(a.qualification, '') as qualification,
                a.experience_years,
                coalesce(a.average_rating, 0) as average_rating
            from app_user u
            left join advisor a on a.advisor_id = u.user_id
            where u.user_id = %s
              and u.role = 'advisor'
        """, (advisor_id,))
        advisor = cursor.fetchone()

        if not advisor:
            cursor.close()
            connection.close()
            return error_response("Advisor account not found", 404)

        cursor.execute("""
            select count(*) as total_students
            from student
        """)
        total_students = cursor.fetchone()["total_students"]

        cursor.execute("""
            select count(*) as today_appointments
            from appointment
            where advisor_id = %s
              and appointment_datetime::date = current_date
        """, (advisor_id,))
        today_appointments = cursor.fetchone()["today_appointments"]

        cursor.execute("""
            select count(*) as pending_requests
            from appointment
            where advisor_id = %s
              and lower(coalesce(appointment_status, 'pending')) = 'pending'
        """, (advisor_id,))
        pending_requests = cursor.fetchone()["pending_requests"]

        cursor.execute("""
            select count(*) as total_quizzes
            from quiz
            where advisor_id = %s
        """, (advisor_id,))
        total_quizzes = cursor.fetchone()["total_quizzes"]

        cursor.execute("""
            select
                count(qa.attempt_id) as total_attempts,
                coalesce(round(avg(qa.score), 2), 0) as average_score
            from quiz q
            left join quiz_attempt qa on qa.quiz_id = q.quiz_id
            where q.advisor_id = %s
        """, (advisor_id,))
        quiz_stats = cursor.fetchone()

        cursor.execute("""
            select
                count(*) as total_reviews,
                coalesce(round(avg(rating), 1), 0) as average_rating
            from review
            where advisor_id = %s
        """, (advisor_id,))
        review_stats = cursor.fetchone()

        cursor.execute("""
            select
                appointment_id,
                appointment_datetime,
                appointment_status,
                coalesce(u.full_name, 'Student') as student_name
            from appointment ap
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
              and ap.appointment_datetime::date = current_date
            order by ap.appointment_datetime asc
        """, (advisor_id,))
        today_schedule = cursor.fetchall()

        cursor.execute("""
            select
                appointment_id,
                appointment_datetime,
                appointment_status,
                coalesce(u.full_name, 'Student') as student_name
            from appointment ap
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
              and ap.appointment_datetime >= current_timestamp
            order by ap.appointment_datetime asc
            limit 5
        """, (advisor_id,))
        upcoming_appointments = cursor.fetchall()

        cursor.execute("""
            select
                appointment_id,
                appointment_datetime,
                appointment_status,
                coalesce(u.full_name, 'Student') as student_name
            from appointment ap
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
              and lower(coalesce(ap.appointment_status, 'pending')) = 'pending'
            order by ap.appointment_datetime asc
            limit 5
        """, (advisor_id,))
        recent_booking_requests = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "advisor": advisor,
            "summary": {
                "today_appointments": today_appointments,
                "pending_requests": pending_requests,
                "total_students": total_students,
                "average_rating": review_stats["average_rating"] or advisor["average_rating"] or 0,
            },
            "today_schedule": today_schedule,
            "upcoming_appointments": upcoming_appointments,
            "recent_booking_requests": recent_booking_requests,
            "student_insights": [],
            "quiz_overview": {
                "total_quizzes": total_quizzes,
                "total_attempts": quiz_stats["total_attempts"],
                "average_score": quiz_stats["average_score"],
            },
            "feedback": {
                "average_rating": review_stats["average_rating"],
                "total_reviews": review_stats["total_reviews"],
                "rating_distribution": [],
            },
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/profile", methods=["GET"])
def get_advisor_profile(advisor_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("""
            select
                u.user_id as advisor_id,
                u.full_name,
                u.email,
                u.phone_number,
                u.profile_picture,
                u.status,
                coalesce(a.specialization, '') as specialization,
                coalesce(a.qualification, '') as qualification,
                a.experience_years,
                coalesce(a.average_rating, 0) as average_rating
            from app_user u
            left join advisor a on a.advisor_id = u.user_id
            where u.user_id = %s
              and u.role = 'advisor'
        """, (advisor_id,))
        profile = cursor.fetchone()
        cursor.close()
        connection.close()

        if not profile:
            return error_response("Advisor account not found", 404)

        return jsonify(profile)
    except Exception as e:
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/profile", methods=["PUT"])
def update_advisor_profile(advisor_id):
    data = request.get_json() or {}
    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            update app_user
            set
                full_name = %s,
                phone_number = %s,
                profile_picture = %s
            where user_id = %s
            returning user_id
        """, (
            data.get("full_name"),
            data.get("phone_number"),
            data.get("profile_picture"),
            advisor_id,
        ))

        if not cursor.fetchone():
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("Advisor profile not found", 404)

        cursor.execute("""
            insert into advisor (
                advisor_id,
                specialization,
                qualification,
                experience_years,
                average_rating
            )
            values (%s, %s, %s, %s, 0)
            on conflict (advisor_id) do update
            set
                specialization = excluded.specialization,
                qualification = excluded.qualification,
                experience_years = excluded.experience_years
        """, (
            advisor_id,
            data.get("specialization"),
            data.get("qualification"),
            data.get("experience_years"),
        ))

        connection.commit()

        cursor.execute("""
            select
                u.user_id as advisor_id,
                u.full_name,
                u.email,
                u.phone_number,
                u.profile_picture,
                u.status,
                coalesce(a.specialization, '') as specialization,
                coalesce(a.qualification, '') as qualification,
                a.experience_years,
                coalesce(a.average_rating, 0) as average_rating
            from app_user u
            left join advisor a on a.advisor_id = u.user_id
            where u.user_id = %s
              and u.role = 'advisor'
        """, (advisor_id,))
        updated_profile = cursor.fetchone()
        cursor.close()
        connection.close()

        return jsonify(updated_profile)
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/schedule", methods=["GET"])
def get_advisor_schedule(advisor_id):
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
              and appointment_datetime::date = current_date
        """, (advisor_id,))
        today_count = cursor.fetchone()["count"]

        cursor.execute("""
            select count(*) as count
            from appointment
            where advisor_id = %s
              and appointment_datetime >= current_timestamp
        """, (advisor_id,))
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
                ap.appointment_status,
                coalesce(u.full_name, 'Student') as student_name
            from appointment ap
            left join app_user u on u.user_id = ap.student_id
            where ap.advisor_id = %s
            order by ap.appointment_datetime asc nulls last
            limit 30
        """, (advisor_id,))
        appointments = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "summary": {
                "today_count": today_count,
                "upcoming_count": upcoming_count,
                "pending_count": pending_count,
            },
            "appointments": appointments,
            "availability": [
                {"day": "Monday", "enabled": True, "start_time": "09:00", "end_time": "17:00"},
                {"day": "Tuesday", "enabled": True, "start_time": "09:00", "end_time": "17:00"},
                {"day": "Wednesday", "enabled": True, "start_time": "09:00", "end_time": "17:00"},
                {"day": "Thursday", "enabled": True, "start_time": "09:00", "end_time": "17:00"},
                {"day": "Friday", "enabled": True, "start_time": "09:00", "end_time": "15:00"},
                {"day": "Saturday", "enabled": False, "start_time": "", "end_time": ""},
                {"day": "Sunday", "enabled": False, "start_time": "", "end_time": ""},
            ],
            "blocked_dates": [],
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/appointments", methods=["GET"])
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


@advisors_bp.route("/<int:advisor_id>/students", methods=["GET"])
def get_advisor_students(advisor_id):
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
            with guided_students as (
                select distinct student_id
                from appointment
                where advisor_id = %s
                  and student_id is not null
            )
            select count(*) as total_guided
            from guided_students
        """, (advisor_id,))
        total_guided = cursor.fetchone()["total_guided"]

        cursor.execute("""
            select count(distinct student_id) as active_consultations
            from appointment
            where advisor_id = %s
              and student_id is not null
              and lower(coalesce(appointment_status, 'pending')) in ('pending', 'confirmed')
        """, (advisor_id,))
        active_consultations = cursor.fetchone()["active_consultations"]

        cursor.execute("""
            select count(distinct student_id) as completed_consultations
            from appointment
            where advisor_id = %s
              and student_id is not null
              and lower(coalesce(appointment_status, 'pending')) = 'completed'
        """, (advisor_id,))
        completed_consultations = cursor.fetchone()["completed_consultations"]

        cursor.execute("""
            select
                s.student_id,
                u.full_name,
                u.email,
                u.phone_number,
                s.education_level,
                s.cgpa,
                s.field_of_study,
                s.university,
                count(ap.appointment_id) as appointment_count,
                max(ap.appointment_datetime) as latest_appointment
            from appointment ap
            join student s on s.student_id = ap.student_id
            join app_user u on u.user_id = s.student_id
            where ap.advisor_id = %s
            group by
                s.student_id,
                u.full_name,
                u.email,
                u.phone_number,
                s.education_level,
                s.cgpa,
                s.field_of_study,
                s.university
            order by latest_appointment desc nulls last, u.full_name asc
        """, (advisor_id,))
        students = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "summary": {
                "total_guided": total_guided,
                "active_consultations": active_consultations,
                "completed_consultations": completed_consultations,
            },
            "students": students,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/feedback", methods=["GET"])
def get_advisor_feedback(advisor_id):
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
                count(*) as total_reviews,
                coalesce(round(avg(rating), 1), 0) as average_rating,
                coalesce(
                    round(
                        100.0 * count(*) filter (where rating >= 4)
                        / nullif(count(*), 0),
                        0
                    ),
                    0
                ) as satisfaction_rate
            from review
            where advisor_id = %s
        """, (advisor_id,))
        summary = cursor.fetchone()

        cursor.execute("""
            select
                rating,
                count(*) as total
            from review
            where advisor_id = %s
            group by rating
        """, (advisor_id,))
        rating_rows = cursor.fetchall()
        rating_lookup = {int(row["rating"]): row["total"] for row in rating_rows if row["rating"] is not None}
        distribution = [
            {"rating": rating, "total": rating_lookup.get(rating, 0)}
            for rating in range(5, 0, -1)
        ]

        cursor.execute("""
            select
                r.review_id,
                r.rating,
                r.comment,
                r.created_at,
                coalesce(u.full_name, 'Student') as student_name,
                s.education_level,
                s.field_of_study
            from review r
            left join student s on s.student_id = r.student_id
            left join app_user u on u.user_id = r.student_id
            where r.advisor_id = %s
            order by r.created_at desc nulls last
            limit 12
        """, (advisor_id,))
        reviews = cursor.fetchall()

        cursor.close()
        connection.close()

        return jsonify({
            "summary": summary,
            "rating_distribution": distribution,
            "reviews": reviews,
        })
    except Exception as e:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)


@advisors_bp.route("/<int:advisor_id>/messages", methods=["GET"])
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
def send_advisor_message(advisor_id, conversation_id):
    data = request.get_json() or {}
    message_text = (data.get("message_text") or "").strip()

    if not message_text:
        return error_response("Message text is required", 400)

    connection = None
    cursor = None

    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            select participant_id
            from conversation_participant
            where conversation_id = %s
              and user_id = %s
        """, (conversation_id, advisor_id))

        if not cursor.fetchone():
            connection.rollback()
            cursor.close()
            connection.close()
            return error_response("Conversation not found for this advisor", 404)

        cursor.execute("""
            insert into message (conversation_id, sender_id, message_text, is_read)
            values (%s, %s, %s, false)
            returning message_id, conversation_id, sender_id, message_text, sent_at, is_read
        """, (conversation_id, advisor_id, message_text))
        message = cursor.fetchone()

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"message": message}), 201
    except Exception as e:
        if connection:
            connection.rollback()
        if cursor:
            cursor.close()
        if connection:
            connection.close()
        return error_response(str(e), 500)
