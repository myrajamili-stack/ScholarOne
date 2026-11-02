"""Create opt-in deadline reminders; does not change scholarships or favourites."""
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
                cursor.execute("""CREATE TABLE IF NOT EXISTS scholarship_reminder (
                    student_id BIGINT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
                    scholarship_id BIGINT NOT NULL REFERENCES scholarship(scholarship_id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (student_id, scholarship_id))""")
                cursor.execute("ALTER TABLE scholarship_reminder ENABLE ROW LEVEL SECURITY")
    print("Scholarship reminder preferences enabled. No scholarship deadlines or student preferences were changed.")


if __name__ == "__main__":
    try:
        migrate()
    except Exception as error:
        print(f"Migration failed ({type(error).__name__}); no changes committed.", file=sys.stderr)
        sys.exit(1)
