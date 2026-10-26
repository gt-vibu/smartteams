-- Notifications are also sent by email, once each, unless the person has turned that off.
ALTER TABLE "notifications" ADD COLUMN "emailed_at" TIMESTAMPTZ(6);
CREATE INDEX "notifications_organization_id_emailed_at_created_at_idx"
  ON "notifications"("organization_id", "emailed_at", "created_at");
ALTER TABLE "users" ADD COLUMN "email_notifications" BOOLEAN NOT NULL DEFAULT true;
