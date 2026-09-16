CREATE TABLE "payroll_calendars" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "year" SMALLINT NOT NULL,
  "month" SMALLINT NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "attendance_freeze_date" DATE,
  "calculation_date" DATE,
  "release_date" DATE,
  "salary_credit_date" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_calendars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_calendars_organization_id_year_month_key"
  ON "payroll_calendars" ("organization_id", "year", "month");
CREATE INDEX "payroll_calendars_organization_id_period_start_period_end_idx"
  ON "payroll_calendars" ("organization_id", "period_start", "period_end");

ALTER TABLE "payroll_calendars"
  ADD CONSTRAINT "payroll_calendars_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_calendars"
  ADD CONSTRAINT "payroll_calendars_month_check" CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "payroll_calendars_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "payroll_calendars_period_check" CHECK ("period_end" >= "period_start"),
  ADD CONSTRAINT "payroll_calendars_dates_check" CHECK (
    ("attendance_freeze_date" IS NULL OR "attendance_freeze_date" <= "period_end") AND
    ("calculation_date" IS NULL OR "calculation_date" >= "period_start") AND
    ("release_date" IS NULL OR "release_date" >= "period_start") AND
    ("salary_credit_date" IS NULL OR "salary_credit_date" >= "period_start")
  );

ALTER TABLE "payroll_calendars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_calendars" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payroll_calendars
  ON "payroll_calendars"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
