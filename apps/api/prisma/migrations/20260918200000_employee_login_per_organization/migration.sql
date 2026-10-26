-- The same person may be an employee of several organizations, but only once in each. One login
-- per employee was enforced across the whole database, so onboarding someone who already worked
-- for another company on the platform failed at the last step.
DROP INDEX IF EXISTS "employees_user_id_key";
CREATE UNIQUE INDEX "employees_organization_id_user_id_key"
  ON "employees"("organization_id", "user_id") WHERE "user_id" IS NOT NULL;
