ALTER TABLE leave_requests ADD COLUMN session text NOT NULL DEFAULT 'FULL_DAY', ADD COLUMN cancellation jsonb;
ALTER TABLE leave_requests ADD CONSTRAINT leave_session_valid CHECK (session IN ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF'));
ALTER TABLE users ADD COLUMN notification_delivery text NOT NULL DEFAULT 'IMMEDIATE';
ALTER TABLE users ADD CONSTRAINT notification_delivery_valid CHECK (notification_delivery IN ('IMMEDIATE', 'DAILY_DIGEST'));
