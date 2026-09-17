-- Native organization membership. A tenant could onboard its bootstrap administrator and then had
-- no way to add anyone else: nothing created a `user_invitations` row, and role assignment refuses
-- a user who is not already an active member. `members.write` gates the route that closes that.
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'members.read', 'Read the people who can sign in to the organization.'),
  (gen_random_uuid(), 'members.write', 'Add people to the organization and assign their roles.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Anyone who could already administer roles could already grant themselves anything; giving them
-- membership management adds no authority they did not have.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "roles" AS role_row ON role_row."id" = role_link."role_id"
JOIN "permissions" AS permission_row ON permission_row."key" IN ('members.read', 'members.write')
WHERE anchor."key" = 'rbac.write'
  AND role_row."code" <> 'EMPLOYEE'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
