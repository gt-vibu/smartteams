-- Handing one's approvals to a colleague while away.
CREATE TABLE "approval_delegations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "delegator_user_id" UUID NOT NULL,
  "delegate_user_id" UUID NOT NULL,
  "starts_on" DATE NOT NULL,
  "ends_on" DATE NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_delegations_dates" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "approval_delegations_not_self" CHECK ("delegator_user_id" <> "delegate_user_id")
);
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegator_user_id_fkey"
  FOREIGN KEY ("delegator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegate_user_id_fkey"
  FOREIGN KEY ("delegate_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "approval_delegations_organization_id_delegate_user_id_starts_on_ends_on_idx"
  ON "approval_delegations"("organization_id", "delegate_user_id", "starts_on", "ends_on");
CREATE INDEX "approval_delegations_organization_id_delegator_user_id_starts_on_ends_on_idx"
  ON "approval_delegations"("organization_id", "delegator_user_id", "starts_on", "ends_on");

ALTER TABLE "approval_delegations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_delegations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_approval_delegations ON "approval_delegations"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
