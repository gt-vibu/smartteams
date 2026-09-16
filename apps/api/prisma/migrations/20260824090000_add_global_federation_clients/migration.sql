CREATE TYPE "FederationEnvironment" AS ENUM ('SANDBOX', 'STAGING', 'PRODUCTION');

ALTER TABLE "federation_clients"
ADD COLUMN "environment" "FederationEnvironment" NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN "tenant_provisioning_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "federation_clients_environment_status_idx"
ON "federation_clients"("environment", "status");
