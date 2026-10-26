-- Default approvers for organizations that never had them.
--
-- New organizations have been created with a leave approval policy routed to the administrator
-- role, but nothing for timesheets or attendance corrections. Both refuse every submission until a
-- policy exists, so in those organizations no employee could submit a timesheet or correct a day,
-- and nothing in the product said why.
--
-- This gives each native organization the same default the creation paths now seed: a one-step
-- policy approved by the administrator role, for any of the three domains that has no active
-- policy. An organization that configured its own policy keeps it. One that deliberately
-- deactivated a default — the row exists but is inactive — is left as it chose.
--
-- Federation-sourced organizations are not touched: their approvals belong to the partner system.

WITH admin_role AS (
  SELECT DISTINCT ON (r.organization_id) r.organization_id, r.id AS role_id
  FROM roles r
  JOIN organizations o ON o.id = r.organization_id
  WHERE r.code = 'ORG_ADMIN' AND o.source = 'NATIVE'
  ORDER BY r.organization_id, r.created_at
),
wanted (domain, code, name) AS (
  VALUES
    ('LEAVE'::"ApprovalDomain", 'LEAVE_DEFAULT', 'Leave approval'),
    ('TIMESHEET'::"ApprovalDomain", 'TIMESHEET_DEFAULT', 'Timesheet approval'),
    ('ATTENDANCE_CORRECTION'::"ApprovalDomain", 'ATTENDANCE_CORRECTION_DEFAULT', 'Attendance correction approval')
),
missing AS MATERIALIZED (
  SELECT gen_random_uuid() AS policy_id, a.organization_id, a.role_id, w.domain, w.code, w.name
  FROM admin_role a
  CROSS JOIN wanted w
  WHERE NOT EXISTS (
      SELECT 1 FROM approval_policies p
      WHERE p.organization_id = a.organization_id AND p.domain = w.domain AND p.is_active
    )
    AND NOT EXISTS (
      SELECT 1 FROM approval_policies p
      WHERE p.organization_id = a.organization_id AND p.domain = w.domain AND p.code = w.code
    )
),
policies AS (
  INSERT INTO approval_policies (id, organization_id, domain, code, name, is_default, is_active, updated_at)
  SELECT policy_id, organization_id, domain, code, name, true, true, CURRENT_TIMESTAMP
  FROM missing
  RETURNING id
)
INSERT INTO approval_policy_steps (id, organization_id, approval_policy_id, step_number, approver_type, role_id, required)
SELECT gen_random_uuid(), m.organization_id, m.policy_id, 1, 'ROLE', m.role_id, true
FROM missing m
JOIN policies p ON p.id = m.policy_id;
