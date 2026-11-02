"""Project source metadata without publishing the full raw PDF entry in API lists."""
from datetime import datetime, timedelta, timezone


def enrich_scholarship(row, now=None):
    row = dict(row)
    metadata = row.pop("import_metadata", None)
    if not metadata:
        return row
    now = now or datetime.now(timezone(timedelta(hours=8)))
    deadline = row.get("deadline")
    if isinstance(deadline, datetime): deadline = deadline.date()
    if isinstance(deadline, str): deadline = datetime.fromisoformat(deadline).date()
    closed = metadata.get("declared_closed", False) or (deadline is not None and deadline < now.date())
    if metadata.get("deadline_at"):
        closed = closed or datetime.fromisoformat(metadata["deadline_at"]) < now
    return {
        **row, "listed_by": row.get("organization_name"),
        "organization_name": metadata.get("source_sponsor") or row.get("organization_name"),
        "study_levels": metadata.get("study_levels", []),
        "eligible_states": metadata.get("eligible_states", []),
        "source_url": metadata.get("source_url"),
        "source_document": metadata.get("source_document"),
        "deadline_note": metadata.get("deadline_note"),
        "amount_note": metadata.get("amount_note"),
        "import_notes": metadata.get("import_notes", []),
        "external_listing": True,
        "intake_status": "closed" if closed else "dated" if deadline else "unconfirmed",
    }
