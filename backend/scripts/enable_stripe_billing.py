"""Apply the additive Stripe Billing migration using the configured DATABASE_URL."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection

if __name__ == '__main__':
    sql = (Path(__file__).resolve().parents[1] / 'migrations/20261113_stripe_billing.sql').read_text()
    connection = get_db_connection()
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(sql)
    finally:
        connection.close()
    print('Stripe Billing schema is ready.')
