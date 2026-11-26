BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS platform_configuration (
    configuration_key text PRIMARY KEY,
    configuration_value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_configuration FROM PUBLIC;
REVOKE ALL (configuration_key, configuration_value, updated_at) ON platform_configuration FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON platform_configuration FROM anon;
        REVOKE ALL (configuration_key, configuration_value, updated_at) ON platform_configuration FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON platform_configuration FROM authenticated;
        REVOKE ALL (configuration_key, configuration_value, updated_at) ON platform_configuration FROM authenticated;
    END IF;
END
$$;

COMMIT;
