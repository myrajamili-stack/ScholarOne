"""Insert reviewed ALL-PDF financial aid, with no updates, deletes or schema changes.

Dry run (read-only): python -B backend/scripts/import_all_financial_aid.py
Import approved listings: python -B backend/scripts/import_all_financial_aid.py --apply --publish
An optional --report path records results without credentials or personal data.
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
DATASET = BACKEND / "data/financial_aid_all_import.json"


def normalize_title(title):
    return re.sub(r"[^a-z0-9]", "", title.lower())


def identities(record):
    meta = record.get("import_metadata") or {}
    return {normalize_title(value) for value in [record["title"], *meta.get("title_aliases", [])] if value}


def read_dataset(path=DATASET):
    dataset = json.loads(path.read_text(encoding="utf-8"))
    entries, keys, names = [], set(), set()
    for record in dataset["records"]:
        meta = record["import_metadata"]
        required = (record["title"], record["description"], record["eligibility_criteria"], meta["source_sponsor"])
        if not all(required): raise ValueError(f"Required listing fields are missing: {record['title']}")
        if meta["source_document_sha256"] != dataset["source_document_sha256"]: raise ValueError("Source hash mismatch")
        if meta["import_key"] in keys or identities(record) & names: raise ValueError("Overlapping import identities")
        keys.add(meta["import_key"]); names |= identities(record)
        entries.extend(meta["source_record_numbers"])
        if record["deadline"]: date.fromisoformat(record["deadline"])
        if record["amount"] is not None and record["amount"] <= 0: raise ValueError("Unknown funding must not be zero")
        for url in meta["source_urls"]:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.netloc or re.search(r"\s", url) or url.count("://") != 1:
                raise ValueError(f"Invalid source URL in {record['title']}")
    if sorted(entries) != list(range(1, dataset["source_entry_count"] + 1)): raise ValueError("Some source appearances are missing or accounted for twice")
    return dataset


def plan_import(records, existing):
    insert, skip = [], []
    exclusions_path = BACKEND / "data/financial_aid_exclusions.json"
    excluded = set(json.loads(exclusions_path.read_text(encoding="utf-8"))["excluded_import_keys"]) if exclusions_path.exists() else set()
    for record in records:
        key = record["import_metadata"]["import_key"]
        if key in excluded:
            skip.append({"title": record["title"], "scholarship_id": None, "reason": "Removed by user; excluded from reimports"})
            continue
        matches = [row for row in existing if identities(record) & identities(row) or key == (row.get("import_metadata") or {}).get("import_key")]
        if len(matches) > 1: raise ValueError(f"Ambiguous existing matches for {record['title']}; no writes performed")
        if matches:
            skip.append({"title": record["title"], "scholarship_id": matches[0]["scholarship_id"]})
        else: insert.append(record)
    return insert, skip


def run_import(dataset, apply=False, publish=False):
    from db import get_db_connection
    from psycopg2.extras import Json
    with closing(get_db_connection()) as connection:
        with connection:
            with connection.cursor() as cursor:
                if not apply: cursor.execute("SET TRANSACTION READ ONLY")
                else:
                    cursor.execute("SET LOCAL lock_timeout='10s'")
                    cursor.execute("SET LOCAL statement_timeout='30s'")
                    cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("scholarone:pdf-scholarship-import",))
                cursor.execute("SELECT scholarship_id,title,import_metadata,to_jsonb(s) AS original_row FROM scholarship s ORDER BY scholarship_id")
                existing = cursor.fetchall()
                insert, skip = plan_import(dataset["records"], existing)
                result = {"source_document": dataset["source_document"], "source_entries": dataset["source_entry_count"],
                          "reviewed_unique_listings": len(dataset["records"]), "previous_count": len(existing),
                          "inserted": [], "to_insert": [row["title"] for row in insert], "skipped": skip,
                          "aid_types_to_insert": dict(Counter(row["funding_type"] for row in insert)),
                          "database_changes": apply, "published": publish if apply else False}
                if not apply: return result
                cursor.execute("SELECT sponsor_id FROM sponsor WHERE lower(organization_name)=lower(%s)", ("ScholarOne",))
                curators = cursor.fetchall()
                if len(curators) != 1: raise ValueError("Exactly one existing ScholarOne curator is required; no accounts are created")
                for record in insert:
                    cursor.execute("""INSERT INTO scholarship
                        (sponsor_id,title,description,amount,category,eligibility_criteria,deadline,
                         funding_type,status,study_level,eligible_state,import_metadata)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING scholarship_id""", (
                            curators[0]["sponsor_id"], record["title"], record["description"], record["amount"],
                            record["category"], record["eligibility_criteria"], record["deadline"],
                            record["funding_type"], "approved" if publish else "pending", record["study_level"],
                            record["eligible_state"], Json(record["import_metadata"])))
                    result["inserted"].append({"title": record["title"], "scholarship_id": cursor.fetchone()["scholarship_id"]})
                cursor.execute("SELECT scholarship_id,title,import_metadata,to_jsonb(s) AS original_row FROM scholarship s ORDER BY scholarship_id")
                after = cursor.fetchall()
                originals = {row["scholarship_id"]: row["original_row"] for row in existing}
                if any(row["original_row"] != originals[row["scholarship_id"]] for row in after if row["scholarship_id"] in originals):
                    raise ValueError("An original record changed; rolling back")
                if len(after) != len(existing) + len(insert): raise ValueError("Unexpected listing count; rolling back")
                if plan_import(dataset["records"], after)[0]: raise ValueError("Import is incomplete; rolling back")
                result["final_count"] = len(after)
                result["original_records_unchanged"] = True
                return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    try:
        result = run_import(read_dataset(), args.apply, args.publish)
        if args.report: args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in result.items()}, ensure_ascii=True, indent=2))
    except Exception as error:
        print(f"Import failed ({type(error).__name__}); no partial changes committed.", file=sys.stderr)
        if isinstance(error, ValueError): print(str(error), file=sys.stderr)
        sys.exit(1)
