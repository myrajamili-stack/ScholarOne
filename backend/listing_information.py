"""Map provider input to the existing student listing fields without schema changes."""
from datetime import date, datetime, time
from urllib.parse import urlsplit
import math
import re
from scholarship_filters import validate_filter_metadata
from scholarship_filters import STUDY_LEVELS, ELIGIBLE_STATES
from scholarship_availability import MALAYSIA, closing_instant, malaysia_now
from academic_results import validate_academic_requirements

DETAIL_SECTIONS = (
    ("residency_requirements", "Residency Requirements"),
    ("funding_details", "Funding Details"),
    ("application_method", "Application Method"),
    ("repayment_conditions", "Repayment Conditions"),
    ("additional_information", "Additional Information"),
)


def validate_listing_submission(data, *, retained_deadline_at=None, allow_missing_source=False):
    if not isinstance(data, dict):
        raise ValueError("Send listing information as a JSON object.")
    for key, limit in (("title", 200), ("description", 20000), ("category", 100), ("funding_type", 100), ("eligibility_criteria", 10000), ("source_url", 2000), ("study_level", 100)):
        value = data.get(key)
        if key == "source_url" and allow_missing_source and value in (None, ""):
            continue
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(f"Enter valid {key.replace('_', ' ')} (up to {limit} characters).")
    try:
        if isinstance(data.get("amount"), bool):
            raise ValueError()
        amount = float(data.get("amount"))
    except (ValueError, TypeError):
        raise ValueError("Enter a valid funding amount.") from None
    if not math.isfinite(amount) or amount < 0:
        raise ValueError("Funding amount must be a finite number of 0 or more.")
    for key, maximum in (("minimum_cgpa", 4), ("maximum_income", float('inf'))):
        value = data.get(key)
        if value not in (None, ""):
            try:
                numeric = float(value)
                if isinstance(value, bool) or not math.isfinite(numeric) or not 0 <= numeric <= maximum:
                    raise ValueError()
            except (TypeError, ValueError):
                raise ValueError(f"Enter valid {key.replace('_', ' ')}.") from None
    filters = validate_filter_metadata(data)
    metadata, description, deadline = prepare_listing_information(data, retained_deadline_at=retained_deadline_at)
    return amount, filters, metadata, description, deadline


def prepare_listing_information(data, *, retained_deadline_at=None):
    metadata = {"external_listing": False}
    rules = {}
    for field in ('minimum_cgpa', 'maximum_income'):
        value = data.get(field)
        if value not in (None, ''):
            try:
                numeric = float(value)
                if isinstance(value, bool) or not math.isfinite(numeric) or numeric < 0 or (field == 'minimum_cgpa' and numeric > 4):
                    raise ValueError()
            except (TypeError, ValueError):
                raise ValueError(f'Enter valid {field.replace("_", " ")}.') from None
            rules[field] = numeric
        else:
            rules[field] = None
    if data.get('income_period') not in (None, '', 'monthly', 'annual'):
        raise ValueError('Select monthly or annual household income.')
    rules['income_period'] = data.get('income_period') or None
    if "academic_requirements" in data:
        rules["academic_requirements"] = validate_academic_requirements(data["academic_requirements"])
    metadata['eligibility_rules'] = rules
    for key, limit in (("amount_note", 5000), ("deadline_note", 2000), ("residency_requirements", 3000),
                       ("funding_details", 5000), ("application_method", 5000), ("repayment_conditions", 5000), ("additional_information", 5000)):
        value = data.get(key) or ""
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError(f"Enter valid {key.replace('_', ' ')} (up to {limit} characters).")
        metadata[key] = value.strip()
    for key in ("source_url", "application_url"):
        value = data.get(key) or ""
        if not isinstance(value, str):
            raise ValueError("Enter a valid official source or application URL.")
        value = value.strip()
        if value:
            try:
                url = urlsplit(value)
                valid = url.scheme in {"http", "https"} and url.hostname and not url.username and not url.password and not any(c.isspace() for c in value) and len(value) <= 2000
                _ = url.port
            except ValueError:
                valid = False
            if not valid:
                raise ValueError("Enter a valid http:// or https:// official source or application URL.")
        metadata[key] = value
    for plural, single, allowed in (("study_levels", "study_level", STUDY_LEVELS), ("eligible_states", "eligible_state", ELIGIBLE_STATES)):
        values = data.get(plural, [data[single]] if data.get(single) else [])
        if not isinstance(values, list) or any(not isinstance(value, str) or value not in allowed for value in values):
            raise ValueError(f"Select valid {plural.replace('_', ' ')}.")
        metadata[plural] = list(dict.fromkeys(values))
    status = data.get("deadline_status", "dated")
    if status not in ("dated", "open", "closed", "unconfirmed"):
        raise ValueError("Select a valid deadline status.")
    deadline = data.get("deadline") or None
    now = malaysia_now()
    if status == "dated" and not deadline:
        raise ValueError("Enter an application deadline or select another deadline status.")
    if deadline:
        try:
            parsed = date.fromisoformat(deadline)
        except (ValueError, TypeError):
            raise ValueError("Enter a valid application deadline.") from None
        if parsed < now.date() and status != "closed":
            raise ValueError("Past deadlines must be marked Closed.")
    deadline_time = data.get("deadline_time")
    cutoff = None
    if deadline_time not in (None, ""):
        try:
            if not deadline or not isinstance(deadline_time, str) or not re.fullmatch(r"[0-9]{2}:[0-9]{2}(?::[0-9]{2})?", deadline_time):
                raise ValueError()
            closing_time = time.fromisoformat(deadline_time)
        except (TypeError, ValueError):
            raise ValueError("Enter a valid Malaysia closing time and date.") from None
        cutoff = datetime.combine(parsed, closing_time, MALAYSIA)
    elif retained_deadline_at:
        try:
            cutoff = closing_instant(retained_deadline_at)
        except (TypeError, ValueError, OverflowError):
            raise ValueError("Set a valid Malaysia closing time or clear the old closing time.") from None
    if cutoff is not None:
        if status != "closed" and cutoff <= now:
            raise ValueError("The Malaysia closing time has passed. Choose a future time or mark the listing Closed.")
        metadata["deadline_at"] = cutoff.isoformat()
    if "opening_date" in data:
        opening_date = data["opening_date"]
        if opening_date in (None, ""):
            metadata["opening_date"] = None
        else:
            try:
                opening = date.fromisoformat(opening_date)
                if opening.isoformat() != opening_date:
                    raise ValueError()
            except (TypeError, ValueError):
                raise ValueError("Enter a valid application opening date.") from None
            closing_date = cutoff.date() if cutoff else parsed if deadline else None
            if closing_date and opening > closing_date:
                raise ValueError("Application opening date cannot be after the closing date.")
            metadata["opening_date"] = opening.isoformat()
    metadata["declared_closed"] = status == "closed"
    metadata["declared_open"] = status == "open"
    if status == "open":
        metadata["deadline_note"] = "Open. " + metadata["deadline_note"].removeprefix("Open. ")
    elif status == "unconfirmed" and not metadata["deadline_note"]:
        metadata["deadline_note"] = "No Official Information"
    description = data.get("description")
    if not isinstance(description, str) or not description.strip():
        raise ValueError("Enter a scholarship description.")
    sections = [description.strip()]
    for key, heading in DETAIL_SECTIONS:
        if metadata[key]:
            sections.append(f"{heading}:\n{metadata.pop(key)}")
        else:
            metadata.pop(key)
    if metadata["source_url"]:
        sections.append("Official Source: " + metadata["source_url"])
    if metadata["application_url"]:
        sections.append("Application Portal: " + metadata["application_url"])
    return metadata, "\n\n".join(sections), deadline
