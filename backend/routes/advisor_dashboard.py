"""Advisor dashboard summaries, calendar dates, and scoped global search."""
from contextlib import closing
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from advisor_scheduling import malaysia_now
from db import get_db_connection
from responses import error_response
from security import advisor_access_required

dashboard_bp = Blueprint('advisor_dashboard', __name__, url_prefix='/api/advisors')
INSIGHT_COLORS = ['#8045ee', '#3587fc', '#36c990', '#f5c331', '#ee8caf', '#54cbe8', '#ad7cda', '#97a0bd']


def appointment_rows(cursor):
    rows = cursor.fetchall()
    for row in rows:
        value = row.get('appointment_datetime')
        row['appointment_datetime'] = value.isoformat() + '+08:00' if value else None
    return rows


def dashboard_dates():
    selected = date.fromisoformat(request.args.get('date', malaysia_now().date().isoformat()))
    month = date.fromisoformat(request.args.get('month', selected.strftime('%Y-%m')) + '-01')
    next_month = date(month.year + 1, 1, 1) if month.month == 12 else date(month.year, month.month + 1, 1)
    return selected, month, next_month


@dashboard_bp.route('/<int:advisor_id>/dashboard', methods=['GET'])
@advisor_access_required
def get_dashboard(advisor_id):
    try:
        selected_date, month_start, month_end = dashboard_dates()
    except (ValueError, TypeError, OverflowError):
        return error_response('Choose a valid date and calendar month.', 400)
    now = malaysia_now()
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute("""SELECT u.user_id AS advisor_id, u.full_name, u.email,
                    a.specialization, a.qualification, a.experience_years, coalesce(a.average_rating, 0) AS average_rating
                    FROM app_user u LEFT JOIN advisor a ON a.advisor_id = u.user_id
                    WHERE u.user_id = %s AND u.role = 'advisor' AND coalesce(u.status, 'active') = 'active'""", (advisor_id,))
                advisor = cursor.fetchone()
                if not advisor:
                    return error_response('Advisor account not found.', 404)
                cursor.execute("""SELECT
                    count(*) FILTER (WHERE appointment_datetime::date = %s
                        AND lower(coalesce(appointment_status, 'pending')) <> 'cancelled') AS today_appointments,
                    count(*) FILTER (WHERE lower(coalesce(appointment_status, 'pending')) = 'pending') AS pending_requests,
                    count(DISTINCT student_id) AS total_students
                    FROM appointment WHERE advisor_id = %s""", (now.date(), advisor_id))
                summary = dict(cursor.fetchone())
                cursor.execute("""SELECT count(*) AS total_reviews, coalesce(round(avg(rating), 1), 0) AS average_rating
                    FROM review WHERE advisor_id = %s""", (advisor_id,))
                reviews = cursor.fetchone()
                summary['average_rating'] = reviews['average_rating'] if reviews['total_reviews'] else advisor['average_rating']
                cursor.execute("""SELECT count(DISTINCT m.message_id) AS unread_messages FROM message m
                    JOIN conversation_participant mine ON mine.conversation_id = m.conversation_id AND mine.user_id = %s
                    JOIN app_user sender ON sender.user_id = m.sender_id AND sender.role = 'student'
                    WHERE m.sender_id <> %s AND coalesce(m.is_read, false) = false
                      AND (SELECT count(*) FROM conversation_participant cp WHERE cp.conversation_id = m.conversation_id) = 2""",
                    (advisor_id, advisor_id))
                summary['unread_messages'] = cursor.fetchone()['unread_messages']
                appointment_select = """SELECT ap.appointment_id, ap.student_id, ap.appointment_datetime,
                    coalesce(ap.appointment_status, 'pending') AS appointment_status, ap.duration_minutes,
                    coalesce(u.full_name, 'Student') AS student_name, s.education_level
                    FROM appointment ap LEFT JOIN app_user u ON u.user_id = ap.student_id
                    LEFT JOIN student s ON s.student_id = ap.student_id WHERE ap.advisor_id = %s"""
                cursor.execute(appointment_select + """ AND ap.appointment_datetime::date = %s
                    AND lower(coalesce(ap.appointment_status, 'pending')) <> 'cancelled'
                    ORDER BY ap.appointment_datetime, ap.appointment_id""", (advisor_id, selected_date))
                schedule = appointment_rows(cursor)
                if selected_date == now.date():
                    today_schedule = schedule
                else:
                    cursor.execute(appointment_select + """ AND ap.appointment_datetime::date = %s
                        AND lower(coalesce(ap.appointment_status, 'pending')) <> 'cancelled'
                        ORDER BY ap.appointment_datetime, ap.appointment_id""", (advisor_id, now.date()))
                    today_schedule = appointment_rows(cursor)
                cursor.execute(appointment_select + """ AND ap.appointment_datetime >= %s
                    AND lower(coalesce(ap.appointment_status, 'pending')) IN ('pending', 'confirmed')
                    ORDER BY ap.appointment_datetime, ap.appointment_id LIMIT 5""", (advisor_id, now))
                upcoming = appointment_rows(cursor)
                cursor.execute(appointment_select + """ AND lower(coalesce(ap.appointment_status, 'pending')) = 'pending'
                    ORDER BY ap.appointment_id DESC LIMIT 5""", (advisor_id,))
                pending = appointment_rows(cursor)
                cursor.execute("""SELECT appointment_datetime::date AS date, count(*) AS count,
                    count(*) FILTER (WHERE lower(coalesce(appointment_status, 'pending')) = 'pending') AS pending_count
                    FROM appointment WHERE advisor_id = %s
                    AND appointment_datetime >= %s AND appointment_datetime < %s
                    AND lower(coalesce(appointment_status, 'pending')) <> 'cancelled'
                    GROUP BY appointment_datetime::date ORDER BY appointment_datetime::date""", (advisor_id, month_start, month_end))
                calendar_days = [{**row, 'date': row['date'].isoformat()} for row in cursor.fetchall()]
                cursor.execute("""SELECT coalesce(nullif(trim(s.education_level), ''), 'Not specified') AS label, count(*) AS value
                    FROM student s WHERE EXISTS (SELECT 1 FROM appointment ap WHERE ap.student_id = s.student_id AND ap.advisor_id = %s)
                    GROUP BY coalesce(nullif(trim(s.education_level), ''), 'Not specified') ORDER BY value DESC, label""", (advisor_id,))
                insight_rows = cursor.fetchall()
                insight_total = sum(row['value'] for row in insight_rows)
                insights = [{**row, 'percent': f"{100 * row['value'] / insight_total:.1f}%", 'color': INSIGHT_COLORS[index % len(INSIGHT_COLORS)]}
                            for index, row in enumerate(insight_rows)]
                cursor.execute("""SELECT count(DISTINCT q.quiz_id) AS total_quizzes, count(qa.attempt_id) AS total_attempts,
                    coalesce(round(avg(qa.score), 2), 0) AS average_score
                    FROM quiz q LEFT JOIN quiz_attempt qa ON qa.quiz_id = q.quiz_id WHERE q.advisor_id = %s""", (advisor_id,))
                quiz_overview = cursor.fetchone()
                cursor.execute('SELECT rating, count(*) AS count FROM review WHERE advisor_id = %s GROUP BY rating', (advisor_id,))
                ratings = {row['rating']: row['count'] for row in cursor.fetchall()}
                feedback = {**reviews, 'rating_distribution': [
                    {'rating': rating, 'percentage': round(100 * ratings.get(rating, 0) / reviews['total_reviews']) if reviews['total_reviews'] else 0}
                    for rating in range(5, 0, -1)
                ]}
        return jsonify({
            'advisor': advisor, 'summary': summary, 'selected_date': selected_date.isoformat(),
            'schedule': schedule, 'today_schedule': today_schedule, 'upcoming_appointments': upcoming,
            'recent_booking_requests': pending, 'calendar_month': month_start.strftime('%Y-%m'), 'calendar_days': calendar_days,
            'student_insights': insights, 'insight_total': insight_total, 'quiz_overview': quiz_overview, 'feedback': feedback,
        })
    except Exception:
        current_app.logger.error('Advisor dashboard could not be loaded')
        return error_response('Unable to load your dashboard. Please try again.', 503)


@dashboard_bp.route('/<int:advisor_id>/search', methods=['GET'])
@advisor_access_required
def search_dashboard(advisor_id):
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify({'results': []})
    if len(query) > 100:
        return error_response('Search using at most 100 characters.', 400)
    pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute("""SELECT user_id FROM app_user WHERE user_id = %s AND role = 'advisor'
                    AND coalesce(status, 'active') = 'active'""", (advisor_id,))
                if not cursor.fetchone():
                    return error_response('Advisor account not found.', 404)
                cursor.execute("""(SELECT 'student' AS kind, s.student_id AS id, u.full_name AS title,
                    coalesce(s.education_level, 'Student') AS subtitle
                    FROM student s JOIN app_user u ON u.user_id = s.student_id
                    WHERE EXISTS (SELECT 1 FROM appointment ap WHERE ap.advisor_id = %s AND ap.student_id = s.student_id)
                      AND (u.full_name ILIKE %s OR coalesce(s.field_of_study, '') ILIKE %s)
                    ORDER BY u.full_name LIMIT 6)
                    UNION ALL
                    (SELECT 'appointment', ap.appointment_id, coalesce(u.full_name, 'Student') || ' · Consultation',
                        to_char(ap.appointment_datetime, 'DD Mon YYYY HH24:MI') || ' · ' || coalesce(ap.appointment_status, 'pending')
                    FROM appointment ap LEFT JOIN app_user u ON u.user_id = ap.student_id
                    WHERE ap.advisor_id = %s AND (u.full_name ILIKE %s OR coalesce(ap.appointment_status, 'pending') ILIKE %s
                        OR to_char(ap.appointment_datetime, 'YYYY-MM-DD') ILIKE %s)
                    ORDER BY ap.appointment_datetime DESC LIMIT 6)
                    UNION ALL
                    (SELECT 'quiz', quiz_id, title, coalesce(description, 'Pathway quiz')
                    FROM quiz WHERE advisor_id = %s AND (title ILIKE %s OR coalesce(description, '') ILIKE %s)
                    ORDER BY quiz_id DESC LIMIT 6)""", (advisor_id, pattern, pattern, advisor_id, pattern, pattern, pattern, advisor_id, pattern, pattern))
                results = cursor.fetchall()
        routes = {'student': '/advisor/students?student=', 'appointment': '/advisor/appointments?appointment=', 'quiz': '/advisor/pathway-quizzes?quiz='}
        return jsonify({'results': [{**row, 'href': routes[row['kind']] + str(row['id'])} for row in results]})
    except Exception:
        current_app.logger.error('Advisor search could not be completed')
        return error_response('Unable to search right now. Please try again.', 503)
