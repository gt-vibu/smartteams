-- CreateEnum
CREATE TYPE "BiometricVerificationMode" AS ENUM ('DISABLED', 'OPTIONAL', 'REQUIRED');

-- CreateEnum
CREATE TYPE "WebauthnChallengePurpose" AS ENUM ('ENROLLMENT', 'ASSERTION');

-- CreateEnum
CREATE TYPE "WebauthnChallengeStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED');

-- AlterEnum
BEGIN;
CREATE TYPE "OwnerSource_new" AS ENUM ('NATIVE', 'FEDERATED');
ALTER TABLE "employee_field_ownership" ALTER COLUMN "owner_source" TYPE "OwnerSource_new" USING (CASE WHEN "owner_source"::text = 'BLIZBOOKS' THEN 'FEDERATED' ELSE "owner_source"::text END::"OwnerSource_new");
ALTER TYPE "OwnerSource" RENAME TO "OwnerSource_old";
ALTER TYPE "OwnerSource_new" RENAME TO "OwnerSource";
DROP TYPE "public"."OwnerSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "attendance_punches" ADD COLUMN     "biometric_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webauthn_credential_id" UUID;

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "biometric_owner_client_id" UUID,
ADD COLUMN     "biometric_owner_source" "OwnerSource" NOT NULL DEFAULT 'NATIVE',
ADD COLUMN     "biometric_verification_mode" "BiometricVerificationMode",
ADD COLUMN     "geofence_owner_client_id" UUID,
ADD COLUMN     "geofence_owner_source" "OwnerSource" NOT NULL DEFAULT 'NATIVE';

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN     "biometric_owner_client_id" UUID,
ADD COLUMN     "biometric_owner_source" "OwnerSource" NOT NULL DEFAULT 'NATIVE',
ADD COLUMN     "biometric_verification_mode" "BiometricVerificationMode" NOT NULL DEFAULT 'DISABLED',
ADD COLUMN     "geofence_owner_client_id" UUID,
ADD COLUMN     "geofence_owner_source" "OwnerSource" NOT NULL DEFAULT 'NATIVE';

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "sign_count" BIGINT NOT NULL DEFAULT 0,
    "device_label" TEXT,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attestation_format" TEXT,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "purpose" "WebauthnChallengePurpose" NOT NULL,
    "challenge" TEXT NOT NULL,
    "related_credential_id" UUID,
    "related_attendance_punch_id" UUID,
    "status" "WebauthnChallengeStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "webauthn_credentials_organization_id_employee_id_status_idx" ON "webauthn_credentials"("organization_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "webauthn_challenges_organization_id_employee_id_purpose_sta_idx" ON "webauthn_challenges"("organization_id", "employee_id", "purpose", "status");

-- CreateIndex
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_webauthn_credential_id_fkey" FOREIGN KEY ("webauthn_credential_id") REFERENCES "webauthn_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_geofence_owner_client_id_fkey" FOREIGN KEY ("geofence_owner_client_id") REFERENCES "federation_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_biometric_owner_client_id_fkey" FOREIGN KEY ("biometric_owner_client_id") REFERENCES "federation_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_geofence_owner_client_id_fkey" FOREIGN KEY ("geofence_owner_client_id") REFERENCES "federation_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_biometric_owner_client_id_fkey" FOREIGN KEY ("biometric_owner_client_id") REFERENCES "federation_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_related_credential_id_fkey" FOREIGN KEY ("related_credential_id") REFERENCES "webauthn_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_related_attendance_punch_id_fkey" FOREIGN KEY ("related_attendance_punch_id") REFERENCES "attendance_punches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_geofence_owner_check" CHECK (("geofence_owner_source" = 'NATIVE' AND "geofence_owner_client_id" IS NULL) OR ("geofence_owner_source" = 'FEDERATED' AND "geofence_owner_client_id" IS NOT NULL)),
  ADD CONSTRAINT "organization_settings_biometric_owner_check" CHECK (("biometric_owner_source" = 'NATIVE' AND "biometric_owner_client_id" IS NULL) OR ("biometric_owner_source" = 'FEDERATED' AND "biometric_owner_client_id" IS NOT NULL));

ALTER TABLE "branches"
  ADD CONSTRAINT "branches_geofence_owner_check" CHECK (("geofence_owner_source" = 'NATIVE' AND "geofence_owner_client_id" IS NULL) OR ("geofence_owner_source" = 'FEDERATED' AND "geofence_owner_client_id" IS NOT NULL)),
  ADD CONSTRAINT "branches_biometric_owner_check" CHECK (("biometric_owner_source" = 'NATIVE' AND "biometric_owner_client_id" IS NULL) OR ("biometric_owner_source" = 'FEDERATED' AND "biometric_owner_client_id" IS NOT NULL));

ALTER TABLE "webauthn_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webauthn_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_webauthn_credentials ON "webauthn_credentials"
  USING (current_setting('app.platform_bypass', true) = 'true' OR "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (current_setting('app.platform_bypass', true) = 'true' OR "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE "webauthn_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webauthn_challenges" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_webauthn_challenges ON "webauthn_challenges"
  USING (current_setting('app.platform_bypass', true) = 'true' OR "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (current_setting('app.platform_bypass', true) = 'true' OR "organization_id" = nullif(current_setting('app.organization_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION enforce_webauthn_same_organization_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'webauthn_credentials' THEN
    PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'webauthn_challenges' THEN
    PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
    PERFORM assert_same_organization('webauthn_credentials'::regclass, NEW.related_credential_id, NEW.organization_id);
    PERFORM assert_same_organization('attendance_punches'::regclass, NEW.related_attendance_punch_id, NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER webauthn_credentials_same_organization_references
  BEFORE INSERT OR UPDATE ON "webauthn_credentials"
  FOR EACH ROW EXECUTE FUNCTION enforce_webauthn_same_organization_references();
CREATE TRIGGER webauthn_challenges_same_organization_references
  BEFORE INSERT OR UPDATE ON "webauthn_challenges"
  FOR EACH ROW EXECUTE FUNCTION enforce_webauthn_same_organization_references();
