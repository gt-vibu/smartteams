INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'approval-policies.read', 'Read federated approval policies.'),
  (gen_random_uuid(), 'approval-policies.write', 'Create and update federated approval policies.')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" AS grant_row
JOIN "federation_grant_scopes" AS employee_write_link
  ON employee_write_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS employee_write_scope
  ON employee_write_scope."id" = employee_write_link."scope_id"
JOIN "federation_scopes" AS target_scope
  ON target_scope."code" IN ('approval-policies.read', 'approval-policies.write')
WHERE grant_row."effect" = 'ALLOW'
  AND employee_write_scope."code" = 'employees.write'
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
