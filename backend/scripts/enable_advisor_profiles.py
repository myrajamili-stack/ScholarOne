"""Add editable professional details without inventing verification claims."""
from contextlib import closing
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection

def migrate():
    with closing(get_db_connection()) as connection, connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            for column, definition in [('institution', 'VARCHAR(150)'), ('professional_title', 'VARCHAR(100)'), ('bio', 'VARCHAR(300)')]:
                cursor.execute(f'ALTER TABLE advisor ADD COLUMN IF NOT EXISTS {column} {definition}')
    print('Advisor profile fields are ready.')

if __name__ == '__main__':
    migrate()
