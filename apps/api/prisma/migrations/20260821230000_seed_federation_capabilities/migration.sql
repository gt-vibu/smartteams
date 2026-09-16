-- Register the capabilities implemented by the federation API and enable them
-- for existing federated tenants. Existing tenant overrides are preserved.

ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization_federation_capabilities" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "federation_capabilities" ("id", "code", "version", "description", "is_active", "created_at")
VALUES
  (gen_random_uuid(), 'employees', 'v1', 'Federated employee identity and access synchronization.', true, NOW()),
  (gen_random_uuid(), 'attendance', 'v1', 'Federated attendance records, corrections, and preferences.', true, NOW()),
  (gen_random_uuid(), 'leave', 'v1', 'Federated leave types, balances, requests, and approvals.', true, NOW()),
  (gen_random_uuid(), 'payroll', 'v1', 'Federated payroll runs, adjustments, and ledger visibility.', true, NOW()),
  (gen_random_uuid(), 'shifts', 'v1', 'Federated shift definitions and attendance scheduling.', true, NOW()),
  (gen_random_uuid(), 'device_verification', 'v1', 'Federated WebAuthn device verification for workforce actions.', true, NOW())
ON CONFLICT ("code", "version") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "organization_federation_capabilities" (
  "organization_id",
  "capability_id",
  "status",
  "configuration",
  "enabled_at",
  "created_at",
  "updated_at"
)
SELECT
  organization."id",
  capability."id",
  'ENABLED'::"CapabilityStatus",
  '{}'::jsonb,
  NOW(),
  NOW(),
  NOW()
FROM "organizations" AS organization
CROSS JOIN "federation_capabilities" AS capability
LEFT JOIN "organization_federation_capabilities" AS existing
  ON existing."organization_id" = organization."id"
 AND existing."capability_id" = capability."id"
WHERE organization."source" = 'BLIZBOOKS'::"OrganizationSource"
AND capability."version" = 'v1'
  AND existing."organization_id" IS NULL;

ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "organization_federation_capabilities" FORCE ROW LEVEL SECURITY;
