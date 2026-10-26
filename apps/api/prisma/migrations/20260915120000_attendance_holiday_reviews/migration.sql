-- Reviews of a check-in on a granted optional holiday.
--
-- An employee with a CONFIRMED optional holiday can still check in that day — they may have been
-- asked to work. The day is then both a granted holiday and a worked day, and nothing in the
-- existing model says which it is. This table records the employee's explanation and the
-- manager's explicit decision: keep the holiday (the check-in stays as history but counts no
-- worked time) or convert the day to a working day (the selection is cancelled through the
-- existing cancellation, and attendance counts as normal).
--
-- It is a new table rather than a kind of attendance correction because a correction means "the
-- recorded times are wrong", its generic decision path rewrites the record, and federation lists
-- and decides pending corrections. None of that fits this decision, and the federation surface is
-- frozen. No federation code reads this table.

CREATE TYPE "HolidayReviewOutcome" AS ENUM ('KEEP_HOLIDAY', 'CONVERT_TO_WORKING_DAY');

CREATE TABLE "attendance_holiday_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "attendance_record_id" UUID NOT NULL,
  "holiday_id" UUID NOT NULL,
  "selection_id" UUID NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "outcome" "HolidayReviewOutcome",
  "reason" TEXT NOT NULL,
  "comment" TEXT,
  "requested_by_user_id" UUID,
  "decided_by_user_id" UUID,
  "decision_comment" TEXT,
  "decided_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "attendance_holiday_reviews_pkey" PRIMARY KEY ("id"),
  -- A decided review carries its outcome and who decided; a pending one carries neither.
  CONSTRAINT "attendance_holiday_reviews_decision_consistent" CHECK (
    ("status" = 'PENDING' AND "outcome" IS NULL AND "decided_at" IS NULL)
    OR ("status" = 'APPROVED' AND "outcome" IS NOT NULL AND "decided_at" IS NOT NULL)
    OR ("status" = 'CANCELLED' AND "outcome" IS NULL)
  )
);

-- At most one review awaiting a decision per day's record. This is what makes a duplicate or a
-- concurrent request fail in the database rather than only in the application.
CREATE UNIQUE INDEX "attendance_holiday_reviews_one_pending_per_record"
  ON "attendance_holiday_reviews"("attendance_record_id") WHERE "status" = 'PENDING';

CREATE INDEX "attendance_holiday_reviews_organization_id_status_created_at_idx"
  ON "attendance_holiday_reviews"("organization_id", "status", "created_at");

CREATE INDEX "attendance_holiday_reviews_organization_id_employee_id_idx"
  ON "attendance_holiday_reviews"("organization_id", "employee_id");

ALTER TABLE "attendance_holiday_reviews"
  ADD CONSTRAINT "attendance_holiday_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_attendance_record_id_fkey"
  FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_holiday_id_fkey"
  FOREIGN KEY ("holiday_id") REFERENCES "holidays"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_selection_id_fkey"
  FOREIGN KEY ("selection_id") REFERENCES "employee_holiday_selections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_holiday_reviews_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant reference guards: every referenced row must belong to the review's organization.
CREATE OR REPLACE FUNCTION enforce_attendance_holiday_review_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  PERFORM assert_same_organization('attendance_records'::regclass, NEW.attendance_record_id, NEW.organization_id);
  PERFORM assert_same_organization('holidays'::regclass, NEW.holiday_id, NEW.organization_id);
  PERFORM assert_same_organization('employee_holiday_selections'::regclass, NEW.selection_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_holiday_reviews_same_organization_references
  BEFORE INSERT OR UPDATE ON "attendance_holiday_reviews"
  FOR EACH ROW EXECUTE FUNCTION enforce_attendance_holiday_review_organization();

ALTER TABLE "attendance_holiday_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_holiday_reviews" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_attendance_holiday_reviews ON "attendance_holiday_reviews"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
