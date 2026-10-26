-- Enrol employee_holiday_policies in row-level security.
--
-- The table was added by 20260907140000_add_employee_holiday_policy with an organization_id and a
-- foreign key to organizations, but without RLS. Every other tenant-scoped table is enrolled and
-- forced, and `rls.integration.spec.ts` asserts that no tenant-scoped table is left out — it is
-- what caught this. Until now a role without BYPASSRLS could read or write another tenant's
-- holiday policy rows directly.
--
-- Idempotent so it is safe to re-run against a database where it has already been applied.

ALTER TABLE "employee_holiday_policies" ENABLE ROW LEVEL SECURITY;
-- FORCE so the table owner is subject to the policy too; without it the migration role and any
-- superuser-owned session would still see across tenants.
ALTER TABLE "employee_holiday_policies" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_employee_holiday_policies ON "employee_holiday_policies";
CREATE POLICY tenant_isolation_employee_holiday_policies ON "employee_holiday_policies"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  );
