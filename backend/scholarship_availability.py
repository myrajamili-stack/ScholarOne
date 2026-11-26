from datetime import date, datetime, timedelta, timezone


MALAYSIA = timezone(timedelta(hours=8))
REMINDER_WINDOW_DAYS = 3
PUBLISHED_SCHOLARSHIP = "lower(s.status) in ('approved', 'active')"
HAS_SCHOLARSHIP_DEADLINE = "(s.deadline is not null or nullif(s.import_metadata->>'deadline_at', '') is not null)"


def malaysia_now():
    return datetime.now(MALAYSIA)


def closing_instant(value):
    instant = datetime.fromisoformat(value)
    return instant.replace(tzinfo=MALAYSIA) if instant.tzinfo is None else instant.astimezone(MALAYSIA)


def scholarship_deadline(row):
    exact = (row.get("import_metadata") or {}).get("deadline_at")
    if exact:
        instant = closing_instant(exact)
        return instant.date(), instant
    deadline = row.get("deadline")
    if isinstance(deadline, datetime):
        deadline = deadline.date()
    elif isinstance(deadline, str):
        deadline = date.fromisoformat(deadline[:10])
    return deadline, None


def intake_status(row, now=None, today=None):
    metadata = row.get("import_metadata") or {}
    now = now or malaysia_now()
    now = now.replace(tzinfo=MALAYSIA) if now.tzinfo is None else now.astimezone(MALAYSIA)
    today = today or now.date()
    if metadata.get("declared_closed"):
        return "closed"
    try:
        deadline, instant = scholarship_deadline(row)
    except (TypeError, ValueError, OverflowError):
        return "closed"
    if instant:
        return "closed" if now >= instant else "dated"
    if deadline:
        return "closed" if deadline < today else "dated"
    return "open" if metadata.get("declared_open") else "unconfirmed"
