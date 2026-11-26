from contextlib import closing
from datetime import timedelta
from flask import Blueprint, jsonify, request, g
from psycopg2.errors import UniqueViolation
from db import get_db_connection
from security import student_access_required
from responses import error_response
from advisor_scheduling import malaysia_now
from appointment_workflows import appointment_notifications

appointment_actions_bp = Blueprint('appointment_actions', __name__, url_prefix='/api/appointments')


@appointment_actions_bp.route('/<int:appointment_id>/cancel', methods=['POST'])
@student_access_required
def cancel_appointment(appointment_id):
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('select advisor_id from appointment where appointment_id=%s and student_id=%s', (appointment_id,g.student_id))
                row = cursor.fetchone()
                if not row: return error_response('Appointment not found.', 404)
                advisor_id = row['advisor_id']
                cursor.execute('select user_id from app_user where user_id=%s for update', (advisor_id,))
                cursor.execute('select appointment_status,appointment_datetime from appointment where appointment_id=%s and student_id=%s for update', (appointment_id,g.student_id))
                appointment = cursor.fetchone()
                if not appointment: return error_response('Appointment not found.', 404)
                if appointment['appointment_status'] == 'cancelled': return jsonify(message='Appointment is already cancelled.')
                if appointment['appointment_status'] not in ('pending','confirmed') or not appointment['appointment_datetime'] or appointment['appointment_datetime'] <= malaysia_now():
                    return error_response('Only upcoming pending or confirmed appointments can be cancelled.', 409)
                cursor.execute("update appointment set appointment_status='cancelled' where appointment_id=%s and student_id=%s", (appointment_id,g.student_id))
                appointment_notifications(cursor, appointment_id, g.student_id, advisor_id, 'Cancelled by student', appointment['appointment_datetime'])
        return jsonify(message='Appointment cancelled. Your advisor has been notified.')
    except Exception:
        return error_response('Unable to cancel your appointment. No changes were saved.', 503)


@appointment_actions_bp.route('/<int:appointment_id>/review', methods=['GET','POST'])
@student_access_required
def appointment_review(appointment_id):
    data = request.get_json(silent=True) if request.method == 'POST' else None
    if request.method == 'POST':
        if not isinstance(data, dict) or set(data) - {'rating','comment'} or type(data.get('rating')) is not int or not 1 <= data['rating'] <= 5:
            return error_response('Choose a rating from 1 to 5.', 400)
        if not isinstance(data.get('comment', ''), str) or len(data.get('comment', '').strip()) > 2000:
            return error_response('Use at most 2000 characters for your review.', 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('''select advisor_id,appointment_status,appointment_datetime,duration_minutes from appointment
                    where appointment_id=%s and student_id=%s for update''', (appointment_id,g.student_id))
                appointment = cursor.fetchone()
                if not appointment: return error_response('Appointment not found.', 404)
                cursor.execute('select review_id,rating,comment,created_at from review where appointment_id=%s and student_id=%s', (appointment_id,g.student_id))
                existing = cursor.fetchone()
                if request.method == 'GET': return jsonify(review=existing)
                if existing: return error_response('You have already reviewed this appointment.', 409)
                if appointment['appointment_status'] != 'completed' or not appointment['appointment_datetime'] or appointment['appointment_datetime'] + timedelta(minutes=appointment['duration_minutes'] or 30) > malaysia_now():
                    return error_response('You can review only your own completed consultation after the session ends.', 409)
                cursor.execute('''insert into review (student_id,advisor_id,appointment_id,rating,comment)
                    values (%s,%s,%s,%s,%s) returning review_id,rating,comment,created_at''',
                    (g.student_id,appointment['advisor_id'],appointment_id,data['rating'],data.get('comment','').strip() or None))
                review = cursor.fetchone()
                cursor.execute("insert into notification (user_id,message,notification_type,is_read) values (%s,%s,'advisor_feedback',false)",
                               (appointment['advisor_id'],f'New student feedback was submitted for appointment #{appointment_id}.'))
        return jsonify(message='Your review was submitted.', review=review), 201
    except UniqueViolation:
        return error_response('You have already reviewed this appointment.', 409)
    except Exception:
        return error_response('Unable to submit your review. No changes were saved.', 503)
