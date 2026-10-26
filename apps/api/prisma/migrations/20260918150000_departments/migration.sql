-- Departments as records the organization defines, instead of free text typed on each employee.

CREATE TABLE "departments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "employee_number_prefix" TEXT,
  "next_employee_number" INTEGER NOT NULL DEFAULT 1,
  "head_employee_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "departments_next_employee_number_positive" CHECK ("next_employee_number" >= 1)
);
CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");
CREATE UNIQUE INDEX "departments_organization_id_employee_number_prefix_key" ON "departments"("organization_id", "employee_number_prefix");
ALTER TABLE "departments"
  ADD CONSTRAINT "departments_head_employee_id_fkey" FOREIGN KEY ("head_employee_id")
  REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "departments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_departments ON "departments" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "employees" ADD COLUMN "department_id" UUID;
ALTER TABLE "employees"
  ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id")
  REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "employees_organization_id_department_id_idx" ON "employees"("organization_id", "department_id");

-- Departments already typed on employment records become real ones, and each employee is linked to
-- the department on their current record, so nothing entered before is lost.
INSERT INTO "departments" ("id", "organization_id", "name", "updated_at")
SELECT gen_random_uuid(), names."organization_id", names."name", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "organization_id", btrim("department") AS "name"
  FROM "employee_employment_records"
  WHERE "department" IS NOT NULL AND btrim("department") <> ''
) AS names
ON CONFLICT ("organization_id", "name") DO NOTHING;

UPDATE "employees" AS e
SET "department_id" = d."id"
FROM (
  SELECT DISTINCT ON ("employee_id") "employee_id", "organization_id", btrim("department") AS "name"
  FROM "employee_employment_records"
  WHERE "department" IS NOT NULL AND btrim("department") <> ''
    AND "effective_from" <= CURRENT_DATE
  ORDER BY "employee_id", "effective_from" DESC
) AS current_record
JOIN "departments" AS d
  ON d."organization_id" = current_record."organization_id" AND d."name" = current_record."name"
WHERE e."id" = current_record."employee_id";
