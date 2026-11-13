"""Add publication state and safe editor revisions to existing quizzes."""
from contextlib import closing
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection


def migrate():
    with closing(get_db_connection()) as connection, connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            cursor.execute("""ALTER TABLE quiz ADD COLUMN IF NOT EXISTS status VARCHAR(20)
                NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published'))""")
            cursor.execute('ALTER TABLE quiz ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1')
            cursor.execute('ALTER TABLE quiz ADD COLUMN IF NOT EXISTS creation_id UUID')
            cursor.execute('''CREATE UNIQUE INDEX IF NOT EXISTS quiz_advisor_creation_unique
                ON quiz(advisor_id, creation_id) WHERE creation_id IS NOT NULL''')
    print('Quiz draft publishing and editor revisions are ready.')


if __name__ == '__main__':
    migrate()
