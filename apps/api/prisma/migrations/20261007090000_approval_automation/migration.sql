ALTER TABLE "approval_policies" ADD COLUMN "automation" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "leave_approvals" ALTER COLUMN "approver_user_id" DROP NOT NULL;
ALTER TABLE "attendance_approvals" ALTER COLUMN "approver_user_id" DROP NOT NULL;
ALTER TABLE "leave_approvals" ADD COLUMN "decision_actor" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "attendance_approvals" ADD COLUMN "decision_actor" TEXT NOT NULL DEFAULT 'USER';
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approval_actor_check"
  CHECK (("decision_actor" = 'SYSTEM' AND "approver_user_id" IS NULL) OR
         ("decision_actor" = 'USER' AND "approver_user_id" IS NOT NULL));
ALTER TABLE "attendance_approvals" ADD CONSTRAINT "attendance_approval_actor_check"
  CHECK (("decision_actor" = 'SYSTEM' AND "approver_user_id" IS NULL) OR
         ("decision_actor" = 'USER' AND "approver_user_id" IS NOT NULL));
