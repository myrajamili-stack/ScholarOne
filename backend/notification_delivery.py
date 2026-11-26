"""In-app notifications saved in the same transaction as their business event."""
from contextlib import closing
from datetime import timedelta
import json

from flask import jsonify
from db import get_db_connection
from responses import error_response
from scholarship_availability import (
    PUBLISHED_SCHOLARSHIP, REMINDER_WINDOW_DAYS, intake_status, malaysia_now, scholarship_deadline,
)


def notify(cursor, user_id, message, kind, event_key=None):
    if user_id is None:
        return
    cursor.execute('''insert into notification (user_id,message,notification_type,is_read,event_key)
        values (%s,%s,%s,false,%s)
        on conflict (user_id,event_key) where event_key is not null do nothing''',
        (user_id,message,kind,event_key))


def notify_admins(cursor, message):
    cursor.execute('''insert into notification (user_id,message,notification_type,is_read)
        select user_id,%s,'scholarship_review',false from app_user where role='admin' and status='active' ''', (message,))


def deliver_due_reminders(cursor, student_id=None):
    now = malaysia_now()
    cursor.execute(f'''select r.student_id,s.scholarship_id,s.title,s.deadline::date as deadline,s.import_metadata
        from scholarship_reminder r join scholarship s on s.scholarship_id=r.scholarship_id
        join app_user u on u.user_id=r.student_id and u.role='student' and lower(u.status)='active'
        where (%s::bigint is null or r.student_id=%s)
          and {PUBLISHED_SCHOLARSHIP}
          and (s.deadline::date between %s and %s or nullif(s.import_metadata->>'deadline_at', '') is not null)
        for share of s, r''', (student_id, student_id, now.date(), now.date() + timedelta(days=REMINDER_WINDOW_DAYS)))
    rows = cursor.fetchall()
    # Recheck the clock after acquiring listing and reminder locks.
    now = malaysia_now()
    candidates = []
    for row in rows:
        if intake_status(row, now) != "dated":
            continue
        deadline, instant = scholarship_deadline(row)
        if not 0 <= (deadline - now.date()).days <= REMINDER_WINDOW_DAYS:
            continue
        cutoff = instant.isoformat() if instant else deadline.isoformat()
        display = instant.strftime("%Y-%m-%d at %H:%M:%S Malaysia time") if instant else cutoff
        candidates.append({
            "student_id": row["student_id"],
            "message": f'Deadline reminder: {row["title"]} closes on {display}.',
            "event_key": f'scholarship-deadline:{row["scholarship_id"]}:{cutoff}',
        })
    if not candidates:
        return 0

    cursor.execute('''insert into notification (user_id,message,notification_type,is_read,event_key)
        select student_id,message,'scholarship_deadline',false,event_key
        from jsonb_to_recordset(%s::jsonb) as due(student_id bigint,message text,event_key text)
        on conflict (user_id,event_key) where event_key is not null do nothing''', (json.dumps(candidates),))
    return cursor.rowcount


def change_application_status(application_id, status, remarks, *, actor_id, sponsor_id=None):
    """Serialize status decisions; retries of an unchanged decision do not notify twice."""
    try:
        with closing(get_db_connection()) as connection, connection:
            with connection.cursor() as cursor:
                cursor.execute('''select a.*,s.sponsor_id,s.title from application a
                    join scholarship s on s.scholarship_id=a.scholarship_id
                    where a.application_id=%s and (%s::bigint is null or s.sponsor_id=%s)
                    for update of a''', (application_id,sponsor_id,sponsor_id))
                previous = cursor.fetchone()
                if not previous:
                    return error_response('Application not found.', 404)
                cursor.execute('''update application set application_status=%s,remarks=coalesce(%s,remarks)
                    where application_id=%s returning application_id,student_id,scholarship_id,application_date,application_status,remarks''',
                    (status,remarks,application_id))
                application = cursor.fetchone()
                previous_status = previous.get('application_status') or 'pending'
                status_changed = previous_status != status
                remarks_changed = remarks is not None and previous.get('remarks') != remarks
                if status_changed or remarks_changed:
                    description = f"Application {application_id}: {previous_status} to {status}"
                    if remarks_changed:
                        description += " (remarks updated)"
                    cursor.execute("insert into audit_log (user_id, action, description) values (%s, %s, %s)",
                                   (actor_id, 'update_application_status', description))
                if status_changed:
                    message = f"Application #{application_id} for '{previous['title']}' is now {status}."
                    if remarks and remarks.strip(): message += ' Remarks: ' + remarks.strip()
                    notify(cursor,previous['student_id'],message,'application_status')
                    notify(cursor,previous['sponsor_id'],message,'application_status')
        return jsonify(message=f'Application marked as {status}.',application=application)
    except Exception:
        return error_response('Unable to update this application. No changes were saved. Please retry.', 503)
