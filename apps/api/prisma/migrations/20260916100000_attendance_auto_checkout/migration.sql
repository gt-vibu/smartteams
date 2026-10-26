-- Automatic close of a day the employee never checked out of.
--
-- The day stays unpaid: this writes no punch and changes no attendance record. It raises the
-- ordinary attendance correction the missing-check-out flow already approves, proposing the
-- organization's cutoff time, so a human decides what the day really was. Routing to that human is
-- the organization's existing ATTENDANCE_CORRECTION approval policy, so who reviews these is
-- configuration, not code.

CREATE TYPE "AutoCheckOutMode" AS ENUM ('DISABLED', 'REVIEW_REQUIRED');

ALTER TABLE "organization_settings"
  ADD COLUMN "auto_check_out_mode" "AutoCheckOutMode" NOT NULL DEFAULT 'DISABLED',
  -- The organization's own wall clock, not UTC: 23:59 means 23:59 where the employee works.
  ADD COLUMN "auto_check_out_at" TIME(6) NOT NULL DEFAULT '23:59';
