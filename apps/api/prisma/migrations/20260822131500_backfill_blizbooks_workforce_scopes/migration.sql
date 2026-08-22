-- Keep the BlizBooks federation client aligned with the employee self-service
-- contract. The existing employees.write grant is the integration's explicit
-- opt-in marker; active DENY grants always win and are preserved.
INSERT INTO "federation_scopes" ("id", "code", "description")
VALUES
  (gen_random_uuid(), 'attendance.read', 'Read federated attendance records.'),
  (gen_random_uuid(), 'attendance.preferences.read', 'Read federated attendance preferences.'),
  (gen_random_uuid(), 'attendance.preferences.write', 'Manage federated attendance preferences.'),
  (gen_random_uuid(), 'attendance.corrections.write', 'Request federated attendance corrections.'),
  (gen_random_uuid(), 'attendance.corrections.decide', 'Decide federated attendance corrections.'),
  (gen_random_uuid(), 'attendance.webauthn.assert', 'Verify federated attendance assertions.'),
  (gen_random_uuid(), 'attendance.webauthn.enroll', 'Enroll federated attendance credentials.'),
  (gen_random_uuid(), 'attendance.write', 'Create federated attendance punches.'),
  (gen_random_uuid(), 'leave.types.read', 'Read federated leave types.'),
  (gen_random_uuid(), 'leave.types.write', 'Manage federated leave types.'),
  (gen_random_uuid(), 'leave.balances.read', 'Read federated leave balances.'),
  (gen_random_uuid(), 'leave.requests.read', 'Read federated leave requests.'),
  (gen_random_uuid(), 'leave.requests.write', 'Create and cancel federated leave requests.'),
  (gen_random_uuid(), 'leave.requests.decide', 'Decide federated leave requests.'),
  (gen_random_uuid(), 'leave.balances.adjust', 'Adjust federated leave balances.'),
  (gen_random_uuid(), 'payroll.components.read', 'Read federated payroll components.'),
  (gen_random_uuid(), 'payroll.components.write', 'Manage federated payroll components.'),
  (gen_random_uuid(), 'payroll.payslips.read', 'Read federated employee payslips.'),
  (gen_random_uuid(), 'payroll.payslips.read.all', 'Read all federated employee payslips.'),
  (gen_random_uuid(), 'payroll.calendars.read', 'Read federated payroll calendars.'),
  (gen_random_uuid(), 'payroll.calendars.write', 'Manage federated payroll calendars.'),
  (gen_random_uuid(), 'payroll.runs.read', 'Read federated payroll runs.'),
  (gen_random_uuid(), 'payroll.runs.write', 'Create federated payroll runs.'),
  (gen_random_uuid(), 'payroll.runs.calculate', 'Calculate federated payroll runs.'),
  (gen_random_uuid(), 'payroll.runs.approve', 'Approve federated payroll runs.'),
  (gen_random_uuid(), 'payroll.runs.release', 'Release federated payroll runs.'),
  (gen_random_uuid(), 'payroll.runs.lock', 'Lock federated payroll runs.'),
  (gen_random_uuid(), 'payroll.ledger.read', 'Read federated payroll ledger entries.'),
  (gen_random_uuid(), 'payroll.adjustments.write', 'Create federated payroll adjustments.'),
  (gen_random_uuid(), 'payroll.compliance.read', 'Read federated statutory records.'),
  (gen_random_uuid(), 'payroll.compliance.write', 'Manage federated statutory records.')
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
    'attendance.read',
    'attendance.preferences.read',
    'attendance.preferences.write',
    'attendance.corrections.write',
    'attendance.corrections.decide',
    'attendance.webauthn.assert',
    'attendance.webauthn.enroll',
    'attendance.write',
    'leave.types.read',
    'leave.types.write',
    'leave.balances.read',
    'leave.requests.read',
    'leave.requests.write',
    'leave.requests.decide',
    'leave.balances.adjust',
    'payroll.components.read',
    'payroll.components.write',
    'payroll.payslips.read',
    'payroll.payslips.read.all',
    'payroll.calendars.read',
    'payroll.calendars.write',
    'payroll.runs.read',
    'payroll.runs.write',
    'payroll.runs.calculate',
    'payroll.runs.approve',
    'payroll.runs.release',
    'payroll.runs.lock',
    'payroll.ledger.read',
    'payroll.adjustments.write',
    'payroll.compliance.read',
    'payroll.compliance.write'
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
