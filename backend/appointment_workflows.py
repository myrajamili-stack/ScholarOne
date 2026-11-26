"""Transactional appointment notifications and state-transition validation."""
from datetime import timedelta


def appointment_notifications(cursor, appointment_id, student_id, advisor_id, event, when=None):
    suffix = f' Time: {when:%d %b %Y, %H:%M} Malaysia time.' if when else ''
    message = f'Appointment #{appointment_id}: {event}.{suffix}'
    cursor.execute("""insert into notification (user_id,message,notification_type,is_read)
        values (%s,%s,'appointment',false),(%s,%s,'appointment',false)""", (student_id,message,advisor_id,message))


def validate_transition(current, requested, reason, now):
    previous = (current.get('appointment_status') or 'pending').lower()
    allowed = {'pending': {'confirmed','rejected','cancelled'}, 'confirmed': {'completed','cancelled'}}
    if requested == previous:
        return None
    if requested not in allowed.get(previous, set()):
        return 'This appointment cannot transition to that status.'
    if requested == 'rejected' and (not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 1000):
        return 'Provide a rejection reason of 1–1000 characters.'
    if requested == 'completed':
        start = current.get('appointment_datetime')
        if not start or start + timedelta(minutes=current.get('duration_minutes') or 30) > now:
            return 'An appointment can only be completed after its scheduled session ends.'
    return None
