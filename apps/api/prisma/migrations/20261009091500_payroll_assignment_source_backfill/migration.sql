ALTER TABLE "employee_payroll_policies"
  ALTER COLUMN "assignment_source" SET DEFAULT 'ORGANIZATION_DEFAULT';

UPDATE "employee_payroll_policies"
SET "assignment_source" = CASE
  WHEN "payroll_policy_id" IS NULL THEN 'ORGANIZATION_DEFAULT'
  ELSE 'INDIVIDUAL_OVERRIDE'
END;
