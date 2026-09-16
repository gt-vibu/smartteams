-- Give every organization the leave configuration it needs to be usable.
--
-- A tenant with no leave types shows an employee an empty Leave screen; if an administrator
-- creates a type, the request is still refused with "configure a default leave approval policy
-- before submitting leave requests". Three setup steps stood between a new tenant and its first
-- day off and none of them was prompted anywhere in the product, so Leave read as broken.
--
-- Idempotent throughout: every insert is guarded on the row not already existing, so tenants that
-- configured themselves keep exactly what they chose.

-- 1. Three ordinary paid leave types per organization.
INSERT INTO leave_types (id, organization_id, code, name, paid, accrual_type, annual_allowance, requires_attachment, is_active, created_at, updated_at)
SELECT gen_random_uuid(), o.id, t.code, t.name, true, 'FIXED_ANNUAL', t.allowance, false, true, now(), now()
FROM organizations o
CROSS JOIN (VALUES
  ('CASUAL', 'Casual Leave', 12),
  ('SICK',   'Sick Leave',   12),
  ('EARNED', 'Earned Leave', 15)
) AS t(code, name, allowance)
WHERE NOT EXISTS (
  SELECT 1 FROM leave_types lt WHERE lt.organization_id = o.id AND lt.code = t.code
);

-- 2. A type is only requestable at branches it is assigned to, so assign each to every branch.
INSERT INTO leave_policy_assignments (id, organization_id, branch_id, leave_type_id, source_access_mode, created_at, updated_at)
SELECT gen_random_uuid(), lt.organization_id, b.id, lt.id, 'NATIVE', now(), now()
FROM leave_types lt
JOIN branches b ON b.organization_id = lt.organization_id
WHERE NOT EXISTS (
  SELECT 1 FROM leave_policy_assignments a
  WHERE a.organization_id = lt.organization_id AND a.branch_id = b.id AND a.leave_type_id = lt.id
);

-- 3. A default LEAVE approval policy, routed at the ORG_ADMIN role rather than at a person: the
--    first administrator may later be replaced, and a policy pointing at a departed user approves
--    nothing.
INSERT INTO approval_policies (id, organization_id, domain, code, name, is_default, is_active, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'LEAVE', 'LEAVE_DEFAULT', 'Leave approval', true, true, now(), now()
FROM organizations o
WHERE EXISTS (SELECT 1 FROM roles r WHERE r.organization_id = o.id AND r.code = 'ORG_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM approval_policies p
    WHERE p.organization_id = o.id AND p.domain = 'LEAVE' AND p.is_default = true
  );

INSERT INTO approval_policy_steps (id, organization_id, approval_policy_id, step_number, approver_type, role_id, required, created_at)
SELECT gen_random_uuid(), p.organization_id, p.id, 1, 'ROLE', r.id, true, now()
FROM approval_policies p
JOIN roles r ON r.organization_id = p.organization_id AND r.code = 'ORG_ADMIN'
WHERE p.code = 'LEAVE_DEFAULT'
  AND NOT EXISTS (SELECT 1 FROM approval_policy_steps s WHERE s.approval_policy_id = p.id);
