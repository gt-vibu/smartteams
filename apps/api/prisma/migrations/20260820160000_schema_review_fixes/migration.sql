-- DropIndex
DROP INDEX "federation_capabilities_code_key";

-- AlterTable
ALTER TABLE "approval_policy_steps" ALTER COLUMN "step_number" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "attendance_approvals" ALTER COLUMN "step_number" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "employee_emergency_contacts" ALTER COLUMN "sort_order" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "external_id_mappings" ADD COLUMN     "external_version" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "federation_idempotency_records" ALTER COLUMN "response_status" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "leave_approvals" ALTER COLUMN "step_number" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "organization_federation_capabilities" ADD COLUMN     "updated_by_user_id" UUID;

-- AlterTable
ALTER TABLE "organization_settings" ALTER COLUMN "work_week_days" SET DEFAULT ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint],
ALTER COLUMN "work_week_days" SET DATA TYPE SMALLINT[],
ALTER COLUMN "standard_day_minutes" SET DATA TYPE SMALLINT,
ALTER COLUMN "payroll_day_of_month" SET DATA TYPE SMALLINT,
ALTER COLUMN "leave_year_start_month" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "pay_components" ALTER COLUMN "display_order" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "payroll_line_item_components" ALTER COLUMN "display_order" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "shift_break_rules" ALTER COLUMN "duration_minutes" SET DATA TYPE SMALLINT,
ALTER COLUMN "sequence" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "days_of_week" SET DATA TYPE SMALLINT[];

-- AlterTable
ALTER TABLE "webhook_deliveries" ALTER COLUMN "last_http_status" SET DATA TYPE SMALLINT;

-- AlterTable
ALTER TABLE "webhook_delivery_attempts" ALTER COLUMN "http_status" SET DATA TYPE SMALLINT;

-- CreateIndex
CREATE UNIQUE INDEX "federation_capabilities_code_version_key" ON "federation_capabilities"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "federation_grant_role_mappings_grant_id_priority_key" ON "federation_grant_role_mappings"("grant_id", "priority");

-- AddForeignKey
ALTER TABLE "organization_federation_capabilities" ADD CONSTRAINT "organization_federation_capabilities_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Review-only PostgreSQL invariants that are not represented by Prisma.
ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_work_week_days_check" CHECK (cardinality("work_week_days") BETWEEN 1 AND 7 AND "work_week_days" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  ADD CONSTRAINT "organization_settings_standard_day_minutes_check" CHECK ("standard_day_minutes" > 0),
  ADD CONSTRAINT "organization_settings_payroll_day_check" CHECK ("payroll_day_of_month" IS NULL OR "payroll_day_of_month" BETWEEN 1 AND 31),
  ADD CONSTRAINT "organization_settings_leave_year_start_month_check" CHECK ("leave_year_start_month" BETWEEN 1 AND 12);

ALTER TABLE "timesheet_entries"
  ADD CONSTRAINT "timesheet_entries_manual_description_check" CHECK ("source" <> 'MANUAL' OR NULLIF(btrim("description"), '') IS NOT NULL);

CREATE UNIQUE INDEX "user_invitations_active_email_key"
  ON "user_invitations" ("organization_id", "email_normalized") WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
CREATE UNIQUE INDEX "employee_emergency_contacts_primary_key"
  ON "employee_emergency_contacts" ("organization_id", "employee_id") WHERE "is_primary" = true;
CREATE UNIQUE INDEX "federation_idempotency_records_global_key"
  ON "federation_idempotency_records" ("client_id", "idempotency_key") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX "roles_system_code_key"
  ON "roles" ("code") WHERE "organization_id" IS NULL;
CREATE UNIQUE INDEX "timesheet_entries_attendance_source_key"
  ON "timesheet_entries" ("timesheet_id", "work_date", "source", "attendance_record_id") WHERE "attendance_record_id" IS NOT NULL;

-- Tenant-owned rows must not point at records owned by another organization.
CREATE OR REPLACE FUNCTION assert_same_organization(
  referenced_table regclass,
  referenced_id uuid,
  expected_organization_id uuid,
  allow_global boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  reference_exists boolean;
BEGIN
  IF referenced_id IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %s WHERE id = $1 AND (organization_id = $2 OR ($3 AND organization_id IS NULL)))',
    referenced_table
  ) INTO reference_exists USING referenced_id, expected_organization_id, allow_global;

  IF NOT reference_exists THEN
    RAISE EXCEPTION 'cross-organization reference to %', referenced_table USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_same_organization_references() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME IN (
    'roles', 'teams', 'projects', 'attendance_records', 'leave_requests', 'shifts',
    'employee_shift_assignments', 'timesheets', 'federation_grants', 'federation_request_records', 'audit_logs'
  ) THEN
    IF NEW.branch_id IS NOT NULL THEN
      PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'employees' THEN
    IF NEW.primary_branch_id IS NOT NULL THEN
      PERFORM assert_same_organization('branches'::regclass, NEW.primary_branch_id, NEW.organization_id);
    END IF;
  END IF;

  IF TG_TABLE_NAME IN (
    'employee_emergency_contacts', 'employee_branch_assignments', 'employee_field_ownership',
    'employee_employment_records', 'employee_compensation', 'employee_pay_components', 'team_members',
    'project_members', 'attendance_records', 'attendance_punches', 'leave_balances', 'leave_requests',
    'employee_shift_assignments', 'timesheets', 'payroll_line_items', 'payroll_adjustments', 'payslips'
  ) THEN
    PERFORM assert_same_organization('employees'::regclass, NEW.employee_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'employee_branch_assignments' THEN
    PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'employee_field_ownership' THEN
    NULL;
  ELSIF TG_TABLE_NAME IN ('employee_employment_records', 'employees') THEN
    IF NEW.manager_employee_id IS NOT NULL THEN
      PERFORM assert_same_organization('employees'::regclass, NEW.manager_employee_id, NEW.organization_id);
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'employee_pay_components' THEN
    PERFORM assert_same_organization('pay_components'::regclass, NEW.pay_component_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'teams' THEN
    IF NEW.team_lead_employee_id IS NOT NULL THEN
      PERFORM assert_same_organization('employees'::regclass, NEW.team_lead_employee_id, NEW.organization_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'team_members' THEN
    PERFORM assert_same_organization('teams'::regclass, NEW.team_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'project_members' THEN
    PERFORM assert_same_organization('projects'::regclass, NEW.project_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'attendance_records' THEN
    NULL;
  ELSIF TG_TABLE_NAME = 'attendance_punches' THEN
    PERFORM assert_same_organization('attendance_records'::regclass, NEW.attendance_record_id, NEW.organization_id);
    PERFORM assert_same_organization('work_locations'::regclass, NEW.work_location_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'attendance_corrections' THEN
    PERFORM assert_same_organization('attendance_records'::regclass, NEW.attendance_record_id, NEW.organization_id);
    PERFORM assert_same_organization('attendance_punches'::regclass, NEW.attendance_punch_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policies'::regclass, NEW.approval_policy_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'attendance_approvals' THEN
    PERFORM assert_same_organization('attendance_corrections'::regclass, NEW.attendance_correction_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policy_steps'::regclass, NEW.approval_policy_step_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'leave_balances' THEN
    PERFORM assert_same_organization('leave_types'::regclass, NEW.leave_type_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'leave_balance_transactions' THEN
    PERFORM assert_same_organization('leave_balances'::regclass, NEW.leave_balance_id, NEW.organization_id);
    PERFORM assert_same_organization('leave_requests'::regclass, NEW.leave_request_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'leave_requests' THEN
    PERFORM assert_same_organization('leave_types'::regclass, NEW.leave_type_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policies'::regclass, NEW.approval_policy_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'leave_approvals' THEN
    PERFORM assert_same_organization('leave_requests'::regclass, NEW.leave_request_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policy_steps'::regclass, NEW.approval_policy_step_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'employee_shift_assignments' THEN
    PERFORM assert_same_organization('shifts'::regclass, NEW.shift_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'timesheets' THEN
    PERFORM assert_same_organization('timesheet_periods'::regclass, NEW.timesheet_period_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policies'::regclass, NEW.approval_policy_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'timesheet_entries' THEN
    PERFORM assert_same_organization('timesheets'::regclass, NEW.timesheet_id, NEW.organization_id);
    PERFORM assert_same_organization('attendance_records'::regclass, NEW.attendance_record_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'timesheet_approvals' THEN
    PERFORM assert_same_organization('timesheets'::regclass, NEW.timesheet_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policy_steps'::regclass, NEW.approval_policy_step_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'payroll_runs' THEN
    PERFORM assert_same_organization('approval_policies'::regclass, NEW.approval_policy_id, NEW.organization_id);
    PERFORM assert_same_organization('payroll_runs'::regclass, NEW.correction_of_run_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'payroll_line_items' THEN
    PERFORM assert_same_organization('payroll_runs'::regclass, NEW.payroll_run_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'payroll_line_item_components' THEN
    PERFORM assert_same_organization('payroll_line_items'::regclass, NEW.payroll_line_item_id, NEW.organization_id);
    PERFORM assert_same_organization('pay_components'::regclass, NEW.pay_component_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'payroll_adjustments' THEN
    PERFORM assert_same_organization('payroll_runs'::regclass, NEW.payroll_run_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'payroll_approvals' THEN
    PERFORM assert_same_organization('payroll_runs'::regclass, NEW.payroll_run_id, NEW.organization_id);
    PERFORM assert_same_organization('approval_policy_steps'::regclass, NEW.approval_policy_step_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'payslips' THEN
    PERFORM assert_same_organization('payroll_runs'::regclass, NEW.payroll_run_id, NEW.organization_id);
    PERFORM assert_same_organization('payroll_line_items'::regclass, NEW.payroll_line_item_id, NEW.organization_id);
    PERFORM assert_same_organization('file_objects'::regclass, NEW.file_object_id, NEW.organization_id);
  END IF;

  IF TG_TABLE_NAME = 'user_roles' THEN
    PERFORM assert_same_organization('roles'::regclass, NEW.role_id, NEW.organization_id, true);
    PERFORM assert_same_organization('federation_grants'::regclass, NEW.source_federation_grant_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'approval_policy_steps' THEN
    PERFORM assert_same_organization('approval_policies'::regclass, NEW.approval_policy_id, NEW.organization_id);
    PERFORM assert_same_organization('roles'::regclass, NEW.role_id, NEW.organization_id, true);
  ELSIF TG_TABLE_NAME = 'federation_grants' THEN
    PERFORM assert_same_organization('branches'::regclass, NEW.branch_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'webhook_subscriptions' THEN
    IF NOT EXISTS (SELECT 1 FROM "webhook_signing_keys" WHERE id = NEW.signing_key_id AND client_id = NEW.client_id) THEN
      RAISE EXCEPTION 'webhook signing key belongs to a different federation client' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'webhook_deliveries' THEN
    PERFORM assert_same_organization('outbox_events'::regclass, NEW.outbox_event_id, NEW.organization_id);
    PERFORM assert_same_organization('webhook_subscriptions'::regclass, NEW.subscription_id, NEW.organization_id);
  ELSIF TG_TABLE_NAME = 'federation_grant_role_mappings' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "federation_grants" grant_row
      JOIN "roles" role_row ON role_row.id = NEW.role_id
      WHERE grant_row.id = NEW.grant_id
        AND (role_row.organization_id IS NULL OR role_row.organization_id = grant_row.organization_id)
    ) THEN
      RAISE EXCEPTION 'federation grant role mapping crosses organizations' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'file_objects' THEN
    PERFORM assert_same_organization('leave_requests'::regclass, NEW.leave_request_id, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'roles', 'approval_policy_steps', 'user_roles', 'employees', 'employee_emergency_contacts',
    'employee_branch_assignments', 'employee_field_ownership', 'employee_employment_records',
    'employee_compensation', 'employee_pay_components', 'teams', 'team_members', 'projects',
    'project_members', 'file_objects', 'attendance_records', 'attendance_punches',
    'attendance_corrections', 'attendance_approvals', 'leave_balances', 'leave_balance_transactions',
    'leave_requests', 'leave_approvals', 'employee_shift_assignments', 'timesheets', 'timesheet_entries',
    'timesheet_approvals', 'payroll_runs', 'payroll_line_items', 'payroll_line_item_components',
    'payroll_adjustments', 'payroll_approvals', 'payslips', 'federation_grants',
    'federation_grant_role_mappings', 'webhook_subscriptions', 'webhook_deliveries'
  ] LOOP
    EXECUTE format('CREATE TRIGGER same_organization_references BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_same_organization_references()', table_name);
  END LOOP;
END $$;

-- File versions inherit tenant ownership from file_objects and must not be directly enumerable cross-tenant.
ALTER TABLE "file_object_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_object_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_file_object_versions ON "file_object_versions"
  USING (
    current_setting('app.platform_bypass', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "file_objects" file_row
      WHERE file_row.id = "file_object_versions"."file_object_id"
        AND file_row.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.platform_bypass', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "file_objects" file_row
      WHERE file_row.id = "file_object_versions"."file_object_id"
        AND file_row.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  );
