-- Backfill the standard roles for organizations that never received them.
--
-- Platform onboarding seeded EMPLOYEE, MANAGER and HR_ADMIN; self-service registration created
-- only ORG_ADMIN. A tenant that signed itself up therefore had a single wildcard role and nothing
-- to assign a new joiner, so the onboarding form reported that it could not read the Employee
-- role and created employees with no login. The code paths are now shared; this repairs the
-- tenants created before that.
--
-- Idempotent: every insert is guarded on the role not already existing, so re-running changes
-- nothing and organizations that were seeded correctly are untouched.

-- Permission rows are global and shared across tenants; authority comes from the role that
-- carries one, never from the row itself.
INSERT INTO permissions (id, key, description)
SELECT gen_random_uuid(), k, k FROM (VALUES
    ('organizations.read'),
    ('employees.read'),
    ('attendance.read'),
    ('attendance.write'),
    ('attendance.corrections.write'),
    ('attendance.preferences.read'),
    ('leave.types.read'),
    ('leave.requests.read'),
    ('leave.requests.write'),
    ('leave.balances.read'),
    ('timesheets.read'),
    ('timesheets.write'),
    ('timesheets.submit'),
    ('payroll.payslips.read'),
    ('payroll.employee-profile.read'),
    ('payroll.preview.read'),
    ('payroll.advances.read'),
    ('payroll.advances.request'),
    ('files.read'),
    ('files.write'),
    ('teams.read'),
    ('projects.read'),
    ('shifts.read'),
    ('leave.requests.decide'),
    ('attendance.corrections.decide'),
    ('timesheets.approve'),
    ('rbac.read'),
    ('employees.read.all'),
    ('employees.write'),
    ('employees.branches.write'),
    ('attendance.read.all'),
    ('leave.requests.read.all'),
    ('leave.balances.read.all'),
    ('leave.balances.adjust'),
    ('leave.types.write'),
    ('timesheets.read.all'),
    ('files.read.all'),
    ('branches.read'),
    ('shifts.write'),
    ('members.read'),
    ('members.write'),
    ('rbac.write')
) AS t(k)
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  org RECORD;
  new_role_id UUID;
  role_def RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    FOR role_def IN
      SELECT * FROM (VALUES
        ('EMPLOYEE', 'Employee', 'Self-service access to your own records', ARRAY['organizations.read','employees.read','attendance.read','attendance.write','attendance.corrections.write','attendance.preferences.read','leave.types.read','leave.requests.read','leave.requests.write','leave.balances.read','timesheets.read','timesheets.write','timesheets.submit','payroll.payslips.read','payroll.employee-profile.read','payroll.preview.read','payroll.advances.read','payroll.advances.request','files.read','files.write','teams.read','projects.read','shifts.read']),
        ('MANAGER', 'Manager', 'Approves what their reports submit', ARRAY['organizations.read','employees.read','attendance.read','attendance.write','attendance.corrections.write','attendance.preferences.read','leave.types.read','leave.requests.read','leave.requests.write','leave.balances.read','timesheets.read','timesheets.write','timesheets.submit','payroll.payslips.read','payroll.employee-profile.read','payroll.preview.read','payroll.advances.read','payroll.advances.request','files.read','files.write','teams.read','projects.read','shifts.read','leave.requests.decide','attendance.corrections.decide','timesheets.approve','rbac.read']),
        ('HR_ADMIN', 'HR Admin', 'People operations across the organization', ARRAY['organizations.read','employees.read','attendance.read','attendance.write','attendance.corrections.write','attendance.preferences.read','leave.types.read','leave.requests.read','leave.requests.write','leave.balances.read','timesheets.read','timesheets.write','timesheets.submit','payroll.payslips.read','payroll.employee-profile.read','payroll.preview.read','payroll.advances.read','payroll.advances.request','files.read','files.write','teams.read','projects.read','shifts.read','leave.requests.decide','attendance.corrections.decide','timesheets.approve','rbac.read','employees.read.all','employees.write','employees.branches.write','attendance.read.all','leave.requests.read.all','leave.balances.read.all','leave.balances.adjust','leave.types.write','timesheets.read.all','files.read.all','branches.read','shifts.write','members.read','members.write','rbac.write'])
      ) AS r(code, name, description, keys)
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM roles WHERE organization_id = org.id AND code = role_def.code
      );

      -- updated_at is Prisma's application-level @updatedAt, so it carries no database default
      -- and a raw insert has to supply it.
      INSERT INTO roles (id, organization_id, code, name, description, scope, is_system, updated_at)
      VALUES (gen_random_uuid(), org.id, role_def.code, role_def.name, role_def.description, 'ORGANIZATION', true, now())
      RETURNING id INTO new_role_id;

      -- role_permissions is keyed on (role_id, permission_id) and has no surrogate id.
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT new_role_id, p.id
      FROM permissions p
      WHERE p.key = ANY(role_def.keys);
    END LOOP;
  END LOOP;
END
$$;
