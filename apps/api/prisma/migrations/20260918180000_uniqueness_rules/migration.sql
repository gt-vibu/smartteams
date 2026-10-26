-- Uniqueness the application already checks, made certain by the database, so two requests that
-- arrive together cannot both pass the check.

-- One Aadhaar number per organization, compared by a keyed fingerprint (the number itself stays
-- encrypted). Existing rows gain a fingerprint the next time their Aadhaar is saved.
ALTER TABLE "employee_personal_profiles" ADD COLUMN "aadhaar_number_hash" TEXT;
CREATE UNIQUE INDEX "employee_personal_profiles_organization_id_aadhaar_number_hash_key"
  ON "employee_personal_profiles"("organization_id", "aadhaar_number_hash");

-- The indexes below are created only when existing data already satisfies them, so a database
-- holding duplicates made before this rule still migrates; the application refuses new ones either
-- way, and the duplicates can be cleaned up and this re-run by hand.
DO $$
BEGIN
  -- One employee per work email in an organization (the column is citext, so case-insensitive).
  IF NOT EXISTS (
    SELECT 1 FROM "employees" WHERE "work_email" IS NOT NULL
    GROUP BY "organization_id", "work_email" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "employees_organization_id_work_email_key"
      ON "employees"("organization_id", "work_email") WHERE "work_email" IS NOT NULL;
  ELSE
    RAISE NOTICE 'employees has duplicate work emails; unique index not created';
  END IF;

  -- One open assignment per employee per project.
  IF NOT EXISTS (
    SELECT 1 FROM "project_members" WHERE "ends_on" IS NULL
    GROUP BY "organization_id", "project_id", "employee_id" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "project_members_one_open_assignment_key"
      ON "project_members"("organization_id", "project_id", "employee_id") WHERE "ends_on" IS NULL;
  ELSE
    RAISE NOTICE 'project_members has duplicate open assignments; unique index not created';
  END IF;

  -- One open membership per employee per team.
  IF NOT EXISTS (
    SELECT 1 FROM "team_members" WHERE "left_at" IS NULL
    GROUP BY "organization_id", "team_id", "employee_id" HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "team_members_one_open_membership_key"
      ON "team_members"("organization_id", "team_id", "employee_id") WHERE "left_at" IS NULL;
  ELSE
    RAISE NOTICE 'team_members has duplicate open memberships; unique index not created';
  END IF;
END $$;
