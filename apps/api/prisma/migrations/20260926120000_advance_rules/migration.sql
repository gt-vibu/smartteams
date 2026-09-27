-- How much salary an employee may take in advance, and how quickly it is paid back.
-- advance_limit_percent: everything an employee has asked for or still owes, as a share of their
-- monthly gross salary. 0 turns advances off.
-- advance_recovery_months: the equal monthly instalments an approved advance is recovered in.
-- 1 recovers it all from the next pay, as before these settings existed.
ALTER TABLE organization_settings
  ADD COLUMN advance_limit_percent smallint NOT NULL DEFAULT 50
    CONSTRAINT organization_settings_advance_limit_check CHECK (advance_limit_percent BETWEEN 0 AND 100),
  ADD COLUMN advance_recovery_months smallint NOT NULL DEFAULT 1
    CONSTRAINT organization_settings_advance_recovery_check CHECK (advance_recovery_months BETWEEN 1 AND 24);
