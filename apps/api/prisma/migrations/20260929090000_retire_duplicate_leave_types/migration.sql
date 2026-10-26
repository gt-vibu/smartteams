-- Switch off the second copy of a leave type that 20260904180000_backfill_leave_defaults created.
--
-- That backfill gave every organization Casual, Sick and Earned Leave, but it checked only the
-- code (CASUAL, SICK, EARNED). An organization that already had "Casual Leave" under its own code
-- (CL, say) got a second "Casual Leave" beside it, so employees saw two identical cards and two
-- identical choices when applying. Leave types are now refused a name already in use; this clears
-- the copies that exist from before.
--
-- Nothing is deleted. Within each group of active types sharing a name, one is kept: the one that
-- has been used, then the organization's own over a backfilled default, then the older. Any other
-- copy is set inactive only if nothing has used it: no request, encashment or comp-off credit, and
-- no balance with days used, reserved or adjusted by hand. A copy that has been used is left
-- alone for an administrator to decide. Organizations connected through federation are not
-- touched, because a partner may read their leave types.
WITH candidates AS (
  SELECT
    t.id,
    t.organization_id,
    lower(btrim(t.name)) AS name_key,
    t.code,
    t.created_at,
    (
      EXISTS (SELECT 1 FROM leave_requests r WHERE r.leave_type_id = t.id)
      OR EXISTS (SELECT 1 FROM leave_encashments e WHERE e.leave_type_id = t.id)
      OR EXISTS (SELECT 1 FROM comp_off_credits c WHERE c.leave_type_id = t.id)
      OR EXISTS (
        SELECT 1 FROM leave_balances b
        WHERE b.leave_type_id = t.id
          AND (
            b.used_amount <> 0
            OR b.reserved_amount <> 0
            OR EXISTS (
              SELECT 1 FROM leave_balance_transactions x
              WHERE x.leave_balance_id = b.id AND x.transaction_type = 'ADJUSTMENT'
            )
          )
      )
    ) AS used
  FROM leave_types t
  WHERE t.is_active
    AND NOT EXISTS (SELECT 1 FROM federation_grants g WHERE g.organization_id = t.organization_id)
),
ranked AS (
  SELECT
    candidates.*,
    count(*) OVER (PARTITION BY organization_id, name_key) AS copies,
    row_number() OVER (
      PARTITION BY organization_id, name_key
      ORDER BY used DESC, (code IN ('CASUAL', 'SICK', 'EARNED')) ASC, created_at ASC, id ASC
    ) AS place
  FROM candidates
)
UPDATE leave_types t
SET is_active = false, updated_at = now()
FROM ranked
WHERE ranked.id = t.id
  AND ranked.copies > 1
  AND ranked.place > 1
  AND NOT ranked.used;
