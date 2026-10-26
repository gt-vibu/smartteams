-- A request left waiting is followed up: its approvers are reminded, then administrators told.
ALTER TABLE "organization_settings"
  ADD COLUMN "approval_reminder_days" SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN "approval_escalation_days" SMALLINT NOT NULL DEFAULT 5;
