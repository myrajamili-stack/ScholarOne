"""Add optional eligibility metadata without classifying existing listings."""
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
                cursor.execute("ALTER TABLE scholarship ADD COLUMN IF NOT EXISTS study_level TEXT, ADD COLUMN IF NOT EXISTS eligible_state TEXT")
    print("Study-level and state eligibility fields enabled. No existing listing values were changed.")


if __name__ == '__main__':
    try:
        migrate()
    except Exception as error:
        print(f"Migration failed ({type(error).__name__}); no changes committed.", file=sys.stderr)
        sys.exit(1)
