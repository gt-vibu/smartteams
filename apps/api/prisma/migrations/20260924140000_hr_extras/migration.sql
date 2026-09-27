-- Leave rules: the sandwich rule, encashment and comp-off.
ALTER TABLE "leave_types"
  ADD COLUMN "sandwich_off_days" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "encashable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "max_encash_days" DECIMAL(10,2),
  ADD COLUMN "is_comp_off" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "comp_off_expiry_days" SMALLINT;

-- Probation, confirmation and the organization's own employee fields.
ALTER TABLE "employees"
  ADD COLUMN "probation_ends_on" DATE,
  ADD COLUMN "confirmed_on" DATE,
  ADD COLUMN "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- Documents that stop being valid on a day.
ALTER TABLE "file_objects"
  ADD COLUMN "expires_on" DATE,
  ADD COLUMN "expiry_notified_at" TIMESTAMPTZ(6);
CREATE INDEX "file_objects_organization_id_expires_on_idx"
  ON "file_objects"("organization_id", "expires_on") WHERE "expires_on" IS NOT NULL;

-- Late check-ins.
ALTER TABLE "organization_settings"
  ADD COLUMN "late_grace_minutes" SMALLINT NOT NULL DEFAULT 15,
  ADD COLUMN "late_marks_per_half_day" SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE "comp_off_credits" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "leave_type_id" UUID NOT NULL,
  "work_date" DATE NOT NULL,
  "days" DECIMAL(4,1) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decided_by_user_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "decision_comment" TEXT,
  "expires_on" DATE,
  "lapsed_days" DECIMAL(4,1),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comp_off_credits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comp_off_credits_days" CHECK ("days" IN (0.5, 1))
);
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "comp_off_credits" ADD CONSTRAINT "comp_off_credits_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "comp_off_credits_organization_id_employee_id_work_date_key"
  ON "comp_off_credits"("organization_id", "employee_id", "work_date");
CREATE INDEX "comp_off_credits_organization_id_status_expires_on_idx"
  ON "comp_off_credits"("organization_id", "status", "expires_on");

CREATE TABLE "leave_encashments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "leave_type_id" UUID NOT NULL,
  "days" DECIMAL(6,1) NOT NULL,
  "amount" DECIMAL(14,2),
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decided_by_user_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "decision_comment" TEXT,
  "payroll_run_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_encashments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "leave_encashments_days" CHECK ("days" > 0)
);
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_encashments" ADD CONSTRAINT "leave_encashments_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "leave_encashments_organization_id_status_idx" ON "leave_encashments"("organization_id", "status");
CREATE INDEX "leave_encashments_organization_id_employee_id_idx" ON "leave_encashments"("organization_id", "employee_id");

CREATE TABLE "custom_field_definitions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "field_type" TEXT NOT NULL,
  "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "required" BOOLEAN NOT NULL DEFAULT false,
  "employee_editable" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "custom_field_definitions_type" CHECK ("field_type" IN ('TEXT', 'NUMBER', 'DATE', 'SELECT'))
);
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "custom_field_definitions_organization_id_key_key"
  ON "custom_field_definitions"("organization_id", "key");

ALTER TABLE "comp_off_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comp_off_credits" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_comp_off_credits ON "comp_off_credits"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE "leave_encashments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_encashments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_leave_encashments ON "leave_encashments"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE "custom_field_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_field_definitions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_custom_field_definitions ON "custom_field_definitions"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
