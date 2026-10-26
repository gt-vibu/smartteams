ALTER TABLE "organizations"
ADD COLUMN "employee_number_sequence" INTEGER NOT NULL DEFAULT 0;

-- Start after existing numbered employees; UUID-based legacy identifiers are excluded.
UPDATE "organizations" AS org
SET "employee_number_sequence" = COALESCE((
  SELECT MAX((substring(emp."employee_number" FROM '-([0-9]{1,9})$'))::INTEGER)
  FROM "employees" AS emp
  WHERE emp."organization_id" = org."id"
    AND emp."employee_number" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*-[0-9]{1,9}$'
), 0);

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_employee_number_sequence_check"
CHECK ("employee_number_sequence" >= 0);
