CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE');

ALTER TABLE "attendance_records"
  ADD COLUMN "day_status" "AttendanceDayStatus" NOT NULL DEFAULT 'PRESENT';

CREATE INDEX "attendance_records_organization_id_work_date_day_status_idx"
  ON "attendance_records" ("organization_id", "work_date", "day_status");
