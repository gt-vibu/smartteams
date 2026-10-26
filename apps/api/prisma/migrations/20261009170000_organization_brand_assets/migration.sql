ALTER TABLE "organizations"
  ADD COLUMN "logo_file_id" UUID,
  ADD COLUMN "cover_file_id" UUID;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_logo_file_id_fkey"
    FOREIGN KEY ("logo_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "organizations_cover_file_id_fkey"
    FOREIGN KEY ("cover_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
