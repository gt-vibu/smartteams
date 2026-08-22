INSERT INTO "federation_capabilities" ("id", "code", "version", "description", "is_active", "created_at")
VALUES
  (gen_random_uuid(), 'timesheets', 'v1', 'Federated timesheet derivation, submission, and approval.', true, NOW()),
  (gen_random_uuid(), 'compliance', 'v1', 'Federated employee statutory profiles and filing records.', true, NOW())
ON CONFLICT ("code", "version") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "organization_federation_capabilities"
  ("organization_id", "capability_id", "status", "configuration", "enabled_at")
SELECT DISTINCT
  existing."organization_id",
  capability."id",
  'ENABLED'::"CapabilityStatus",
  '{}'::jsonb,
  NOW()
FROM "organization_federation_capabilities" AS existing
JOIN "organizations" AS organization
  ON organization."id" = existing."organization_id"
JOIN "federation_capabilities" AS capability
  ON capability."code" IN ('timesheets', 'compliance')
 AND capability."version" = 'v1'
WHERE NOT EXISTS (
  SELECT 1
  FROM "organization_federation_capabilities" AS current
  WHERE current."organization_id" = existing."organization_id"
    AND current."capability_id" = capability."id"
)
AND organization."source" = 'BLIZBOOKS';
