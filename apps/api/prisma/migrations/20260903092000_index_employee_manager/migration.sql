-- `employees.manager_employee_id` carried a foreign key but no index. The employee detail route
-- resolves direct reports with a filter on it, and `ON DELETE RESTRICT` makes every employee
-- delete scan for children; the only covering index was (organization_id, status), which helps
-- neither. Tenant-first, matching how every other query on this table is shaped.
CREATE INDEX IF NOT EXISTS "employees_organization_id_manager_employee_id_idx"
  ON public.employees USING btree (organization_id, manager_employee_id);
