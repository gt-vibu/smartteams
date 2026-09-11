CREATE TYPE "ComplianceRecordStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

CREATE TABLE "employee_statutory_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "scheme_code" TEXT NOT NULL,
  "registration_number" TEXT,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "employee_rate" DECIMAL(8,4),
  "employer_rate" DECIMAL(8,4),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_statutory_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_statutory_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "scheme_code" TEXT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" "ComplianceRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "employee_amount" DECIMAL(14,2),
  "employer_amount" DECIMAL(14,2),
  "due_date" DATE,
  "submitted_at" TIMESTAMPTZ(6),
  "filing_reference" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "employee_statutory_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_statutory_profiles_org_employee_scheme_from_key"
  ON "employee_statutory_profiles" ("organization_id", "employee_id", "scheme_code", "effective_from");
CREATE UNIQUE INDEX "employee_statutory_records_org_employee_scheme_period_key"
  ON "employee_statutory_records" ("organization_id", "employee_id", "scheme_code", "period_start", "period_end");
CREATE INDEX "employee_statutory_records_org_scheme_period_status_idx"
  ON "employee_statutory_records" ("organization_id", "scheme_code", "period_start", "status");

ALTER TABLE "employee_statutory_profiles"
  ADD CONSTRAINT "employee_statutory_profiles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_statutory_profiles"
  ADD CONSTRAINT "employee_statutory_profiles_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_statutory_records"
  ADD CONSTRAINT "employee_statutory_records_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_statutory_records"
  ADD CONSTRAINT "employee_statutory_records_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_statutory_profiles"
  ADD CONSTRAINT "employee_statutory_profiles_date_range_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  ADD CONSTRAINT "employee_statutory_profiles_rates_check"
  CHECK (("employee_rate" IS NULL OR "employee_rate" >= 0) AND ("employer_rate" IS NULL OR "employer_rate" >= 0));

ALTER TABLE "employee_statutory_records"
  ADD CONSTRAINT "employee_statutory_records_date_range_check"
  CHECK ("period_end" >= "period_start"),
  ADD CONSTRAINT "employee_statutory_records_amounts_check"
  CHECK (("employee_amount" IS NULL OR "employee_amount" >= 0) AND ("employer_amount" IS NULL OR "employer_amount" >= 0)),
  ADD CONSTRAINT "employee_statutory_records_submitted_at_check"
  CHECK ("status" NOT IN ('SUBMITTED', 'ACCEPTED') OR "submitted_at" IS NOT NULL),
  ADD CONSTRAINT "employee_statutory_records_filing_reference_check"
  CHECK ("status" NOT IN ('SUBMITTED', 'ACCEPTED') OR NULLIF(BTRIM("filing_reference"), '') IS NOT NULL);

CREATE OR REPLACE FUNCTION enforce_statutory_employee_organization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "employees"
    WHERE "id" = NEW."employee_id" AND "organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'statutory employee reference crosses organizations' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER statutory_profiles_same_organization
  BEFORE INSERT OR UPDATE ON "employee_statutory_profiles"
  FOR EACH ROW EXECUTE FUNCTION enforce_statutory_employee_organization();
CREATE TRIGGER statutory_records_same_organization
  BEFORE INSERT OR UPDATE ON "employee_statutory_records"
  FOR EACH ROW EXECUTE FUNCTION enforce_statutory_employee_organization();

ALTER TABLE "employee_statutory_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_statutory_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_statutory_profiles
  ON "employee_statutory_profiles"
  USING (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );

ALTER TABLE "employee_statutory_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_statutory_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_statutory_records
  ON "employee_statutory_records"
  USING (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
