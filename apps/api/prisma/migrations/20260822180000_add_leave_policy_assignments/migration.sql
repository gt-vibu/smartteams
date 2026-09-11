CREATE TABLE "leave_policy_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "source_access_mode" "AccessMode" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_policy_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_policy_assignments_organization_id_branch_id_leave_type_id_key"
  ON "leave_policy_assignments"("organization_id", "branch_id", "leave_type_id");
CREATE INDEX "leave_policy_assignments_organization_id_branch_id_created_at_idx"
  ON "leave_policy_assignments"("organization_id", "branch_id", "created_at");

ALTER TABLE "leave_policy_assignments"
  ADD CONSTRAINT "leave_policy_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_policy_assignments_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "leave_policy_assignments_leave_type_id_fkey"
  FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION enforce_leave_policy_assignment_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
  PERFORM assert_same_organization('leave_types'::regclass, NEW.leave_type_id, NEW.organization_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER leave_policy_assignments_same_organization_references
  BEFORE INSERT OR UPDATE ON "leave_policy_assignments"
  FOR EACH ROW EXECUTE FUNCTION enforce_leave_policy_assignment_organization();

ALTER TABLE "leave_policy_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leave_policy_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_leave_policy_assignments ON "leave_policy_assignments"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR "organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid
  );
