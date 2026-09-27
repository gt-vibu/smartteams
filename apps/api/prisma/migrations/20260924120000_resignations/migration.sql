-- Resignations: handed in, accepted with a last working day, then completed by off-boarding.
CREATE TYPE "ResignationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED');

CREATE TABLE "employee_resignations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "requested_last_day" DATE NOT NULL,
  "last_working_day" DATE,
  "status" "ResignationStatus" NOT NULL DEFAULT 'PENDING',
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMPTZ(6),
  "decided_by_user_id" UUID,
  "decision_comment" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "employee_resignations_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_resignations" ADD CONSTRAINT "employee_resignations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "employee_resignations_organization_id_status_last_working_day_idx"
  ON "employee_resignations"("organization_id", "status", "last_working_day");
CREATE INDEX "employee_resignations_organization_id_employee_id_idx"
  ON "employee_resignations"("organization_id", "employee_id");
-- At most one open resignation per person.
CREATE UNIQUE INDEX "employee_resignations_one_open"
  ON "employee_resignations"("organization_id", "employee_id")
  WHERE "status" IN ('PENDING', 'ACCEPTED');

ALTER TABLE "employee_resignations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_resignations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_resignations ON "employee_resignations"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
