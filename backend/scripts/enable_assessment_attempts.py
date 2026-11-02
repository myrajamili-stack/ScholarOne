"""Add result persistence fields without altering existing quiz attempts."""
from contextlib import closing
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection


def migrate():
    with closing(get_db_connection()) as connection:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout = '10s'")
                cursor.execute("SET LOCAL statement_timeout = '30s'")
                cursor.execute("""ALTER TABLE quiz_attempt
                    ADD COLUMN IF NOT EXISTS assessment_answers JSONB,
                    ADD COLUMN IF NOT EXISTS assessment_result JSONB,
                    ADD COLUMN IF NOT EXISTS assessment_version INTEGER,
                    ADD COLUMN IF NOT EXISTS submission_id UUID""")
                cursor.execute("ALTER TABLE quiz_answer ADD COLUMN IF NOT EXISTS selected_rank SMALLINT")
                cursor.execute("""CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempt_submission_unique
                    ON quiz_attempt (student_id,quiz_id,submission_id) WHERE submission_id IS NOT NULL""")
    print("Assessment result persistence enabled. No student attempts were inserted or deleted.")


if __name__ == "__main__":
    try:
        migrate()
    except Exception as error:
        print(f"Migration failed ({type(error).__name__}); no changes committed.", file=sys.stderr)
        sys.exit(1)
