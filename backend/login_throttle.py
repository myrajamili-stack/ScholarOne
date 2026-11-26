from math import ceil
from threading import Lock
from time import monotonic

from db import get_db_connection


class LoginThrottle:
    """Limit valid login submissions by client address within each process."""

    def __init__(self, limit=10, window_seconds=60, max_clients=10000):
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_clients = max_clients
        self.counts = {}
        self.window_ends_at = 0
        self.lock = Lock()

    def retry_after(self, address):
        with self.lock:
            now = monotonic()
            if now >= self.window_ends_at:
                self.counts.clear()
                self.window_ends_at = now + self.window_seconds

            count = self.counts.get(address, 0)
            if count >= self.limit or (count == 0 and len(self.counts) >= self.max_clients):
                return ceil(self.window_ends_at - now)
            self.counts[address] = count + 1
            return 0
from contextlib import closing
from hmac import digest


class PostgresLoginThrottle:
    """Share the login limit across backend workers without storing raw IP addresses."""

    def __init__(self, signing_key, limit=10, window_seconds=60):
        self.key = signing_key.encode()
        self.limit = limit
        self.window_seconds = window_seconds

    def retry_after(self, address):
        subject = digest(self.key, f"login-ip:{address}".encode(), "sha256")
        with closing(get_db_connection()) as connection, connection, connection.cursor() as cursor:
            cursor.execute("""
                delete from login_rate_limit
                where window_start < extract(epoch from statement_timestamp())::bigint - %s
            """, (2 * self.window_seconds,))
            cursor.execute("""
                with timing as (
                    select floor(extract(epoch from statement_timestamp()) / %s)::bigint * %s as window_start,
                           floor(extract(epoch from statement_timestamp()))::bigint as now_seconds
                ), reserved as (
                    insert into login_rate_limit (subject, window_start, attempts)
                    select %s, window_start, 1 from timing
                    on conflict (subject) do update set
                        window_start = excluded.window_start,
                        attempts = case when login_rate_limit.window_start < excluded.window_start then 1
                                        else login_rate_limit.attempts + 1 end
                    where login_rate_limit.window_start < excluded.window_start
                       or (login_rate_limit.window_start = excluded.window_start and login_rate_limit.attempts < %s)
                    returning subject
                )
                select case when exists(select 1 from reserved) then 0
                            else greatest(1, window_start + %s - now_seconds) end as retry_after
                from timing
            """, (self.window_seconds, self.window_seconds, subject, self.limit, self.window_seconds))
            return cursor.fetchone()["retry_after"]
