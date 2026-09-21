-- The kind of day a record's overtime fell on (WORKING_DAY, WEEKLY_OFF, HOLIDAY), so payroll can
-- pay weekly-off and holiday overtime at their own rates. Nullable: older records carry none.
ALTER TABLE "attendance_records" ADD COLUMN "overtime_day_type" TEXT;
