-- Replace the non-existent `timesheets.approve` grant with the canonical `timesheets.decide`.
--
-- The permission catalogue and `TimesheetEntriesService.decide` have always used
-- `timesheets.decide`. The MANAGER role seed granted `timesheets.approve`, which is not a
-- permission the catalogue defines — so a manager saw the approval UI (the frontend checked the
-- same wrong string) and was refused by the backend when they used it. Nobody could approve a
-- timesheet as a manager.
--
-- This corrects roles already seeded in existing tenants. The seed itself and the frontend policy
-- are corrected in code; a database that never received the wrong grant is unaffected.
--
-- Idempotent: re-running finds nothing left to move.

-- The permission row may not exist at all, since `timesheets.approve` was never in the catalogue.
-- Grants are keyed by permission id, so anything pointing at it is re-pointed at the real one.
WITH wrong AS (
  SELECT id FROM permissions WHERE key = 'timesheets.approve'
),
correct AS (
  SELECT id FROM permissions WHERE key = 'timesheets.decide'
)
UPDATE role_permissions rp
SET permission_id = (SELECT id FROM correct)
WHERE rp.permission_id IN (SELECT id FROM wrong)
  AND (SELECT count(*) FROM correct) = 1
  -- Skip roles that already hold the correct permission; the unique constraint would refuse the
  -- update and those roles need nothing done.
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions existing
    WHERE existing.role_id = rp.role_id
      AND existing.permission_id = (SELECT id FROM correct)
  );

-- Any duplicate left over — a role that held both — is now redundant.
DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE key = 'timesheets.approve');

-- The catalogue row itself, if some environment created it, is not a real permission.
DELETE FROM permissions WHERE key = 'timesheets.approve';
