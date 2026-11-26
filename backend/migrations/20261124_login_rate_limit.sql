BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS login_rate_limit (
    subject bytea PRIMARY KEY,
    window_start bigint NOT NULL,
    attempts integer NOT NULL
);
CREATE INDEX IF NOT EXISTS login_rate_limit_window_idx ON login_rate_limit(window_start);
ALTER TABLE login_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_rate_limit FROM PUBLIC;
REVOKE ALL (subject, window_start, attempts) ON login_rate_limit FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON login_rate_limit FROM anon;
        REVOKE ALL (subject, window_start, attempts) ON login_rate_limit FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON login_rate_limit FROM authenticated;
        REVOKE ALL (subject, window_start, attempts) ON login_rate_limit FROM authenticated;
    END IF;
END
$$;

COMMIT;
