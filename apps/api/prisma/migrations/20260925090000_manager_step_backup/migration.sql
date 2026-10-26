-- A reporting-manager step may name a backup role, which decides when the requester has no
-- active manager. The other two shapes are unchanged.
ALTER TABLE approval_policy_steps DROP CONSTRAINT approval_policy_steps_approver_check;
ALTER TABLE approval_policy_steps ADD CONSTRAINT approval_policy_steps_approver_check CHECK (
  (approver_type = 'ROLE'::public."ApproverType" AND role_id IS NOT NULL AND approver_user_id IS NULL)
  OR (approver_type = 'USER'::public."ApproverType" AND role_id IS NULL AND approver_user_id IS NOT NULL)
  OR (approver_type = 'MANAGER'::public."ApproverType" AND approver_user_id IS NULL)
);
