-- A project may name its lead, as a team does. Nullable: a project can exist before anyone leads
-- it, and the lead is assigned or changed from the project afterwards.
ALTER TABLE "projects" ADD COLUMN "project_lead_employee_id" UUID;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_project_lead_employee_id_fkey"
  FOREIGN KEY ("project_lead_employee_id") REFERENCES "employees"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX "projects_organization_id_project_lead_employee_id_idx"
  ON "projects"("organization_id", "project_lead_employee_id");
