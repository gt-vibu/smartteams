-- Migration: add employee_holiday_policies
-- Adds per-employee optional holiday policy overrides.
-- allowance_override NULL means "use org-wide default".
-- restricted_holiday_ids empty array means "full org/branch pool".

CREATE TABLE IF NOT EXISTS "employee_holiday_policies" (
  "id"                     UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        UUID         NOT NULL,
  "employee_id"            UUID         NOT NULL,
  "allowance_override"     SMALLINT,
  "restricted_holiday_ids" UUID[]       NOT NULL DEFAULT '{}',
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "employee_holiday_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_holiday_policies_employee_id_key" UNIQUE ("employee_id"),
  CONSTRAINT "employee_holiday_policies_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_holiday_policies_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "employee_holiday_policies_organization_id_idx"
  ON "employee_holiday_policies" ("organization_id");
