-- Add optional holiday allowance to organization settings
ALTER TABLE "organization_settings"
  ADD COLUMN "optional_holiday_allowance" SMALLINT NOT NULL DEFAULT 0;

-- Create SelectionStatus enum
CREATE TYPE "SelectionStatus" AS ENUM ('CONFIRMED', 'PENDING', 'REJECTED', 'CANCELLED');

-- Create employee_holiday_selections table
CREATE TABLE "employee_holiday_selections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "holiday_id" UUID NOT NULL,
  "year" SMALLINT NOT NULL,
  "status" "SelectionStatus" NOT NULL DEFAULT 'CONFIRMED',
  "selected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_holiday_selections_pkey" PRIMARY KEY ("id")
);

-- Unique and indexing
CREATE UNIQUE INDEX "employee_holiday_selections_employee_id_holiday_id_key"
  ON "employee_holiday_selections"("employee_id", "holiday_id");

CREATE INDEX "employee_holiday_selections_organization_id_employee_id_year_idx"
  ON "employee_holiday_selections"("organization_id", "employee_id", "year");

CREATE INDEX "employee_holiday_selections_organization_id_holiday_id_status_idx"
  ON "employee_holiday_selections"("organization_id", "holiday_id", "status");

-- Foreign key constraints
ALTER TABLE "employee_holiday_selections"
  ADD CONSTRAINT "employee_holiday_selections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_holiday_selections_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_holiday_selections_holiday_id_fkey"
  FOREIGN KEY ("holiday_id") REFERENCES "holidays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant reference guards
CREATE OR REPLACE FUNCTION enforce_employee_holiday_selection_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  PERFORM assert_same_organization('holidays'::regclass, NEW.holiday_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_holiday_selections_same_organization_references
  BEFORE INSERT OR UPDATE ON "employee_holiday_selections"
  FOR EACH ROW EXECUTE FUNCTION enforce_employee_holiday_selection_organization();

-- Row level security
ALTER TABLE "employee_holiday_selections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_holiday_selections" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_employee_holiday_selections ON "employee_holiday_selections"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
