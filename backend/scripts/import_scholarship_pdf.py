"""Import the reviewed PDF dataset, preserving source notes and avoiding duplicates.

python -B backend/scripts/import_scholarship_pdf.py --dry-run
python -B backend/scripts/import_scholarship_pdf.py --publish

The reviewed dataset preserves 49 PDF entries in 48 listings (two overlapping
LZNK entries are combined with both source versions retained). The existing
ScholarOne provider is the curator; source sponsor names remain distinct.
No accounts are created, and existing scholarship records are never updated.
"""
import argparse
from collections import Counter
from contextlib import closing
from datetime import date
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
DATASET = BACKEND / "data/scholarship_pdf_import.json"


def normalize_title(title):
    return re.sub(r"[^a-z0-9]", "", title.lower())


def read_dataset(path=DATASET):
    dataset = json.loads(path.read_text(encoding="utf-8"))
    records = dataset["records"]
    keys, titles, entries = set(), set(), []
    for record in records:
        metadata = record["import_metadata"]
        key, title = metadata["import_key"], normalize_title(record["title"])
        if key in keys or title in titles:
            raise ValueError("Duplicate listing in reviewed dataset")
        keys.add(key)
        titles.add(title)
        entries.extend(metadata["source_record_numbers"])
        if not record["description"] or not record["eligibility_criteria"] or not metadata["source_sponsor"]:
            raise ValueError("A source description, sponsor or eligibility is missing")
        if metadata["source_document_sha256"] != dataset["source_document_sha256"]:
            raise ValueError("Source provenance differs between records")
        if record["deadline"]:
            date.fromisoformat(record["deadline"])
        if record["amount"] is not None and record["amount"] <= 0:
            raise ValueError("Unknown funding must be NULL, not zero")
        for url in metadata["source_urls"]:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc or url.count("://") != 1:
                raise ValueError("Malformed source URL")
    if len(records) != 48 or sorted(entries) != list(range(1, dataset["source_entry_count"] + 1)):
        raise ValueError("Not all PDF entries are accounted for")
    return dataset


def import_records(dataset, publish=False):
    from db import get_db_connection
    from psycopg2.extras import Json

    inserted, skipped = [], []
    with closing(get_db_connection()) as connection:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout='10s'")
                cursor.execute("SET LOCAL statement_timeout='30s'")
                cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("scholarone:pdf-scholarship-import",))
                cursor.execute("ALTER TABLE scholarship ADD COLUMN IF NOT EXISTS import_metadata JSONB")
                cursor.execute("""CREATE UNIQUE INDEX IF NOT EXISTS scholarship_pdf_import_key_unique
                    ON scholarship ((import_metadata->>'import_key')) WHERE import_metadata IS NOT NULL""")
                cursor.execute("SELECT sponsor_id FROM sponsor WHERE lower(organization_name)=lower(%s)", ("ScholarOne",))
                curators = cursor.fetchall()
                if len(curators) != 1:
                    raise ValueError("Exactly one existing ScholarOne curator provider is required; no accounts were created")
                curator_id = curators[0]["sponsor_id"]
                for record in dataset["records"]:
                    metadata = record["import_metadata"]
                    cursor.execute("""SELECT scholarship_id FROM scholarship
                        WHERE import_metadata->>'import_key'=%s
                        OR regexp_replace(lower(title),'[^a-z0-9]','','g')=%s LIMIT 1""",
                                   (metadata["import_key"], normalize_title(record["title"])))
                    existing = cursor.fetchone()
                    if existing:
                        skipped.append({"title": record["title"], "scholarship_id": existing["scholarship_id"]})
                        continue
                    cursor.execute("""INSERT INTO scholarship
                        (sponsor_id,title,description,amount,category,eligibility_criteria,deadline,
                         funding_type,status,study_level,eligible_state,import_metadata)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING scholarship_id""", (
                            curator_id, record["title"], record["description"], record["amount"],
                            record["category"], record["eligibility_criteria"], record["deadline"],
                            record["funding_type"], "approved" if publish else "pending",
                            record["study_level"], record["eligible_state"], Json(metadata),
                        ))
                    inserted.append({"title": record["title"], "scholarship_id": cursor.fetchone()["scholarship_id"]})
                for record in dataset["records"]:
                    cursor.execute("""SELECT count(*) AS count FROM scholarship
                        WHERE import_metadata->>'import_key'=%s
                        OR regexp_replace(lower(title),'[^a-z0-9]','','g')=%s""",
                                   (record["import_metadata"]["import_key"], normalize_title(record["title"])))
                    if cursor.fetchone()["count"] < 1:
                        raise ValueError("An expected listing is missing; rolling back import")
    return {"inserted": inserted, "skipped": skipped, "published": publish}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--publish", action="store_true", help="Publish immediately (requires explicit user instruction)")
    args = parser.parse_args()
    dataset = read_dataset()
    if args.dry_run:
        print(json.dumps({"source_entries": dataset["source_entry_count"], "unique_listings": len(dataset["records"]),
                          "aid_types": dict(Counter(record["funding_type"] for record in dataset["records"])),
                          "missing_deadlines": sum(record["deadline"] is None for record in dataset["records"]),
                          "database_changes": False}))
    else:
        result = import_records(dataset, args.publish)
        print(json.dumps({"inserted": len(result["inserted"]), "skipped": len(result["skipped"]), "published": result["published"]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Import failed ({type(error).__name__}); no partial changes committed.", file=sys.stderr)
        if isinstance(error, ValueError): print(str(error), file=sys.stderr)
        sys.exit(1)
