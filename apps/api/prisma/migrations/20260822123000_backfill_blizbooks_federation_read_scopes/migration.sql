ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "federation_grants" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'capabilities.read', 'Discover enabled federation capabilities.'),
  (gen_random_uuid(), 'employees.read', 'Read federated employee records.')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", read_scope."id"
FROM "federation_grants" AS grant_row
JOIN "organizations" AS organization
  ON organization."id" = grant_row."organization_id"
JOIN "federation_grant_scopes" AS write_link
  ON write_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS write_scope
  ON write_scope."id" = write_link."scope_id"
JOIN "federation_scopes" AS read_scope
  ON read_scope."code" = 'employees.read'
WHERE organization."source" = 'BLIZBOOKS'::"OrganizationSource"
  AND grant_row."effect" = 'ALLOW'::"GrantEffect"
  AND grant_row."status" = 'ACTIVE'::"GrantStatus"
  AND write_scope."code" = 'employees.write'
  AND NOT EXISTS (
    SELECT 1
    FROM "federation_grants" AS deny_grant
    JOIN "federation_grant_scopes" AS deny_link
      ON deny_link."grant_id" = deny_grant."id"
    JOIN "federation_scopes" AS deny_scope
      ON deny_scope."id" = deny_link."scope_id"
    WHERE deny_grant."client_id" = grant_row."client_id"
      AND deny_grant."organization_id" = grant_row."organization_id"
      AND deny_grant."effect" = 'DENY'::"GrantEffect"
      AND deny_grant."status" = 'ACTIVE'::"GrantStatus"
      AND (deny_grant."branch_id" IS NULL OR deny_grant."branch_id" = grant_row."branch_id")
      AND deny_scope."code" = 'employees.read'
  )
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;

ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "federation_grants" FORCE ROW LEVEL SECURITY;

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", capability_scope."id"
FROM "federation_grants" AS grant_row
JOIN "organizations" AS organization
  ON organization."id" = grant_row."organization_id"
JOIN "federation_grant_scopes" AS tenant_link
  ON tenant_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS tenant_scope
  ON tenant_scope."id" = tenant_link."scope_id"
JOIN "federation_scopes" AS capability_scope
  ON capability_scope."code" = 'capabilities.read'
WHERE organization."source" = 'BLIZBOOKS'::"OrganizationSource"
  AND grant_row."branch_id" IS NULL
  AND grant_row."effect" = 'ALLOW'::"GrantEffect"
  AND grant_row."status" = 'ACTIVE'::"GrantStatus"
  AND tenant_scope."code" = 'tenants.write'
  AND NOT EXISTS (
    SELECT 1
    FROM "federation_grants" AS deny_grant
    JOIN "federation_grant_scopes" AS deny_link
      ON deny_link."grant_id" = deny_grant."id"
    JOIN "federation_scopes" AS deny_scope
      ON deny_scope."id" = deny_link."scope_id"
    WHERE deny_grant."client_id" = grant_row."client_id"
      AND deny_grant."organization_id" = grant_row."organization_id"
      AND deny_grant."effect" = 'DENY'::"GrantEffect"
      AND deny_grant."status" = 'ACTIVE'::"GrantStatus"
      AND deny_grant."branch_id" IS NULL
      AND deny_scope."code" = 'capabilities.read'
  )
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
