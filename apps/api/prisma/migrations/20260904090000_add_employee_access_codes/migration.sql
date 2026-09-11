-- One-time codes that let an employee activate their own login.
--
-- Only the digest of a code is stored, so a database read cannot recover a usable credential.
-- Every other column exists to bound what the code can do: which tenant, which employee, which
-- roles, until when, and whether it has already been spent or withdrawn.
CREATE TABLE "employee_access_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "role_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "created_by_user_id" UUID NOT NULL,
  "activated_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "activated_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_access_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_access_codes_code_hash_key"
  ON "employee_access_codes"("code_hash");
CREATE INDEX "employee_access_codes_organization_id_employee_id_idx"
  ON "employee_access_codes"("organization_id", "employee_id");
CREATE INDEX "employee_access_codes_organization_id_expires_at_idx"
  ON "employee_access_codes"("organization_id", "expires_at");

-- At most one code may be outstanding for an employee at a time. Issuing a new one has to
-- withdraw the previous one first, so an employee never holds two working codes and revoking
-- "the" code is unambiguous.
CREATE UNIQUE INDEX "employee_access_codes_one_pending_per_employee"
  ON "employee_access_codes"("employee_id")
  WHERE "activated_at" IS NULL AND "revoked_at" IS NULL;

ALTER TABLE "employee_access_codes"
  ADD CONSTRAINT "employee_access_codes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_access_codes_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_access_codes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_access_codes_activated_by_user_id_fkey"
  FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A code must not be able to point at an employee in another tenant: that would let it grant
-- roles across the tenant boundary at activation time.
CREATE OR REPLACE FUNCTION enforce_employee_access_code_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_access_codes_same_organization_references
  BEFORE INSERT OR UPDATE ON "employee_access_codes"
  FOR EACH ROW EXECUTE FUNCTION enforce_employee_access_code_organization();

ALTER TABLE "employee_access_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_access_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_access_codes ON "employee_access_codes"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
