-- GPS capture is independent of geofence enforcement. Preserve existing attendance
-- behavior until enabled; a nullable branch setting inherits the organization default.
ALTER TABLE "organization_settings" ADD COLUMN "require_gps" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "branches" ADD COLUMN "require_gps" BOOLEAN;
