-- A handover of approvals takes effect only once the person covering accepts it, unless an
-- administrator set it up. created_by_user_id records who set it (the person away, or an admin).
ALTER TABLE approval_delegations
  ADD COLUMN accepted_at timestamptz(6),
  ADD COLUMN declined_at timestamptz(6),
  ADD COLUMN created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Handovers made before acceptance existed were in force from the moment they were made.
UPDATE approval_delegations
   SET accepted_at = created_at,
       created_by_user_id = delegator_user_id
 WHERE accepted_at IS NULL;
