INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'payroll.policy.read', 'Read payroll policy and statutory rule configuration.'),
  (gen_random_uuid(), 'payroll.policy.write', 'Manage payroll policy and statutory rule configuration.'),
  (gen_random_uuid(), 'payroll.employee-profile.read', 'Read an employee payroll profile.'),
  (gen_random_uuid(), 'payroll.employee-profile.read.all', 'Read all employee payroll profiles.'),
  (gen_random_uuid(), 'payroll.employee-profile.write', 'Manage employee salary and payroll policy settings.'),
  (gen_random_uuid(), 'payroll.preview.read', 'Preview canonical payroll calculations.'),
  (gen_random_uuid(), 'payroll.advances.read', 'Read salary advances.'),
  (gen_random_uuid(), 'payroll.advances.read.all', 'Read salary advances for all employees.'),
  (gen_random_uuid(), 'payroll.advances.request', 'Request a salary advance.'),
  (gen_random_uuid(), 'payroll.advances.approve', 'Approve or reject salary advances.'),
  (gen_random_uuid(), 'payroll.payments.read', 'Read payroll payment status and timestamps.'),
  (gen_random_uuid(), 'payroll.payments.read.all', 'Read payroll payments for all employees.'),
  (gen_random_uuid(), 'payroll.payments.write', 'Record individual payroll payments.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "federation_grant_scopes" ("grant_id", "scope_id")
SELECT DISTINCT grant_row."id", target_scope."id"
FROM "federation_grants" AS grant_row
JOIN "organizations" AS organization ON organization."id" = grant_row."organization_id"
JOIN "federation_grant_scopes" AS write_link ON write_link."grant_id" = grant_row."id"
JOIN "federation_scopes" AS write_scope ON write_scope."id" = write_link."scope_id"
JOIN "federation_scopes" AS target_scope ON target_scope."code" IN (
  'payroll.policy.read', 'payroll.policy.write',
  'payroll.employee-profile.read', 'payroll.employee-profile.read.all', 'payroll.employee-profile.write',
  'payroll.preview.read', 'payroll.advances.read', 'payroll.advances.read.all',
  'payroll.advances.request', 'payroll.advances.approve',
  'payroll.payments.read', 'payroll.payments.read.all', 'payroll.payments.write'
)
WHERE organization."source" = 'BLIZBOOKS'::"OrganizationSource"
  AND grant_row."effect" = 'ALLOW'::"GrantEffect"
  AND grant_row."status" = 'ACTIVE'::"GrantStatus"
  AND write_scope."code" = 'employees.write'
  AND NOT EXISTS (
    SELECT 1
    FROM "federation_grants" AS deny_grant
    JOIN "federation_grant_scopes" AS deny_link ON deny_link."grant_id" = deny_grant."id"
    JOIN "federation_scopes" AS deny_scope ON deny_scope."id" = deny_link."scope_id"
    WHERE deny_grant."client_id" = grant_row."client_id"
      AND deny_grant."organization_id" = grant_row."organization_id"
      AND deny_grant."effect" = 'DENY'::"GrantEffect"
      AND deny_grant."status" = 'ACTIVE'::"GrantStatus"
      AND (deny_grant."branch_id" IS NULL OR deny_grant."branch_id" = grant_row."branch_id")
      AND deny_scope."code" = target_scope."code"
  )
ON CONFLICT ("grant_id", "scope_id") DO NOTHING;
