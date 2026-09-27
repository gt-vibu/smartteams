-- Files can belong to a project, as they already can to a team: its members share them, its lead
-- looks after them. The new enum value is not used by any row in this migration.
ALTER TYPE "FileAccessScope" ADD VALUE IF NOT EXISTS 'PROJECT';

ALTER TABLE "file_objects" ADD COLUMN "project_id" UUID;

ALTER TABLE "file_objects"
  ADD CONSTRAINT "file_objects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "file_objects_organization_id_project_id_idx"
  ON "file_objects"("organization_id", "project_id");
