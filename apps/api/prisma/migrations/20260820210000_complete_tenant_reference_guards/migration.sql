-- Complete the database-side tenant invariants for references that were not
-- covered by the original review trigger. These guards remain active even if
-- an application-layer validation is bypassed.

ALTER TABLE "employee_field_ownership" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "employee_field_ownership"
  ADD CONSTRAINT "employee_field_ownership_owner_check"
  CHECK (
    ("owner_source" = 'NATIVE' AND "owner_client_id" IS NULL)
    OR ("owner_source" = 'FEDERATED' AND "owner_client_id" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION enforce_additional_same_organization_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'work_locations' OR TG_TABLE_NAME = 'holidays' THEN
    IF NEW.branch_id IS NOT NULL THEN
      PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    IF NEW.branch_id IS NOT NULL THEN
      PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER work_locations_same_organization_references
  BEFORE INSERT OR UPDATE ON "work_locations"
  FOR EACH ROW EXECUTE FUNCTION enforce_additional_same_organization_references();

CREATE TRIGGER holidays_same_organization_references
  BEFORE INSERT OR UPDATE ON "holidays"
  FOR EACH ROW EXECUTE FUNCTION enforce_additional_same_organization_references();

CREATE TRIGGER user_roles_same_organization_references
  BEFORE INSERT OR UPDATE ON "user_roles"
  FOR EACH ROW EXECUTE FUNCTION enforce_additional_same_organization_references();

ALTER TABLE "employee_field_ownership" FORCE ROW LEVEL SECURITY;
