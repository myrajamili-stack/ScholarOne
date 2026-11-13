"""Add recurring breaks and student consultation details, preserving bookings."""
from contextlib import closing
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_db_connection

def migrate():
    with closing(get_db_connection()) as connection, connection:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            cursor.execute("ALTER TABLE advisor_schedule ADD COLUMN IF NOT EXISTS daily_breaks JSONB NOT NULL DEFAULT '[]'::jsonb")
            cursor.execute("ALTER TABLE appointment ADD COLUMN IF NOT EXISTS consultation_topic VARCHAR(100)")
            cursor.execute("ALTER TABLE appointment ADD COLUMN IF NOT EXISTS student_message VARCHAR(1000)")
    print('Schedule breaks and consultation details are ready.')

if __name__ == '__main__': migrate()
