"""Deliver in-app reminders without a running web server or student session.

Run --once from an external scheduler, or --watch as a supervised worker.
"""
import argparse
from pathlib import Path
import signal
import sys
import time
from contextlib import closing
from datetime import datetime, timezone
from threading import Event
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from db import get_db_connection
from notification_delivery import deliver_due_reminders


def deliver_once(connect=get_db_connection, pause=time.sleep):
    for attempt in range(3):
        try:
            with closing(connect()) as connection, connection:
                with connection.cursor() as cursor:
                    cursor.execute("set local statement_timeout = '30s'; set local lock_timeout = '5s'")
                    cursor.execute("select pg_try_advisory_xact_lock(hashtext('scholarone:scheduled-reminders')) as acquired")
                    if not cursor.fetchone()["acquired"]:
                        return None
                    count = deliver_due_reminders(cursor)
            return count
        except Exception:
            if attempt == 2: raise RuntimeError('Reminder delivery failed after three attempts; retry the scheduled job.') from None
            pause(2 ** attempt)


def run_cycle(deliver=deliver_once):
    try:
        count = deliver()
        status = 'overlap_skipped' if count is None else 'success'
        detail = '' if count is None else f' delivered={count}'
    except RuntimeError:
        status = 'failure'
        detail = ' attempts=3'
    timestamp = datetime.now(timezone.utc).isoformat(timespec='seconds')
    print(f'{timestamp} scholarship_reminders {status}{detail}',
          file=sys.stderr if status == 'failure' else sys.stdout, flush=True)
    return status != 'failure'


def run_worker(stop, interval_seconds=300, deliver=deliver_once):
    while not stop.is_set():
        run_cycle(deliver)
        if stop.wait(interval_seconds):
            break


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--once", action="store_true")
    mode.add_argument("--watch", action="store_true")
    parser.add_argument("--interval-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.interval_seconds < 1:
        parser.error("--interval-seconds must be at least 1")
    if args.once:
        if not run_cycle():
            raise SystemExit(1)
        return

    stop = Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: stop.set())
    run_worker(stop, args.interval_seconds)


if __name__ == "__main__":
    main()
