-- Every file gets an explicit audience instead of "its employee, or everyone with files.read.all".

CREATE TYPE "FileAccessScope" AS ENUM ('PERSONAL', 'EMPLOYEE', 'TEAM', 'ORGANIZATION', 'INTERNAL');
CREATE TYPE "FileShareGrantee" AS ENUM ('USER', 'ROLE', 'TEAM');

ALTER TABLE "file_objects"
  ADD COLUMN "access_scope" "FileAccessScope" NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN "team_id" UUID,
  ADD COLUMN "allow_download" BOOLEAN NOT NULL DEFAULT true;

-- Existing files keep exactly the audience they had: a file about an employee stays with that
-- employee and HR; a file about nobody (payroll exports, imports) stays with file administrators.
UPDATE "file_objects" SET "access_scope" = 'INTERNAL' WHERE "employee_id" IS NULL;

ALTER TABLE "file_objects"
  ADD CONSTRAINT "file_objects_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "file_objects_organization_id_access_scope_idx" ON "file_objects"("organization_id", "access_scope");
CREATE INDEX "file_objects_organization_id_team_id_idx" ON "file_objects"("organization_id", "team_id");

CREATE TABLE "file_shares" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "file_object_id" UUID NOT NULL,
  "grantee_type" "FileShareGrantee" NOT NULL,
  "grantee_user_id" UUID,
  "grantee_role_id" UUID,
  "grantee_team_id" UUID,
  "can_download" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMPTZ(6),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "file_shares_pkey" PRIMARY KEY ("id"),
  -- Exactly the grantee column its type names.
  CONSTRAINT "file_shares_one_grantee" CHECK (
    ("grantee_type" = 'USER' AND "grantee_user_id" IS NOT NULL AND "grantee_role_id" IS NULL AND "grantee_team_id" IS NULL) OR
    ("grantee_type" = 'ROLE' AND "grantee_role_id" IS NOT NULL AND "grantee_user_id" IS NULL AND "grantee_team_id" IS NULL) OR
    ("grantee_type" = 'TEAM' AND "grantee_team_id" IS NOT NULL AND "grantee_user_id" IS NULL AND "grantee_role_id" IS NULL)
  )
);
ALTER TABLE "file_shares"
  ADD CONSTRAINT "file_shares_file_object_id_fkey" FOREIGN KEY ("file_object_id")
  REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "file_shares_organization_id_file_object_id_idx" ON "file_shares"("organization_id", "file_object_id");
CREATE INDEX "file_shares_organization_id_grantee_user_id_idx" ON "file_shares"("organization_id", "grantee_user_id");
CREATE INDEX "file_shares_organization_id_grantee_role_id_idx" ON "file_shares"("organization_id", "grantee_role_id");
CREATE INDEX "file_shares_organization_id_grantee_team_id_idx" ON "file_shares"("organization_id", "grantee_team_id");

ALTER TABLE "file_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_shares" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_file_shares ON "file_shares" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Two new permissions. Everything else reuses files.read, files.write and files.read.all.
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'files.organization.manage', 'Publish and remove company-wide and team documents.'),
  (gen_random_uuid(), 'files.share', 'Share documents with a person, a role or a team.'),
  (gen_random_uuid(), 'files.reports.read', 'Read the employee documents of your direct reports.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Granted to whoever already reads every employee's files (HR): publishing and sharing are the
-- same people-operations authority. Manager access to reports is left off until an administrator
-- turns it on for a role.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "permissions" AS permission_row
  ON permission_row."key" IN ('files.organization.manage', 'files.share')
WHERE anchor."key" = 'files.read.all'
ON CONFLICT DO NOTHING;
