INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'employees.read', 'Read federated employee records.'),
  (gen_random_uuid(), 'employees.deactivate', 'Deactivate federated employee records.'),
  (gen_random_uuid(), 'employees.branches.write', 'Manage employee branch assignments.'),
  (gen_random_uuid(), 'employees.access.write', 'Manage employee operational access.'),
  (gen_random_uuid(), 'employees.sessions.revoke', 'Revoke employee sessions.'),
  (gen_random_uuid(), 'employees.records.write', 'Manage employee records.'),
  (gen_random_uuid(), 'employees.compensation.read', 'Read employee compensation.'),
  (gen_random_uuid(), 'employees.compensation.write', 'Manage employee compensation.')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" AS grant_row
JOIN "organizations" AS organization
  ON organization."id" = grant_row."organization_id"
JOIN "federation_grant_scopes" AS write_link
  ON write_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS write_scope
  ON write_scope."id" = write_link."scope_id"
JOIN "federation_scopes" AS target_scope
  ON target_scope."code" IN (
    'employees.read',
    'employees.deactivate',
    'employees.branches.write',
    'employees.access.write',
    'employees.sessions.revoke',
    'employees.records.write',
    'employees.compensation.read',
    'employees.compensation.write'
  )
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
      AND deny_scope."code" = target_scope."code"
  )
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
