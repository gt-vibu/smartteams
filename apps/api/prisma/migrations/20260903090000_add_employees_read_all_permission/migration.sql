-- `employees.read` now means "read your own record" in the employee services, matching what it
-- already meant in Leave, Attendance, Payroll and Files. Reading the tenant directory, another
-- employee's record, their employment history or their emergency contacts needs the broader key.
--
-- Without the backfill below this would be a breaking change for any existing role that holds
-- `employees.read` in order to administer staff: it would keep the permission and silently lose
-- the directory.

INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'employees.read.all', 'Read every employee record in the organization.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Grant it to roles that already administer employees. `employees.write` is the marker for an
-- HR/admin role: a role that may create and edit staff was already reading the directory, and is
-- not a self-service role. The wildcard needs nothing — `requirePermission` short-circuits on it.
--
-- The EMPLOYEE role is excluded by name as well as by anchor. It holds no write permission so the
-- join cannot reach it, and the explicit guard keeps that true if the seed set ever changes.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "roles" AS role_row ON role_row."id" = role_link."role_id"
JOIN "permissions" AS permission_row ON permission_row."key" = 'employees.read.all'
WHERE anchor."key" = 'employees.write'
  AND role_row."code" <> 'EMPLOYEE'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
