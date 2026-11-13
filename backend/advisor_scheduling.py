"""Shared schedule validation and variable-duration slots, in Malaysia local time."""
from datetime import date, datetime, timedelta
import re
from zoneinfo import ZoneInfo

DAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')
TIMEZONE = ZoneInfo('Asia/Kuala_Lumpur')
SLOT_MINUTES = 30
SESSION_LENGTHS = (15, 30, 45, 60, 90, 120)


def malaysia_now():
    return datetime.now(TIMEZONE).replace(tzinfo=None)


def empty_schedule():
    # Unpublished schedules must never advertise bookable hours.
    return {'availability': [dict(day=day, enabled=False, start_time='09:00', end_time='17:00') for day in DAYS],
            'blocked_dates': [], 'daily_breaks': [], 'published': False, 'timezone': 'Asia/Kuala_Lumpur', 'slot_minutes': SLOT_MINUTES}


def validate_schedule(data):
    if not isinstance(data, dict):
        raise ValueError('A schedule object is required.')
    slot_minutes = data.get('slot_minutes', SLOT_MINUTES)
    if type(slot_minutes) is not int or slot_minutes not in SESSION_LENGTHS:
        raise ValueError('Choose a session length of 15, 30, 45, 60, 90, or 120 minutes.')
    days = data.get('availability')
    if not isinstance(days, list) or len(days) != 7:
        raise ValueError('Provide availability for all seven days.')
    normalized = {}
    for day in days:
        if not isinstance(day, dict) or day.get('day') not in DAYS or day['day'] in normalized:
            raise ValueError('Each weekday must appear exactly once.')
        enabled = day.get('enabled')
        if type(enabled) is not bool:
            raise ValueError('Day availability must be enabled or disabled.')
        start, end = day.get('start_time', ''), day.get('end_time', '')
        for value in (start, end):
            if not isinstance(value, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value):
                raise ValueError('Use valid HH:MM start and end times for every day.')
        if enabled and (end <= start or datetime.strptime(end, '%H:%M') - datetime.strptime(start, '%H:%M') < timedelta(minutes=slot_minutes)):
            raise ValueError(f"{day['day']} must have at least {slot_minutes} minutes between start and end.")
        normalized[day['day']] = dict(day=day['day'], enabled=enabled, start_time=start, end_time=end)
    blocked = data.get('blocked_dates', [])
    if not isinstance(blocked, list) or len(blocked) > 366:
        raise ValueError('Provide at most 366 blocked dates.')
    result, seen = [], set()
    for item in blocked:
        if not isinstance(item, dict):
            raise ValueError('Invalid blocked date.')
        value, reason = item.get('date'), item.get('reason', '')
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError('Blocked dates must use YYYY-MM-DD.')
        date.fromisoformat(value)
        if value in seen:
            raise ValueError('Each blocked date must be unique.')
        if not isinstance(reason, str) or len(reason) > 200:
            raise ValueError('Blocked date reasons must be at most 200 characters.')
        seen.add(value)
        result.append(dict(date=value, reason=reason.strip()))
    breaks = data.get('daily_breaks', [])
    if not isinstance(breaks, list) or len(breaks) > 10:
        raise ValueError('Provide at most 10 daily breaks.')
    normalized_breaks = []
    for item in breaks:
        if not isinstance(item, dict):
            raise ValueError('Provide valid daily break times.')
        start, end = item.get('start_time'), item.get('end_time')
        if any(not isinstance(value, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', value) for value in (start, end)) or start >= end:
            raise ValueError('Each daily break must end after it starts (HH:MM).')
        if any(start < other['end_time'] and end > other['start_time'] for other in normalized_breaks):
            raise ValueError('Daily breaks must not overlap.')
        normalized_breaks.append(dict(start_time=start, end_time=end))
    return {'daily_breaks': sorted(normalized_breaks, key=lambda item: item['start_time']), 'slot_minutes': slot_minutes, 'availability': [normalized[day] for day in DAYS], 'blocked_dates': sorted(result, key=lambda item: item['date'])}


def read_schedule(cursor, advisor_id):
    cursor.execute('SELECT availability, blocked_dates, slot_minutes, daily_breaks FROM advisor_schedule WHERE advisor_id = %s', (advisor_id,))
    row = cursor.fetchone()
    return {**empty_schedule(), **(dict(row) if row else {}), 'published': row is not None}


def available_slots(schedule, selected_date, appointments, now=None):
    now = now or malaysia_now()
    if not schedule['published'] or selected_date < now.date():
        return []
    if any(item['date'] == selected_date.isoformat() for item in schedule['blocked_dates']):
        return []
    day = schedule['availability'][selected_date.weekday()]
    if not day['enabled']:
        return []
    start = datetime.combine(selected_date, datetime.strptime(day['start_time'], '%H:%M').time())
    end = datetime.combine(selected_date, datetime.strptime(day['end_time'], '%H:%M').time())
    duration = timedelta(minutes=schedule.get('slot_minutes', SLOT_MINUTES))
    busy = [(item['appointment_datetime'], timedelta(minutes=item.get('duration_minutes') or SLOT_MINUTES))
            for item in appointments if item['appointment_datetime'] and
            (item.get('appointment_status') or 'pending').lower() != 'cancelled']
    for item in schedule.get('daily_breaks', []):
        break_start = datetime.combine(selected_date, datetime.strptime(item['start_time'], '%H:%M').time())
        break_end = datetime.combine(selected_date, datetime.strptime(item['end_time'], '%H:%M').time())
        busy.append((break_start, break_end - break_start))
    slots = []
    while start + duration <= end:
        if start > now and not any(start < booked + booked_duration and start + duration > booked for booked, booked_duration in busy):
            slots.append(start.isoformat(timespec='minutes'))
        start += duration
    return slots
