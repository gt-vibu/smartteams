-- Notifications: one row per recipient, so read state is each person's own.
CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "module" TEXT,
  "entity_type" TEXT,
  "entity_id" UUID,
  "actor_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(6),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id")
  REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "notifications_organization_id_recipient_user_id_created_at_idx"
  ON "notifications"("organization_id", "recipient_user_id", "created_at" DESC);
CREATE INDEX "notifications_organization_id_recipient_user_id_read_at_idx"
  ON "notifications"("organization_id", "recipient_user_id", "read_at");

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notifications ON "notifications"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
