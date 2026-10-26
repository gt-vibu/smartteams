-- Apply the tenant boundary used by the other attendance review tables.
ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_decision_consistent" CHECK (
    "leave_units" > 0
    AND (
      ("status" = 'PENDING' AND "decided_at" IS NULL AND "decided_by_user_id" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL)
    )
  );

ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_leave_overlap_reviews_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_attendance_leave_overlap_review_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  PERFORM assert_same_organization('attendance_records'::regclass, NEW.attendance_record_id, NEW.organization_id);
  PERFORM assert_same_organization('leave_requests'::regclass, NEW.leave_request_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_leave_overlap_reviews_same_organization_references
  BEFORE INSERT OR UPDATE ON "attendance_leave_overlap_reviews"
  FOR EACH ROW EXECUTE FUNCTION enforce_attendance_leave_overlap_review_organization();

ALTER TABLE "attendance_leave_overlap_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_leave_overlap_reviews" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_attendance_leave_overlap_reviews ON "attendance_leave_overlap_reviews"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
