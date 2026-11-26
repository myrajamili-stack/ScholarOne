ALTER TABLE appointment ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE review ADD COLUMN IF NOT EXISTS appointment_id BIGINT REFERENCES appointment(appointment_id);
CREATE UNIQUE INDEX IF NOT EXISTS review_one_per_appointment ON review(appointment_id) WHERE appointment_id IS NOT NULL;
