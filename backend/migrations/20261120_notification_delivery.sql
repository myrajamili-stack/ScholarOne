ALTER TABLE notification ADD COLUMN IF NOT EXISTS event_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS notification_unique_event ON notification(user_id,event_key) WHERE event_key IS NOT NULL;
