from pathlib import Path
from contextlib import closing
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from db import get_db_connection

if __name__=='__main__':
    try:
        with closing(get_db_connection()) as connection,connection:
            with connection.cursor() as cursor:
                cursor.execute("set local lock_timeout='10s'")
                cursor.execute("set local statement_timeout='30s'")
                cursor.execute((Path(__file__).resolve().parents[1]/'migrations/20261120_admin_plans.sql').read_text())
        print('Plan creation and archival enabled. Existing plans, subscriptions and payments preserved.')
    except Exception as error: raise SystemExit(f'Setup failed ({type(error).__name__}); no changes committed.')
