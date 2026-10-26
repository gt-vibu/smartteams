-- Restore the standard Manager access profile for organizations created before the shared role
-- seeder included it. Its baseline is copied from Employee, with only approval capabilities added.
INSERT INTO public.permissions (id, key, description)
VALUES
  (gen_random_uuid(), 'leave.requests.decide', 'leave.requests.decide'),
  (gen_random_uuid(), 'attendance.corrections.decide', 'attendance.corrections.decide'),
  (gen_random_uuid(), 'timesheets.decide', 'timesheets.decide'),
  (gen_random_uuid(), 'rbac.read', 'rbac.read')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.roles (
  id, organization_id, code, name, description, scope, branch_id, is_system,
  created_by_user_id, created_at, updated_at
)
SELECT gen_random_uuid(), organization.id, 'MANAGER', 'Manager',
  'Employee self-service plus approval access for reports', 'ORGANIZATION'::public."RoleScope",
  NULL, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM public.organizations organization
WHERE EXISTS (
  SELECT 1 FROM public.roles employee_role
  WHERE employee_role.organization_id = organization.id AND employee_role.code = 'EMPLOYEE'
)
AND NOT EXISTS (
  SELECT 1 FROM public.roles manager_role
  WHERE manager_role.organization_id = organization.id AND manager_role.code = 'MANAGER'
);

-- Reuse exactly the permissions already granted to the Employee profile as the Manager baseline.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT manager_role.id, employee_permission.permission_id
FROM public.roles manager_role
JOIN public.roles employee_role
  ON employee_role.organization_id = manager_role.organization_id
  AND employee_role.code = 'EMPLOYEE'
JOIN public.role_permissions employee_permission ON employee_permission.role_id = employee_role.id
WHERE manager_role.code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT manager_role.id, permission.id
FROM public.roles manager_role
JOIN public.permissions permission
  ON permission.key IN (
    'leave.requests.decide', 'attendance.corrections.decide', 'timesheets.decide', 'rbac.read'
  )
WHERE manager_role.code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;
