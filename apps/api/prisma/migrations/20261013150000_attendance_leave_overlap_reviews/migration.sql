CREATE TABLE "attendance_leave_overlap_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "leave_units" DECIMAL(4,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "requested_by_user_id" UUID,
    "decided_by_user_id" UUID,
    "decision_comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "attendance_leave_overlap_reviews_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_attendance_record_id_fkey"
  FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_leave_overlap_reviews"
  ADD CONSTRAINT "attendance_leave_overlap_reviews_leave_request_id_fkey"
  FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "attendance_leave_overlap_reviews_attendance_record_id_leave_request_id_key"
  ON "attendance_leave_overlap_reviews"("attendance_record_id", "leave_request_id");
CREATE INDEX "attendance_leave_overlap_reviews_organization_id_status_created_at_idx"
  ON "attendance_leave_overlap_reviews"("organization_id", "status", "created_at");
CREATE INDEX "attendance_leave_overlap_reviews_organization_id_employee_id_work_date_idx"
  ON "attendance_leave_overlap_reviews"("organization_id", "employee_id", "work_date");