INSERT INTO "federation_capabilities" ("id", "code", "version", "description", "is_active")
VALUES (
  gen_random_uuid(),
  'approval_policies',
  'v1',
  'Federated approval policy configuration for workforce workflows.',
  true
)
ON CONFLICT ("code", "version") DO UPDATE
SET "description" = EXCLUDED."description",
    "is_active" = true;

INSERT INTO "organization_federation_capabilities" (
  "organization_id",
  "capability_id",
  "status",
  "configuration",
  "enabled_at",
  "updated_at"
)
SELECT organization_row."id", capability_row."id", 'ENABLED', '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations" AS organization_row
JOIN "federation_capabilities" AS capability_row
  ON capability_row."code" = 'approval_policies'
 AND capability_row."version" = 'v1'
ON CONFLICT ("organization_id", "capability_id") DO UPDATE
SET "status" = 'ENABLED',
    "disabled_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP;
