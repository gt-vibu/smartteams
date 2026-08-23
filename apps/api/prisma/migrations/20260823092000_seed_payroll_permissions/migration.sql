INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'payroll.policy.read', 'Read salary structure and statutory policy.'),
  (gen_random_uuid(), 'payroll.policy.write', 'Configure salary structure and statutory policy.'),
  (gen_random_uuid(), 'payroll.employee-profile.read', 'Read employee salary profiles.'),
  (gen_random_uuid(), 'payroll.employee-profile.read.all', 'Read all employee salary profiles.'),
  (gen_random_uuid(), 'payroll.employee-profile.write', 'Manage employee salary profiles and toggles.'),
  (gen_random_uuid(), 'payroll.preview.read', 'Preview payroll calculations.'),
  (gen_random_uuid(), 'payroll.advances.read', 'Read salary advance requests.'),
  (gen_random_uuid(), 'payroll.advances.read.all', 'Read all salary advance requests.'),
  (gen_random_uuid(), 'payroll.advances.request', 'Request salary advances.'),
  (gen_random_uuid(), 'payroll.advances.approve', 'Approve or reject salary advances.'),
  (gen_random_uuid(), 'payroll.payments.read', 'Read individual payroll payments.'),
  (gen_random_uuid(), 'payroll.payments.read.all', 'Read all individual payroll payments.'),
  (gen_random_uuid(), 'payroll.payments.write', 'Record individual payroll payments.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "permissions" AS permission_row ON permission_row."key" IN (
  'payroll.policy.read', 'payroll.employee-profile.read', 'payroll.preview.read',
  'payroll.advances.read', 'payroll.advances.request', 'payroll.payments.read'
)
WHERE anchor."key" IN ('payroll.components.read', 'payroll.payslips.read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "permissions" AS permission_row ON permission_row."key" IN (
  'payroll.policy.write', 'payroll.employee-profile.write', 'payroll.advances.read.all', 'payroll.advances.approve',
  'payroll.payments.read.all', 'payroll.payments.write'
)
WHERE anchor."key" IN ('payroll.components.write', 'payroll.runs.approve')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
