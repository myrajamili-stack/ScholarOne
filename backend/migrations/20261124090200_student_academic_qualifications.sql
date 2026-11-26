BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE student ADD COLUMN IF NOT EXISTS academic_qualifications jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(academic_qualifications) = 'object');

COMMIT;
