"""Advisor-scoped guided students and consultations booked on their behalf."""
from contextlib import closing
from datetime import date, datetime, timedelta
from flask import Blueprint, jsonify, request, current_app
from advisor_scheduling import read_schedule, available_slots, malaysia_now
from db import get_db_connection
from responses import error_response
from security import advisor_access_required
from .advisor_scheduling import active_advisor, busy_appointments

students_management_bp=Blueprint('advisor_students_management',__name__,url_prefix='/api/advisors')

@students_management_bp.route('/<int:advisor_id>/students',methods=['GET'])
@advisor_access_required
def guided_students(advisor_id):
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor,advisor_id):
                    return error_response('Advisor account not found.',404)
                cursor.execute('''WITH guided AS (
                    SELECT student_id,count(*) AS appointment_count,
                    count(*) FILTER(WHERE lower(coalesce(appointment_status,'pending')) IN ('pending','confirmed')) AS active_count,
                    count(*) FILTER(WHERE lower(coalesce(appointment_status,'pending'))='completed') AS completed_count,
                    max(appointment_datetime) AS latest_appointment
                    FROM appointment WHERE advisor_id=%s AND student_id IS NOT NULL GROUP BY student_id)
                    SELECT s.student_id,u.full_name,u.email,u.phone_number,u.profile_picture,
                    coalesce(u.status,'active') AS account_status,s.education_level,s.cgpa,s.field_of_study,s.university,
                    g.appointment_count,g.active_count,g.completed_count,g.latest_appointment,
                    latest.appointment_id AS latest_id,latest.appointment_datetime AS latest_datetime,
                    latest.appointment_status AS latest_status,latest.duration_minutes AS latest_duration,
                    latest.consultation_topic AS latest_topic
                    FROM guided g JOIN student s ON s.student_id=g.student_id JOIN app_user u ON u.user_id=s.student_id
                    LEFT JOIN LATERAL (SELECT appointment_id,appointment_datetime,appointment_status,duration_minutes,consultation_topic
                        FROM appointment WHERE advisor_id=%s AND student_id=s.student_id
                        ORDER BY appointment_datetime DESC NULLS LAST,appointment_id DESC LIMIT 1) latest ON true
                    ORDER BY g.latest_appointment DESC NULLS LAST,u.full_name,s.student_id''',(advisor_id,advisor_id))
                students=[dict(row) for row in cursor.fetchall()]
                for student in students:
                    value=student['latest_appointment'];student['latest_appointment']=value.isoformat()+'+08:00' if value else None
                    value=student.pop('latest_datetime')
                    student['latest_consultation']={'appointment_id':student.pop('latest_id'),
                        'appointment_datetime':value.isoformat()+'+08:00' if value else None,
                        'appointment_status':(student.pop('latest_status') or 'pending').lower(),
                        'duration_minutes':student.pop('latest_duration') or 30,
                        'consultation_topic':student.pop('latest_topic') or ''}
                cursor.execute('''SELECT coalesce((SELECT round(avg(rating),1) FROM review WHERE advisor_id=%s),
                    (SELECT average_rating FROM advisor WHERE advisor_id=%s),0) AS average_rating,
                    (SELECT count(*) FROM review WHERE advisor_id=%s) AS review_count''',(advisor_id,advisor_id,advisor_id))
                ratings=dict(cursor.fetchone())
        return jsonify(students=students,summary={'total_guided':len(students),
            'active_consultations':sum(row['active_count'] for row in students),
            'completed_consultations':sum(row['completed_count'] for row in students),**ratings})
    except Exception:
        current_app.logger.exception('Unable to load guided students')
        return error_response('Unable to load your students. Please try again.',503)


@students_management_bp.route('/<int:advisor_id>/students/<int:student_id>/consultations',methods=['GET','POST'])
@advisor_access_required
def student_consultations(advisor_id,student_id):
    data=request.get_json(silent=True) if request.method=='POST' else {}
    try:
        if request.method=='POST':
            selected=datetime.fromisoformat(data['appointment_datetime'])
            if selected.tzinfo or selected.second or selected.microsecond:raise ValueError()
            selected_date=selected.date()
        else:selected_date=date.fromisoformat(request.args.get('date',''))
        if not malaysia_now().date()<=selected_date<=malaysia_now().date()+timedelta(days=90):raise ValueError()
    except (ValueError,TypeError,KeyError):
        return error_response('Choose a valid date and available time within the next 90 days.',400)
    topic=data.get('consultation_topic','') if isinstance(data,dict) else ''
    if not isinstance(topic,str) or len(topic.strip())>100:
        return error_response('Use at most 100 characters for the consultation topic.',400)
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                if not active_advisor(cursor,advisor_id,lock=True):return error_response('Advisor account not found.',404)
                cursor.execute('''SELECT s.student_id,coalesce(u.status,'active') AS status FROM student s
                    JOIN app_user u ON u.user_id=s.student_id AND u.role='student'
                    WHERE s.student_id=%s AND EXISTS(SELECT 1 FROM appointment WHERE advisor_id=%s AND student_id=s.student_id)
                    FOR UPDATE OF s''',(student_id,advisor_id))
                student=cursor.fetchone()
                if not student:return error_response('Student is not under your guidance.',404)
                if student['status']!='active':return error_response('This student account is inactive.',409)
                schedule=read_schedule(cursor,advisor_id)
                busy=busy_appointments(cursor,advisor_id,selected_date)
                cursor.execute('''SELECT appointment_datetime,appointment_status,duration_minutes FROM appointment
                    WHERE student_id=%s AND appointment_datetime>=%s AND appointment_datetime<%s''',
                    (student_id,datetime.combine(selected_date,datetime.min.time())-timedelta(minutes=120),selected_date+timedelta(days=1)))
                slots=available_slots(schedule,selected_date,busy+cursor.fetchall())
                if request.method=='GET':return jsonify(slots=slots,slot_minutes=schedule['slot_minutes'],published=schedule['published'])
                if data.get('slot_minutes')!=schedule['slot_minutes'] or type(data.get('slot_minutes')) is not int:
                    return error_response('The session length changed. Refresh available times.',409)
                if selected.isoformat(timespec='minutes') not in slots:
                    return error_response('This time is no longer available. Choose another slot.',409)
                cursor.execute('''INSERT INTO appointment(student_id,advisor_id,appointment_datetime,appointment_status,duration_minutes,consultation_topic)
                    VALUES(%s,%s,%s,'confirmed',%s,%s) RETURNING appointment_id''',
                    (student_id,advisor_id,selected,schedule['slot_minutes'],topic.strip()))
                appointment_id=cursor.fetchone()['appointment_id']
        return jsonify(appointment_id=appointment_id,appointment_status='confirmed',appointment_datetime=selected.isoformat()+'+08:00',message='Consultation scheduled and visible to the student.'),201
    except Exception:
        current_app.logger.exception('Unable to schedule student consultation')
        return error_response('Unable to schedule this consultation. Please try again.',503)
