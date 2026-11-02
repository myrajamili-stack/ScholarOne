"""Import the existing assessment without changing any existing quiz content.

Run from the repository root:
  backend/.venv/Scripts/python.exe -B backend/scripts/seed_career_assessment.py --dry-run
  backend/.venv/Scripts/python.exe -B backend/scripts/seed_career_assessment.py

Requires the project's installed Node.js (TypeScript stripping) and backend dependencies.
The transaction adds quiz.assessment_definition (JSONB), then stores the definition,
33 question records, and 156 options. Re-running unchanged data is a no-op.
"""

import argparse
from contextlib import closing
import hashlib
import json
from pathlib import Path
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

TITLE = "CAREER ASSESSMENT"
DESCRIPTION = (
    "A bilingual career assessment: 10 cognitive aptitude questions, 12 RIASEC "
    "interest items, 10 Big Five personality items, and three ranked work values."
)
INTEREST_SCALE = [
    "Strongly Dislike / Sangat Tidak Suka", "Dislike / Tidak Suka", "Neutral",
    "Like / Suka", "Strongly Like / Sangat Suka",
]
AGREEMENT_SCALE = [
    "Strongly Disagree / Sangat Tidak Setuju", "Disagree / Tidak Setuju", "Neutral",
    "Agree / Setuju", "Strongly Agree / Sangat Setuju",
]


def read_source():
    source = ROOT / "frontend/src/data/career-assessment.ts"
    result = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import {pathToFileURL} from 'node:url'; "
         "const m=await import(pathToFileURL(process.argv[1]).href); "
         "process.stdout.write(JSON.stringify(m.default));", str(source)],
        check=True, capture_output=True, encoding="utf-8", cwd=ROOT,
    )
    return json.loads(result.stdout)


def prepare_definition(data):
    if [len(data[key]) for key in ("aptitude", "riasec", "ocean", "values")] != [10, 12, 10, 6]:
        raise ValueError("Unexpected assessment question counts")
    if any(len(q["options"]) != 4 or q["correct"] not in range(4) for q in data["aptitude"]):
        raise ValueError("Invalid aptitude answer key")
    if any(sum(q["group"] == code for q in data["riasec"]) != 2 for code in "RIASEC"):
        raise ValueError("Expected two RIASEC questions per code")
    traits = ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Neuroticism"]
    if any(sum(q["group"] == trait for q in data["ocean"]) != 2 for trait in traits):
        raise ValueError("Expected two Big Five questions per trait")
    ids = [q["id"] for key in data for q in data[key]]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source identifiers")

    definition = {
        "key": "career-assessment", "version": 1, "title": TITLE,
        "data": data,
        "sections": [
            {"key": "aptitude", "title": "Cognitive Aptitude", "type": "multiple_choice"},
            {"key": "riasec", "title": "Vocational Interests", "type": "likert"},
            {"key": "ocean", "title": "Personality & Work Style", "type": "likert"},
            {"key": "values", "title": "Work Values & Motivation", "type": "ranking"},
        ],
        "scoring": {
            "aptitude": {"correct_points": 1, "incorrect_points": 0, "group_by": "domain",
                         "percentage": "correct / questions_in_domain * 100", "answer_index_base": 0},
            "riasec": {"scale": [1, 2, 3, 4, 5], "labels": INTEREST_SCALE,
                       "group_by": "group", "percentage": "sum / 10 * 100", "top_codes": 3,
                       "tie_order": list("RIASEC")},
            "ocean": {"scale": [1, 2, 3, 4, 5], "labels": AGREEMENT_SCALE,
                      "group_by": "group", "reverse": "6 - answer", "percentage": "adjusted_sum / 10 * 100"},
            "values": {"selection_count": 3, "unique": True, "rank_points": [3, 2, 1], "unselected_points": 0},
            "overall_score": None,
        },
    }
    canonical = json.dumps(definition, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    definition["source_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    questions = []
    for section in ("aptitude", "riasec", "ocean"):
        for question in data[section]:
            text = question["text"]
            if question.get("expression"):
                text += "\n" + question["expression"]
            options = question["options"] if section == "aptitude" else [
                f"{index + 1}. {label}" for index, label in enumerate(
                    INTEREST_SCALE if section == "riasec" else AGREEMENT_SCALE
                )
            ]
            questions.append({"source_id": question["id"], "text": text,
                              "type": "multiple_choice" if section == "aptitude" else "likert",
                              "options": options})
    questions.append({
        "source_id": "work-values-ranking",
        "text": "Pilih tiga faktor yang PALING PENTING bagi anda dalam kerjaya masa depan dan SUSUN MENGIKUT KEUTAMAAN.\n"
                "Select the three factors that are MOST IMPORTANT to you in your future career and RANK THEM IN ORDER OF IMPORTANCE.",
        "type": "ranking", "options": [value["label"] for value in data["values"]],
    })
    return definition, questions


def seed(definition, questions):
    from db import get_db_connection
    from psycopg2.extras import Json

    with closing(get_db_connection()) as connection:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '10s'")
                cursor.execute("SET LOCAL statement_timeout = '30s'")
                cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("scholarone:seed:career-assessment",))
                cursor.execute("ALTER TABLE quiz ADD COLUMN IF NOT EXISTS assessment_definition JSONB")
                cursor.execute("SELECT quiz_id, assessment_definition FROM quiz WHERE lower(title) = lower(%s) FOR UPDATE", (TITLE,))
                existing = cursor.fetchall()
                if existing:
                    if len(existing) != 1 or (existing[0]["assessment_definition"] or {}).get("source_sha256") != definition["source_sha256"]:
                        raise ValueError("Existing assessment differs; no content was overwritten. Create a deliberate new version instead.")
                    quiz_id = existing[0]["quiz_id"]
                    message = "Already imported; no changes"
                else:
                    # System assessment: do not attribute it to an advisor without instruction.
                    cursor.execute("INSERT INTO quiz (title, description, assessment_definition) VALUES (%s, %s, %s) RETURNING quiz_id",
                                   (TITLE, DESCRIPTION, Json(definition)))
                    quiz_id = cursor.fetchone()["quiz_id"]
                    mapping = {}
                    for question in questions:
                        cursor.execute("INSERT INTO quiz_question (quiz_id, question_text, question_type) VALUES (%s, %s, %s) RETURNING question_id",
                                       (quiz_id, question["text"], question["type"]))
                        question_id = cursor.fetchone()["question_id"]
                        option_ids = []
                        for option in question["options"]:
                            cursor.execute("INSERT INTO quiz_option (question_id, option_text) VALUES (%s, %s) RETURNING option_id", (question_id, option))
                            option_ids.append(cursor.fetchone()["option_id"])
                        mapping[question["source_id"]] = {"question_id": question_id, "option_ids": option_ids}
                    definition["database_ids"] = mapping
                    cursor.execute("UPDATE quiz SET assessment_definition = %s WHERE quiz_id = %s", (Json(definition), quiz_id))
                    message = "Imported"

                cursor.execute("SELECT count(DISTINCT qq.question_id) AS questions, count(qo.option_id) AS options FROM quiz_question qq LEFT JOIN quiz_option qo ON qo.question_id=qq.question_id WHERE qq.quiz_id=%s", (quiz_id,))
                counts = cursor.fetchone()
                if counts["questions"] != 33 or counts["options"] != 156:
                    raise ValueError("Stored counts differ; transaction rolled back")
        print(json.dumps({"status": message, "quiz_id": quiz_id, "title": TITLE, **counts}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Validate source without connecting to the database")
    args = parser.parse_args()
    definition, questions = prepare_definition(read_source())
    if args.dry_run:
        print(json.dumps({"title": TITLE, "questions": len(questions), "options": sum(len(q["options"]) for q in questions),
                          "version": definition["version"], "database_changes": False}))
    else:
        seed(definition, questions)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Database exceptions can include hostnames or connection details.
        print(f"Import failed ({type(error).__name__}). No partial database changes were committed.", file=sys.stderr)
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        sys.exit(1)
