CREATE TABLE "workflow_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "payload_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "workflow_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_drafts_organization_id_owner_user_id_kind_key"
  ON "workflow_drafts"("organization_id", "owner_user_id", "kind");
CREATE INDEX "workflow_drafts_organization_id_owner_user_id_updated_at_idx"
  ON "workflow_drafts"("organization_id", "owner_user_id", "updated_at");

ALTER TABLE "workflow_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_drafts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workflow_drafts ON "workflow_drafts"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
