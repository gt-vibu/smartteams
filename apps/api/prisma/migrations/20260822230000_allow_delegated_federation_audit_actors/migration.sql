ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_actor_check";

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_check" CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL AND "actor_client_id" IS NULL)
    OR ("actor_type" = 'FEDERATION_CLIENT' AND "actor_client_id" IS NOT NULL)
    OR ("actor_type" = 'PLATFORM_OPERATOR' AND "actor_user_id" IS NOT NULL AND "actor_client_id" IS NULL)
    OR ("actor_type" = 'SYSTEM' AND "actor_user_id" IS NULL AND "actor_client_id" IS NULL)
  );
