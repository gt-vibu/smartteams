CREATE TABLE "employee_personal_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "father_name" TEXT,
  "mother_name" TEXT,
  "spouse_name" TEXT,
  "aadhaar_number_encrypted" TEXT,
  "pan_number_encrypted" TEXT,
  "present_address" TEXT,
  "permanent_address" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_personal_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employee_personal_profiles_employee_id_key" ON "employee_personal_profiles"("employee_id");
CREATE INDEX "employee_personal_profiles_organization_id_idx" ON "employee_personal_profiles"("organization_id");
ALTER TABLE "employee_personal_profiles" ADD CONSTRAINT "employee_personal_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_personal_profiles" ADD CONSTRAINT "employee_personal_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_personal_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_personal_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_personal_profiles ON "employee_personal_profiles" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE TABLE "employee_bank_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "bank_name" TEXT,
  "account_number_encrypted" TEXT,
  "ifsc_code" TEXT,
  "account_holder_name" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT true,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_bank_accounts_organization_id_employee_id_effective_from_idx" ON "employee_bank_accounts"("organization_id", "employee_id", "effective_from");
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_bank_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_bank_accounts ON "employee_bank_accounts" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE TABLE "employee_references" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "relationship" TEXT,
  "phone" TEXT NOT NULL,
  "reference_type" TEXT NOT NULL DEFAULT 'FAMILY',
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_references_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_references_organization_id_employee_id_sort_order_idx" ON "employee_references"("organization_id", "employee_id", "sort_order");
ALTER TABLE "employee_references" ADD CONSTRAINT "employee_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_references" ADD CONSTRAINT "employee_references_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_references" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_references ON "employee_references" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "employee_bank_accounts"
  ADD CONSTRAINT "employee_bank_accounts_date_range_check"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

CREATE OR REPLACE FUNCTION enforce_sensitive_employee_organization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "employees"
    WHERE "id" = NEW."employee_id" AND "organization_id" = NEW."organization_id"
  ) THEN
    RAISE EXCEPTION 'sensitive employee reference crosses organizations' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_personal_profiles_same_organization
  BEFORE INSERT OR UPDATE ON "employee_personal_profiles"
  FOR EACH ROW EXECUTE FUNCTION enforce_sensitive_employee_organization();
CREATE TRIGGER employee_bank_accounts_same_organization
  BEFORE INSERT OR UPDATE ON "employee_bank_accounts"
  FOR EACH ROW EXECUTE FUNCTION enforce_sensitive_employee_organization();
CREATE TRIGGER employee_references_same_organization
  BEFORE INSERT OR UPDATE ON "employee_references"
  FOR EACH ROW EXECUTE FUNCTION enforce_sensitive_employee_organization();

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'employees.personal_details.read', 'Read employee personal details.'),
  (gen_random_uuid(), 'employees.personal_details.write', 'Write employee personal details.'),
  (gen_random_uuid(), 'employees.bank_details.read', 'Read employee bank details.'),
  (gen_random_uuid(), 'employees.bank_details.write', 'Write employee bank details.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "federation_scopes" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'employees.personal_details.read', 'Read employee personal details.'),
  (gen_random_uuid(), 'employees.personal_details.write', 'Write employee personal details.'),
  (gen_random_uuid(), 'employees.bank_details.read', 'Read employee bank details.'),
  (gen_random_uuid(), 'employees.bank_details.write', 'Write employee bank details.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" grant_row
JOIN "federation_grant_scopes" source_link ON source_link."grant_id" = grant_row."id"
JOIN "federation_scopes" source_scope ON source_scope."id" = source_link."scope_id"
JOIN "federation_scopes" target_scope ON target_scope."code" IN ('employees.personal_details.read', 'employees.bank_details.read')
WHERE grant_row."effect" = 'ALLOW' AND source_scope."code" = 'employees.read'
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" grant_row
JOIN "federation_grant_scopes" source_link ON source_link."grant_id" = grant_row."id"
JOIN "federation_scopes" source_scope ON source_scope."id" = source_link."scope_id"
JOIN "federation_scopes" target_scope ON target_scope."code" IN ('employees.personal_details.write', 'employees.bank_details.write')
WHERE grant_row."effect" = 'ALLOW' AND source_scope."code" = 'employees.write'
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
