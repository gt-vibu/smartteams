-- Older BlizBooks federation payloads duplicated a one-token name into both
-- required SmartTeams name columns. Preserve the first name and clear only
-- the generated duplicate on federated records; native employee records are
-- intentionally untouched.
ALTER TABLE "employees" NO FORCE ROW LEVEL SECURITY;

UPDATE "employees"
SET "last_name" = ''
WHERE "identity_source" = 'FEDERATED'::"IdentityType"
  AND btrim("first_name") <> ''
  AND btrim("first_name") = btrim("last_name");

ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
