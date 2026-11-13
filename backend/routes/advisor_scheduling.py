from contextlib import closing
from datetime import date, datetime, timedelta

from flask import Blueprint, current_app, g, jsonify, request
from psycopg2.extras import Json

from advisor_scheduling import available_slots, malaysia_now, read_schedule, validate_schedule
from db import get_db_connection
from responses import error_response
from security import advisor_access_required, student_access_required

scheduling_bp = Blueprint('advisor_scheduling', __name__, url_prefix='/api/advisors')


def active_advisor(cursor, advisor_id, lock=False):
    cursor.execute("""SELECT user_id FROM app_user WHERE user_id = %s AND role = 'advisor'
        AND coalesce(status, 'active') = 'active'""" + (' FOR UPDATE' if lock else ''), (advisor_id,))
    return cursor.fetchone() is not None


def busy_appointments(cursor, advisor_id, selected_date, end_date=None):
    cursor.execute('''SELECT appointment_datetime, appointment_status, duration_minutes FROM appointment
        WHERE advisor_id = %s AND appointment_datetime >= %s AND appointment_datetime < %s''',
        (advisor_id, datetime.combine(selected_date, datetime.min.time()) - timedelta(minutes=120), end_date or selected_date + timedelta(days=1)))
    return cursor.fetchall()


def scheduling_error():
    current_app.logger.error('Advisor scheduling operation failed')
    return error_response('Scheduling is unavailable. Please try again or ask the administrator to run the advisor scheduling migration.', 503)


@scheduling_bp.route('/<int:advisor_id>/schedule', methods=['PUT'])
@advisor_access_required
def save_schedule(advisor_id):
    try:
        schedule = validate_schedule(request.get_json(silent=True))
    except ValueError as error:
        return error_response(str(error), 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id, lock=True):
                    return error_response('Advisor account not found.', 404)
                cursor.execute('''INSERT INTO advisor_schedule (advisor_id, availability, blocked_dates, slot_minutes, daily_breaks)
                    VALUES (%s, %s, %s, %s, %s) ON CONFLICT (advisor_id) DO UPDATE SET
                    availability = EXCLUDED.availability, blocked_dates = EXCLUDED.blocked_dates, slot_minutes = EXCLUDED.slot_minutes,
                    daily_breaks = EXCLUDED.daily_breaks, updated_at = CURRENT_TIMESTAMP''',
                    (advisor_id, Json(schedule['availability']), Json(schedule['blocked_dates']), schedule['slot_minutes'], Json(schedule['daily_breaks'])))
        return jsonify({**schedule, 'published': True, 'message': 'Schedule saved. Students can now see your availability.'})
    except Exception:
        return scheduling_error()


@scheduling_bp.route('/<int:advisor_id>/availability', methods=['GET'])
@student_access_required
def get_availability(advisor_id):
    now = malaysia_now()
    try:
        selected_date = date.fromisoformat(request.args.get('date', now.date().isoformat()))
    except ValueError:
        return error_response('Choose a valid date (YYYY-MM-DD).', 400)
    last_date = now.date() + timedelta(days=90)
    if not now.date() <= selected_date <= last_date:
        return error_response('Choose a date within the next 90 days.', 400)
    find_next = request.args.get('find_next') == 'true'
    requested_date = selected_date
    end_date = (last_date if find_next else selected_date) + timedelta(days=1)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id):
                    return error_response('Advisor account not found.', 404)
                schedule = read_schedule(cursor, advisor_id)
                appointments = busy_appointments(cursor, advisor_id, selected_date, end_date)
                # The student cannot attend simultaneous consultations either.
                cursor.execute('''SELECT appointment_datetime, appointment_status, duration_minutes FROM appointment
                    WHERE student_id = %s AND appointment_datetime >= %s AND appointment_datetime < %s''',
                    (g.student_id, datetime.combine(selected_date, datetime.min.time()) - timedelta(minutes=120), end_date))
                appointments += cursor.fetchall()
        slots = available_slots(schedule, selected_date, appointments, now)
        if find_next and schedule['published'] and any(day['enabled'] for day in schedule['availability']):
            while not slots and selected_date < last_date:
                selected_date += timedelta(days=1)
                slots = available_slots(schedule, selected_date, appointments, now)
        return jsonify({**schedule, 'date': selected_date.isoformat(),
                        'requested_date': requested_date.isoformat(), 'searched_next': find_next,
                        'slots': slots})
    except Exception:
        return scheduling_error()


@scheduling_bp.route('/my-appointments', methods=['GET'])
@student_access_required
def my_appointments():
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('''SELECT ap.appointment_id, ap.advisor_id, u.full_name AS advisor_name,
                    ap.appointment_datetime, ap.duration_minutes, coalesce(ap.appointment_status, 'pending') AS appointment_status
                    FROM appointment ap JOIN app_user u ON u.user_id = ap.advisor_id
                    WHERE ap.student_id = %s ORDER BY ap.appointment_datetime DESC''', (g.student_id,))
                appointments = cursor.fetchall()
                for appointment in appointments:
                    value = appointment['appointment_datetime']
                    appointment['appointment_datetime'] = value.isoformat() + '+08:00' if value else None
        return jsonify(appointments)
    except Exception:
        return scheduling_error()


@scheduling_bp.route('/<int:advisor_id>/appointments', methods=['POST'])
@student_access_required
def book_appointment(advisor_id):
    data = request.get_json(silent=True)
    try:
        value = data.get('appointment_datetime') if isinstance(data, dict) else None
        selected = datetime.fromisoformat(value)
        if selected.tzinfo is not None or selected.second or selected.microsecond:
            raise ValueError()
        if not malaysia_now().date() <= selected.date() <= malaysia_now().date() + timedelta(days=90):
            raise ValueError()
    except (TypeError, ValueError):
        return error_response('Choose a valid available consultation slot within the next 90 days.', 400)
    topic, message = data.get('consultation_topic', ''), data.get('student_message', '')
    if not isinstance(topic, str) or len(topic.strip()) > 100 or not isinstance(message, str) or len(message.strip()) > 1000:
        return error_response('Use at most 100 characters for the topic and 1000 for your message.', 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                # Shared row locks serialize bookings and schedule saves, including across server workers.
                if not active_advisor(cursor, advisor_id, lock=True):
                    return error_response('Advisor account not found.', 404)
                cursor.execute('''SELECT s.student_id FROM student s JOIN app_user u ON u.user_id = s.student_id
                    WHERE s.student_id = %s AND coalesce(u.status, 'active') = 'active' FOR UPDATE OF s''', (g.student_id,))
                if not cursor.fetchone():
                    return error_response('Student account not found.', 404)
                schedule = read_schedule(cursor, advisor_id)
                if 'slot_minutes' in data and (type(data['slot_minutes']) is not int or data['slot_minutes'] != schedule['slot_minutes']):
                    return error_response('The advisor changed the session length. Refresh availability and choose a new slot.', 409)
                appointments = busy_appointments(cursor, advisor_id, selected.date())
                cursor.execute('''SELECT appointment_datetime, appointment_status, duration_minutes FROM appointment
                    WHERE student_id = %s AND appointment_datetime >= %s AND appointment_datetime < %s''',
                    (g.student_id, datetime.combine(selected.date(), datetime.min.time()) - timedelta(minutes=120), selected.date() + timedelta(days=1)))
                appointments += cursor.fetchall()
                if selected.isoformat(timespec='minutes') not in available_slots(schedule, selected.date(), appointments):
                    return error_response('This slot is no longer available. Please choose another time.', 409)
                cursor.execute('''INSERT INTO appointment (student_id, advisor_id, appointment_datetime, appointment_status, duration_minutes, consultation_topic, student_message)
                    VALUES (%s, %s, %s, 'pending', %s, %s, %s) RETURNING appointment_id''', (g.student_id, advisor_id, selected, schedule['slot_minutes'], topic.strip(), message.strip()))
                appointment = cursor.fetchone()
        return jsonify({
            **appointment,
            'advisor_id': advisor_id,
            'appointment_datetime': selected.isoformat() + '+08:00',
            'appointment_status': 'pending',
            'duration_minutes': schedule['slot_minutes'],
            'message': 'Appointment requested. Waiting for advisor approval.',
        }), 201
    except Exception:
        return scheduling_error()


def reschedule_slots(cursor, advisor_id, appointment, selected_date):
    schedule = read_schedule(cursor, advisor_id)
    # Keep the booked duration even if the advisor has since changed session length.
    schedule['slot_minutes'] = appointment['duration_minutes'] or 30
    cursor.execute('''SELECT appointment_datetime, appointment_status, duration_minutes FROM appointment
        WHERE (advisor_id=%s OR student_id=%s) AND appointment_id<>%s
        AND appointment_datetime >= %s AND appointment_datetime < %s''',
        (advisor_id, appointment['student_id'], appointment['appointment_id'],
         datetime.combine(selected_date, datetime.min.time()) - timedelta(minutes=120), selected_date + timedelta(days=1)))
    return available_slots(schedule, selected_date, cursor.fetchall())


@scheduling_bp.route('/<int:advisor_id>/appointments/<int:appointment_id>/reschedule', methods=['GET', 'PATCH'])
@advisor_access_required
def reschedule_appointment(advisor_id, appointment_id):
    data = request.get_json(silent=True) if request.method == 'PATCH' else None
    try:
        if request.method == 'PATCH':
            selected = datetime.fromisoformat(data['appointment_datetime'])
            if selected.tzinfo or selected.second or selected.microsecond:
                raise ValueError()
            selected_date = selected.date()
        else:
            selected_date = date.fromisoformat(request.args.get('date', ''))
        if not malaysia_now().date() <= selected_date <= malaysia_now().date() + timedelta(days=90):
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        return error_response('Choose a valid date and available time within the next 90 days.', 400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor, advisor_id, lock=True):
                    return error_response('Advisor account not found.', 404)
                cursor.execute('''SELECT appointment_id, student_id, appointment_status, duration_minutes
                    FROM appointment WHERE appointment_id=%s AND advisor_id=%s FOR UPDATE''', (appointment_id, advisor_id))
                appointment = cursor.fetchone()
                if not appointment:
                    return error_response('Appointment not found.', 404)
                if (appointment['appointment_status'] or 'pending').lower() not in ('pending', 'confirmed'):
                    return error_response('Only pending or confirmed appointments can be rescheduled.', 409)
                cursor.execute('SELECT student_id FROM student WHERE student_id=%s FOR UPDATE', (appointment['student_id'],))
                slots = reschedule_slots(cursor, advisor_id, appointment, selected_date)
                if request.method == 'GET':
                    return jsonify(slots=slots, duration_minutes=appointment['duration_minutes'])
                if selected.isoformat(timespec='minutes') not in slots:
                    return error_response('This time is no longer available. Choose another slot.', 409)
                cursor.execute('UPDATE appointment SET appointment_datetime=%s WHERE appointment_id=%s AND advisor_id=%s',
                               (selected, appointment_id, advisor_id))
        return jsonify(message='Appointment rescheduled.', appointment_datetime=selected.isoformat()+'+08:00')
    except Exception:
        return scheduling_error()
