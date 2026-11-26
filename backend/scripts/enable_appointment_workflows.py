"""Add appointment rejection reasons and per-appointment review references."""
from pathlib import Path
import sys
from contextlib import closing
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection


def setup():
    migration = Path(__file__).resolve().parents[1] / 'migrations' / '20261120_appointment_workflows.sql'
    with closing(get_db_connection()) as connection, connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='10s'")
            cursor.execute("SET LOCAL statement_timeout='30s'")
            cursor.execute(migration.read_text(encoding='utf-8'))
    print('Appointment rejection and review storage enabled. Existing appointments and reviews were preserved.')


if __name__ == '__main__':
    try: setup()
    except Exception as error:
        print(f'Setup failed ({type(error).__name__}); no changes committed.', file=sys.stderr)
        sys.exit(1)
