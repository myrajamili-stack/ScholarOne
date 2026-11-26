"""Project source metadata without publishing the full raw PDF entry in API lists."""
from scholarship_availability import intake_status, scholarship_deadline


def enrich_scholarship(row, now=None):
    row = dict(row)
    status = intake_status(row, now)
    metadata = row.pop("import_metadata", None)
    if not metadata:
        return {**row, "intake_status": status} if row.get("deadline") is not None else row
    exact_deadline = None
    if metadata.get("deadline_at"):
        try:
            exact_date, instant = scholarship_deadline({**row, "import_metadata": metadata})
            row["deadline"] = exact_date.isoformat()
            exact_deadline = instant.isoformat()
        except (TypeError, ValueError, OverflowError):
            pass
    return {
        **row, "listed_by": row.get("organization_name"),
        "organization_name": metadata.get("source_sponsor") or row.get("organization_name"),
        "study_levels": metadata.get("study_levels", []),
        "eligible_states": metadata.get("eligible_states", []),
        "source_url": metadata.get("source_url"),
        "application_url": metadata.get("application_url"),
        "source_document": metadata.get("source_document"),
        "deadline_note": metadata.get("deadline_note"),
        "amount_note": metadata.get("amount_note"),
        "import_notes": metadata.get("import_notes", []),
        "external_listing": metadata.get("external_listing", True),
        "deadline_at": exact_deadline,
        "opening_date": metadata.get("opening_date"),
        "intake_status": status,
    }
