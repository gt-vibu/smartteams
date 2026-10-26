INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'employees.documents.read', 'Read employee documents and request secure downloads.'),
  (gen_random_uuid(), 'employees.documents.write', 'Upload and delete employee documents.')
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" AS grant_row
JOIN "federation_grant_scopes" AS employee_read_link
  ON employee_read_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS employee_read_scope
  ON employee_read_scope."id" = employee_read_link."scope_id"
JOIN "federation_scopes" AS target_scope
  ON target_scope."code" = 'employees.documents.read'
WHERE grant_row."effect" = 'ALLOW'
  AND employee_read_scope."code" = 'employees.read'
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" AS grant_row
JOIN "federation_grant_scopes" AS employee_write_link
  ON employee_write_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS employee_write_scope
  ON employee_write_scope."id" = employee_write_link."scope_id"
JOIN "federation_scopes" AS target_scope
  ON target_scope."code" = 'employees.documents.write'
WHERE grant_row."effect" = 'ALLOW'
  AND employee_write_scope."code" = 'employees.write'
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
