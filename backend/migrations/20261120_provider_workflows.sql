ALTER TABLE app_user ADD COLUMN IF NOT EXISTS provider_rejection_reason TEXT;
ALTER TABLE scholarship ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE TABLE IF NOT EXISTS scholarship_view (
    scholarship_id BIGINT NOT NULL REFERENCES scholarship(scholarship_id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES student(student_id) ON DELETE CASCADE,
    viewed_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,
    PRIMARY KEY (scholarship_id,student_id,viewed_on)
);
ALTER TABLE scholarship_view ENABLE ROW LEVEL SECURITY;
