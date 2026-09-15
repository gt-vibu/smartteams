-- A correction run occupies the same period as the run it supersedes, so the period can no
-- longer be unique on its own. The correction link joins the key: an original (NULL link) and
-- each replacement (link = the run it corrects) can coexist.
--
-- Postgres treats NULLs as distinct in a unique index, so this does not by itself stop two
-- originals for one period. That invariant — no second *open* run — is enforced in
-- `PayrollService.correct`, because it depends on status rather than on shape.
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_organization_id_period_start_period_end_key;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_organization_id_period_start_period_end_correc_key
  UNIQUE (organization_id, period_start, period_end, correction_of_run_id);

-- Permissions for the two lifecycle transitions that had no route until now.
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'payroll.runs.correct', 'Supersede a released payroll run with a correction.'),
  (gen_random_uuid(), 'payroll.runs.void', 'Abandon a payroll run that has not been released.')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

-- Granted to whoever can already release payroll: correcting is the same authority applied to a
-- mistake, and splitting them would leave a released error with nobody able to fix it.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT role_link."role_id", permission_row."id"
FROM "role_permissions" AS role_link
JOIN "permissions" AS anchor ON anchor."id" = role_link."permission_id"
JOIN "permissions" AS permission_row
  ON permission_row."key" IN ('payroll.runs.correct', 'payroll.runs.void')
WHERE anchor."key" = 'payroll.runs.release'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
