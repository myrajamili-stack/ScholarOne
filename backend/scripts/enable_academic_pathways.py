r"""Explicit one-time setup: adds progression fields and missing source-linked routes.

Run from backend: .\.venv\Scripts\python.exe scripts\enable_academic_pathways.py
Existing pathways are not replaced. Schema and seed inserts share one transaction.
"""
from pathlib import Path
import sys
import json
from contextlib import closing
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection
from academic_pathways import validate_pathway
from pathway_seed import starter_pathways


def setup():
    records = [validate_pathway(record) for record in starter_pathways()]
    migration = Path(__file__).resolve().parents[1] / 'migrations' / '20261120_academic_pathways.sql'
    inserted = 0
    with closing(get_db_connection()) as connection, connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            cursor.execute("SET LOCAL statement_timeout = '30s'")
            cursor.execute(migration.read_text(encoding='utf-8'))
            for row in records:
                cursor.execute('select pathway_id from academic_pathway where lower(trim(title))=lower(%s)', (row['title'],))
                if cursor.fetchone(): continue
                cursor.execute('''insert into academic_pathway (title,description,field,level,status,guidance)
                    values (%s,%s,%s,%s,%s,%s::jsonb) on conflict do nothing''',
                    (row['title'],row['description'],row['field'],row['level'],row['status'],json.dumps(row['guidance'])))
                inserted += cursor.rowcount
    print(f'Academic pathway storage enabled; {inserted} new routes inserted. Existing routes were preserved.')


if __name__ == '__main__':
    try: setup()
    except Exception as error:
        print(f'Pathway setup failed ({type(error).__name__}); no changes committed.', file=sys.stderr)
        sys.exit(1)
