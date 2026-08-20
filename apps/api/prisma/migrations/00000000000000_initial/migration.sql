--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: AccessMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccessMode" AS ENUM (
    'NATIVE',
    'FEDERATION',
    'PLATFORM'
);


--
-- Name: ApprovalDomain; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalDomain" AS ENUM (
    'LEAVE',
    'ATTENDANCE_CORRECTION',
    'TIMESHEET',
    'PAYROLL'
);


--
-- Name: ApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApprovalStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: ApproverType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApproverType" AS ENUM (
    'ROLE',
    'USER',
    'MANAGER'
);


--
-- Name: AttendancePunchSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendancePunchSource" AS ENUM (
    'NATIVE',
    'FEDERATION',
    'ADMIN_CORRECTION',
    'IMPORT'
);


--
-- Name: AttendancePunchType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendancePunchType" AS ENUM (
    'IN',
    'OUT'
);


--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'OPEN',
    'COMPLETED',
    'CORRECTED',
    'APPROVED',
    'REJECTED'
);


--
-- Name: AuditActorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuditActorType" AS ENUM (
    'USER',
    'FEDERATION_CLIENT',
    'PLATFORM_OPERATOR',
    'SYSTEM'
);


--
-- Name: AuthSessionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuthSessionStatus" AS ENUM (
    'ACTIVE',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: CapabilityStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CapabilityStatus" AS ENUM (
    'ENABLED',
    'DISABLED'
);


--
-- Name: CredentialStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CredentialStatus" AS ENUM (
    'ACTIVE',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: EmployeeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeeStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'TERMINATED'
);


--
-- Name: EmploymentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmploymentType" AS ENUM (
    'FULL_TIME',
    'PART_TIME',
    'CONTRACTOR',
    'TEMPORARY',
    'INTERN',
    'OTHER'
);


--
-- Name: ExternalEntityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExternalEntityType" AS ENUM (
    'ORGANIZATION',
    'BRANCH',
    'USER',
    'EMPLOYEE',
    'ATTENDANCE',
    'LEAVE_REQUEST',
    'TIMESHEET',
    'PAYROLL_RUN',
    'PAYSLIP',
    'FILE'
);


--
-- Name: FederationClientStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FederationClientStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: FederationRequestResult; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FederationRequestResult" AS ENUM (
    'ACCEPTED',
    'REJECTED',
    'REPLAYED',
    'DUPLICATE',
    'INVALID_SIGNATURE',
    'INVALID_SCOPE',
    'INVALID_TENANT',
    'RATE_LIMITED',
    'ERROR'
);


--
-- Name: FilePurpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FilePurpose" AS ENUM (
    'PROFILE_IMAGE',
    'RESUME',
    'EMPLOYEE_DOCUMENT',
    'LEAVE_ATTACHMENT',
    'PAYSLIP',
    'PAYROLL_EXPORT',
    'IMPORT',
    'OTHER'
);


--
-- Name: FileStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FileStatus" AS ENUM (
    'PENDING_UPLOAD',
    'AVAILABLE',
    'QUARANTINED',
    'DELETED',
    'FAILED'
);


--
-- Name: GeofenceMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GeofenceMode" AS ENUM (
    'DISABLED',
    'FLAG_ONLY',
    'REQUIRED'
);


--
-- Name: GrantEffect; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GrantEffect" AS ENUM (
    'ALLOW',
    'DENY'
);


--
-- Name: GrantStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GrantStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'REVOKED',
    'EXPIRED'
);


--
-- Name: IdempotencyStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IdempotencyStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED',
    'EXPIRED'
);


--
-- Name: IdentityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IdentityType" AS ENUM (
    'NATIVE',
    'FEDERATED'
);


--
-- Name: LeaveAccrualType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeaveAccrualType" AS ENUM (
    'NONE',
    'FIXED_ANNUAL',
    'MONTHLY',
    'PER_PAY_PERIOD',
    'MANUAL'
);


--
-- Name: LeaveBalanceTransactionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeaveBalanceTransactionType" AS ENUM (
    'OPENING',
    'ACCRUAL',
    'ADJUSTMENT',
    'RESERVATION',
    'RELEASE',
    'USAGE',
    'EXPIRY',
    'REVERSAL'
);


--
-- Name: LeaveRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeaveRequestStatus" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: MembershipStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MembershipStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'REMOVED'
);


--
-- Name: OrganizationSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrganizationSource" AS ENUM (
    'NATIVE',
    'BLIZBOOKS'
);


--
-- Name: OrganizationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OrganizationStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED'
);


--
-- Name: OutboxStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'READY',
    'FAILED',
    'COMPLETED',
    'DEAD_LETTERED'
);


--
-- Name: OwnerSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."OwnerSource" AS ENUM (
    'NATIVE',
    'BLIZBOOKS'
);


--
-- Name: PayComponentCalculationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayComponentCalculationType" AS ENUM (
    'FIXED',
    'PERCENTAGE_OF_BASE',
    'FORMULA'
);


--
-- Name: PayComponentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayComponentType" AS ENUM (
    'EARNING',
    'DEDUCTION',
    'EMPLOYER_CONTRIBUTION'
);


--
-- Name: PayFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayFrequency" AS ENUM (
    'WEEKLY',
    'BIWEEKLY',
    'SEMIMONTHLY',
    'MONTHLY'
);


--
-- Name: PayType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayType" AS ENUM (
    'SALARY',
    'HOURLY',
    'DAILY',
    'PER_SHIFT'
);


--
-- Name: PayrollAdjustmentSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayrollAdjustmentSource" AS ENUM (
    'NATIVE',
    'FEDERATION',
    'IMPORT',
    'SYSTEM'
);


--
-- Name: PayrollAdjustmentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayrollAdjustmentType" AS ENUM (
    'BONUS',
    'DEDUCTION',
    'REIMBURSEMENT',
    'OVERTIME',
    'TAX',
    'OTHER'
);


--
-- Name: PayrollRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayrollRunStatus" AS ENUM (
    'DRAFT',
    'CALCULATED',
    'APPROVED',
    'RELEASED',
    'LOCKED',
    'CORRECTED',
    'VOIDED'
);


--
-- Name: ProjectStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProjectStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED',
    'ARCHIVED'
);


--
-- Name: RoleScope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RoleScope" AS ENUM (
    'PLATFORM',
    'ORGANIZATION',
    'BRANCH'
);


--
-- Name: TeamStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TeamStatus" AS ENUM (
    'ACTIVE',
    'ARCHIVED'
);


--
-- Name: TimesheetEntrySource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimesheetEntrySource" AS ENUM (
    'ATTENDANCE',
    'MANUAL',
    'FEDERATION',
    'IMPORT'
);


--
-- Name: TimesheetPeriodType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimesheetPeriodType" AS ENUM (
    'WEEKLY',
    'BIWEEKLY',
    'MONTHLY',
    'CUSTOM'
);


--
-- Name: TimesheetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimesheetStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'LOCKED'
);


--
-- Name: WebhookDeliveryStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WebhookDeliveryStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'FAILED',
    'REPLAY_REQUESTED',
    'DEAD_LETTERED'
);


--
-- Name: WebhookSubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WebhookSubscriptionStatus" AS ENUM (
    'ACTIVE',
    'PAUSED',
    'REVOKED'
);


--
-- Name: prevent_append_only_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_append_only_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = '55006';
END;
$$;


--
-- Name: prevent_locked_payroll_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_locked_payroll_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  payroll_run_id uuid;
  payroll_status "PayrollRunStatus";
BEGIN
  IF TG_TABLE_NAME = 'payroll_line_items' THEN
    payroll_run_id := OLD.payroll_run_id;
  ELSIF TG_TABLE_NAME = 'payroll_line_item_components' THEN
    SELECT pli.payroll_run_id INTO payroll_run_id FROM "payroll_line_items" pli WHERE pli.id = OLD.payroll_line_item_id;
  ELSE
    payroll_run_id := OLD.payroll_run_id;
  END IF;
  SELECT status INTO payroll_status FROM "payroll_runs" WHERE id = payroll_run_id;
  IF payroll_status IN ('RELEASED', 'LOCKED', 'CORRECTED', 'VOIDED') THEN
    RAISE EXCEPTION 'locked payroll data cannot be changed' USING ERRCODE = '55006';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approval_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_policies (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    domain public."ApprovalDomain" NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.approval_policies FORCE ROW LEVEL SECURITY;


--
-- Name: approval_policy_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_policy_steps (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    approval_policy_id uuid NOT NULL,
    step_number integer NOT NULL,
    approver_type public."ApproverType" NOT NULL,
    role_id uuid,
    approver_user_id uuid,
    required boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT approval_policy_steps_approver_check CHECK ((((approver_type = 'ROLE'::public."ApproverType") AND (role_id IS NOT NULL) AND (approver_user_id IS NULL)) OR ((approver_type = 'USER'::public."ApproverType") AND (role_id IS NULL) AND (approver_user_id IS NOT NULL)) OR ((approver_type = 'MANAGER'::public."ApproverType") AND (role_id IS NULL) AND (approver_user_id IS NULL))))
);

ALTER TABLE ONLY public.approval_policy_steps FORCE ROW LEVEL SECURITY;


--
-- Name: attendance_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_approvals (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    attendance_correction_id uuid NOT NULL,
    approver_user_id uuid NOT NULL,
    approval_policy_step_id uuid,
    step_number integer NOT NULL,
    status public."ApprovalStatus" NOT NULL,
    comment text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.attendance_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: attendance_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_corrections (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    attendance_record_id uuid NOT NULL,
    attendance_punch_id uuid,
    approval_policy_id uuid,
    requested_by_user_id uuid,
    requested_by_client_id uuid,
    reason text NOT NULL,
    before_snapshot jsonb NOT NULL,
    after_snapshot jsonb NOT NULL,
    status public."ApprovalStatus" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.attendance_corrections FORCE ROW LEVEL SECURITY;


--
-- Name: attendance_punches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_punches (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    attendance_record_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    punch_type public."AttendancePunchType" NOT NULL,
    occurred_at timestamp(6) with time zone NOT NULL,
    source public."AttendancePunchSource" NOT NULL,
    captured_by_user_id uuid,
    external_id text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    accuracy_meters numeric(8,2),
    work_location_id uuid,
    is_within_geofence boolean,
    distance_from_location_meters numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT attendance_punches_accuracy_check CHECK (((accuracy_meters IS NULL) OR (accuracy_meters >= (0)::numeric))),
    CONSTRAINT attendance_punches_coordinates_pair_check CHECK (((latitude IS NULL) = (longitude IS NULL))),
    CONSTRAINT attendance_punches_distance_check CHECK (((distance_from_location_meters IS NULL) OR (distance_from_location_meters >= (0)::numeric))),
    CONSTRAINT attendance_punches_latitude_check CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT attendance_punches_longitude_check CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))
);

ALTER TABLE ONLY public.attendance_punches FORCE ROW LEVEL SECURITY;


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    branch_id uuid,
    work_date date NOT NULL,
    status public."AttendanceStatus" DEFAULT 'OPEN'::public."AttendanceStatus" NOT NULL,
    scheduled_minutes integer,
    worked_minutes integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    source_access_mode public."AccessMode" NOT NULL,
    external_id text,
    correction_note text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.attendance_records FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid NOT NULL,
    organization_id uuid,
    branch_id uuid,
    actor_type public."AuditActorType" NOT NULL,
    actor_user_id uuid,
    actor_client_id uuid,
    access_mode public."AccessMode" NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    request_id uuid,
    before_state jsonb,
    after_state jsonb,
    reason text,
    ip_address inet,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT audit_logs_actor_check CHECK ((((actor_type = 'USER'::public."AuditActorType") AND (actor_user_id IS NOT NULL) AND (actor_client_id IS NULL)) OR ((actor_type = 'FEDERATION_CLIENT'::public."AuditActorType") AND (actor_user_id IS NULL) AND (actor_client_id IS NOT NULL)) OR ((actor_type = 'PLATFORM_OPERATOR'::public."AuditActorType") AND (actor_user_id IS NOT NULL) AND (actor_client_id IS NULL)) OR ((actor_type = 'SYSTEM'::public."AuditActorType") AND (actor_user_id IS NULL) AND (actor_client_id IS NULL))))
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid,
    refresh_token_hash text NOT NULL,
    token_family uuid NOT NULL,
    status public."AuthSessionStatus" DEFAULT 'ACTIVE'::public."AuthSessionStatus" NOT NULL,
    ip_address inet,
    user_agent text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    revocation_reason text
);

ALTER TABLE ONLY public.auth_sessions FORCE ROW LEVEL SECURITY;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    source public."OrganizationSource" NOT NULL,
    external_id text,
    status public."OrganizationStatus" DEFAULT 'ACTIVE'::public."OrganizationStatus" NOT NULL,
    timezone text,
    geofence_mode public."GeofenceMode",
    address jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.branches FORCE ROW LEVEL SECURITY;


--
-- Name: employee_branch_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_branch_assignments (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    source_access_mode public."AccessMode" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT employee_branch_assignments_date_order_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)))
);

ALTER TABLE ONLY public.employee_branch_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: employee_compensation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_compensation (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    pay_type public."PayType" NOT NULL,
    pay_frequency public."PayFrequency" NOT NULL,
    base_amount numeric(14,2) NOT NULL,
    currency_code character(3) NOT NULL,
    overtime_multiplier numeric(6,3) NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT employee_compensation_amount_check CHECK ((base_amount >= (0)::numeric)),
    CONSTRAINT employee_compensation_date_order_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT employee_compensation_overtime_check CHECK ((overtime_multiplier >= (0)::numeric))
);

ALTER TABLE ONLY public.employee_compensation FORCE ROW LEVEL SECURITY;


--
-- Name: employee_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_emergency_contacts (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    name text NOT NULL,
    relationship text NOT NULL,
    phone text NOT NULL,
    email public.citext,
    is_primary boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.employee_emergency_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: employee_employment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_employment_records (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    job_title text,
    department text,
    manager_employee_id uuid,
    employment_type public."EmploymentType" NOT NULL,
    status public."EmployeeStatus" NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    source_access_mode public."AccessMode" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT employee_employment_records_date_order_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from)))
);

ALTER TABLE ONLY public.employee_employment_records FORCE ROW LEVEL SECURITY;


--
-- Name: employee_field_ownership; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_field_ownership (
    employee_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    field_name text NOT NULL,
    owner_source public."OwnerSource" NOT NULL,
    owner_client_id uuid,
    last_external_version text,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.employee_field_ownership FORCE ROW LEVEL SECURITY;


--
-- Name: employee_pay_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_pay_components (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    pay_component_id uuid NOT NULL,
    amount numeric(14,2),
    percentage numeric(8,4),
    formula_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    source_access_mode public."AccessMode" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT employee_pay_components_amount_check CHECK (((amount IS NULL) OR (amount >= (0)::numeric))),
    CONSTRAINT employee_pay_components_date_order_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT employee_pay_components_percentage_check CHECK (((percentage IS NULL) OR (percentage >= (0)::numeric)))
);

ALTER TABLE ONLY public.employee_pay_components FORCE ROW LEVEL SECURITY;


--
-- Name: employee_shift_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_shift_assignments (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    shift_id uuid NOT NULL,
    branch_id uuid,
    starts_on date NOT NULL,
    ends_on date,
    source_access_mode public."AccessMode" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT employee_shift_assignments_date_order_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)))
);

ALTER TABLE ONLY public.employee_shift_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    user_id uuid,
    employee_number text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    preferred_name text,
    work_email public.citext,
    personal_email public.citext,
    phone text,
    identity_source public."IdentityType" NOT NULL,
    external_id text,
    status public."EmployeeStatus" DEFAULT 'ACTIVE'::public."EmployeeStatus" NOT NULL,
    employment_type public."EmploymentType" NOT NULL,
    date_of_joining date,
    date_of_leaving date,
    manager_employee_id uuid,
    geofence_mode public."GeofenceMode",
    primary_branch_id uuid,
    owned_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    deactivated_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT employees_date_order_check CHECK (((date_of_leaving IS NULL) OR (date_of_joining IS NULL) OR (date_of_leaving >= date_of_joining))),
    CONSTRAINT employees_manager_not_self_check CHECK (((manager_employee_id IS NULL) OR (manager_employee_id <> id)))
);

ALTER TABLE ONLY public.employees FORCE ROW LEVEL SECURITY;


--
-- Name: external_id_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_id_mappings (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    entity_type public."ExternalEntityType" NOT NULL,
    external_id text NOT NULL,
    local_entity_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.external_id_mappings FORCE ROW LEVEL SECURITY;


--
-- Name: federation_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_capabilities (
    id uuid NOT NULL,
    code text NOT NULL,
    version text NOT NULL,
    description text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: federation_client_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_client_credentials (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    secret_hash text NOT NULL,
    key_id text NOT NULL,
    status public."CredentialStatus" NOT NULL,
    valid_from timestamp(6) with time zone NOT NULL,
    valid_until timestamp(6) with time zone,
    last_used_at timestamp(6) with time zone,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(6) with time zone
);


--
-- Name: federation_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_clients (
    id uuid NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    home_organization_id uuid,
    status public."FederationClientStatus" DEFAULT 'ACTIVE'::public."FederationClientStatus" NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    expires_at timestamp(6) with time zone,
    mtls_required boolean DEFAULT false NOT NULL,
    allowed_certificate_fingerprints text[] DEFAULT ARRAY[]::text[],
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    revocation_reason text
);


--
-- Name: federation_grant_role_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_grant_role_mappings (
    id uuid NOT NULL,
    grant_id uuid NOT NULL,
    role_id uuid NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: federation_grant_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_grant_scopes (
    grant_id uuid NOT NULL,
    scope_id uuid NOT NULL
);


--
-- Name: federation_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_grants (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    effect public."GrantEffect" NOT NULL,
    status public."GrantStatus" DEFAULT 'ACTIVE'::public."GrantStatus" NOT NULL,
    starts_at timestamp(6) with time zone NOT NULL,
    ends_at timestamp(6) with time zone,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone,
    suspended_at timestamp(6) with time zone,
    suspension_reason text
);

ALTER TABLE ONLY public.federation_grants FORCE ROW LEVEL SECURITY;


--
-- Name: federation_idempotency_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_idempotency_records (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    organization_id uuid,
    idempotency_key text NOT NULL,
    request_hash character(64) NOT NULL,
    status public."IdempotencyStatus" NOT NULL,
    response_status integer,
    response_ciphertext bytea,
    resource_type text,
    resource_id uuid,
    started_at timestamp(6) with time zone NOT NULL,
    completed_at timestamp(6) with time zone,
    expires_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.federation_idempotency_records FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE federation_idempotency_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.federation_idempotency_records IS 'Durable replay result store; Redis may coordinate locks, but PostgreSQL is authoritative.';


--
-- Name: federation_request_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_request_records (
    id uuid NOT NULL,
    client_id uuid,
    organization_id uuid,
    branch_id uuid,
    correlation_id uuid NOT NULL,
    request_id uuid NOT NULL,
    method text NOT NULL,
    path text NOT NULL,
    body_hash character(64) NOT NULL,
    actor_external_id text,
    target_external_id text,
    nonce_hash character(64),
    signature_key_id text,
    mtls_fingerprint text,
    result public."FederationRequestResult" NOT NULL,
    rejection_reason text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.federation_request_records FORCE ROW LEVEL SECURITY;


--
-- Name: federation_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.federation_scopes (
    id uuid NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: file_object_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_object_versions (
    id uuid NOT NULL,
    file_object_id uuid NOT NULL,
    s3_version_id text NOT NULL,
    byte_size bigint NOT NULL,
    checksum_sha256 character(64),
    uploaded_at timestamp(6) with time zone NOT NULL,
    created_by_user_id uuid,
    is_current boolean DEFAULT false NOT NULL
);


--
-- Name: file_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_objects (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    uploaded_by_user_id uuid,
    employee_id uuid,
    leave_request_id uuid,
    purpose public."FilePurpose" NOT NULL,
    status public."FileStatus" DEFAULT 'PENDING_UPLOAD'::public."FileStatus" NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    original_name text NOT NULL,
    content_type text NOT NULL,
    byte_size bigint NOT NULL,
    checksum_sha256 character(64),
    kms_key_id text,
    current_version_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    deleted_at timestamp(6) with time zone,
    CONSTRAINT file_objects_leave_attachment_check CHECK ((((purpose = 'LEAVE_ATTACHMENT'::public."FilePurpose") AND (leave_request_id IS NOT NULL)) OR (purpose <> 'LEAVE_ATTACHMENT'::public."FilePurpose")))
);

ALTER TABLE ONLY public.file_objects FORCE ROW LEVEL SECURITY;


--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    holiday_date date NOT NULL,
    name text NOT NULL,
    is_optional boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source_access_mode public."AccessMode" NOT NULL,
    external_id text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.holidays FORCE ROW LEVEL SECURITY;


--
-- Name: leave_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_approvals (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    leave_request_id uuid NOT NULL,
    approver_user_id uuid NOT NULL,
    approval_policy_step_id uuid,
    step_number integer NOT NULL,
    status public."ApprovalStatus" NOT NULL,
    comment text,
    decided_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.leave_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: leave_balance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_balance_transactions (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    leave_balance_id uuid NOT NULL,
    leave_request_id uuid,
    transaction_type public."LeaveBalanceTransactionType" NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text NOT NULL,
    idempotency_key text,
    created_by_user_id uuid,
    created_by_client_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.leave_balance_transactions FORCE ROW LEVEL SECURITY;


--
-- Name: leave_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_balances (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    opening_amount numeric(10,2) NOT NULL,
    accrued_amount numeric(10,2) NOT NULL,
    used_amount numeric(10,2) NOT NULL,
    reserved_amount numeric(10,2) NOT NULL,
    available_amount numeric(10,2) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT leave_balances_amounts_check CHECK (((opening_amount >= (0)::numeric) AND (accrued_amount >= (0)::numeric) AND (used_amount >= (0)::numeric) AND (reserved_amount >= (0)::numeric) AND (available_amount >= (0)::numeric))),
    CONSTRAINT leave_balances_period_order_check CHECK ((period_end >= period_start))
);

ALTER TABLE ONLY public.leave_balances FORCE ROW LEVEL SECURITY;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    branch_id uuid,
    leave_type_id uuid NOT NULL,
    approval_policy_id uuid,
    start_date date NOT NULL,
    end_date date NOT NULL,
    requested_days numeric(8,2) NOT NULL,
    reason text,
    status public."LeaveRequestStatus" DEFAULT 'DRAFT'::public."LeaveRequestStatus" NOT NULL,
    source_access_mode public."AccessMode" NOT NULL,
    external_id text,
    submitted_at timestamp(6) with time zone,
    decided_at timestamp(6) with time zone,
    cancelled_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT leave_requests_date_order_check CHECK ((end_date >= start_date)),
    CONSTRAINT leave_requests_days_check CHECK ((requested_days > (0)::numeric))
);

ALTER TABLE ONLY public.leave_requests FORCE ROW LEVEL SECURITY;


--
-- Name: leave_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_types (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    paid boolean DEFAULT true NOT NULL,
    accrual_type public."LeaveAccrualType" NOT NULL,
    annual_allowance numeric(10,2),
    monthly_accrual numeric(10,2),
    carryover_limit numeric(10,2),
    requires_attachment boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.leave_types FORCE ROW LEVEL SECURITY;


--
-- Name: organization_federation_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_federation_capabilities (
    organization_id uuid NOT NULL,
    capability_id uuid NOT NULL,
    status public."CapabilityStatus" NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled_at timestamp(6) with time zone,
    disabled_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.organization_federation_capabilities FORCE ROW LEVEL SECURITY;


--
-- Name: organization_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_settings (
    organization_id uuid NOT NULL,
    work_week_days integer[] DEFAULT ARRAY[1, 2, 3, 4, 5],
    standard_day_minutes integer DEFAULT 480 NOT NULL,
    payroll_frequency public."PayFrequency" DEFAULT 'MONTHLY'::public."PayFrequency" NOT NULL,
    payroll_day_of_month integer,
    leave_year_start_month integer DEFAULT 1 NOT NULL,
    geofence_mode public."GeofenceMode" DEFAULT 'DISABLED'::public."GeofenceMode" NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.organization_settings FORCE ROW LEVEL SECURITY;


--
-- Name: organization_source_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_source_changes (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    from_source public."OrganizationSource" NOT NULL,
    to_source public."OrganizationSource" NOT NULL,
    reason text NOT NULL,
    requested_by_user_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.organization_source_changes FORCE ROW LEVEL SECURITY;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid NOT NULL,
    name text NOT NULL,
    slug public.citext NOT NULL,
    source public."OrganizationSource" NOT NULL,
    external_id text,
    status public."OrganizationStatus" DEFAULT 'ACTIVE'::public."OrganizationStatus" NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    currency_code character(3) NOT NULL,
    locale text DEFAULT 'en-IN'::text NOT NULL,
    deactivated_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL
);

ALTER TABLE ONLY public.organizations FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id uuid NOT NULL,
    event_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    aggregate_version integer NOT NULL,
    event_type text NOT NULL,
    schema_version text NOT NULL,
    payload jsonb NOT NULL,
    correlation_id uuid NOT NULL,
    causation_id uuid,
    status public."OutboxStatus" DEFAULT 'PENDING'::public."OutboxStatus" NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_error_code text,
    last_error_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.outbox_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE outbox_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.outbox_events IS 'Must be written in the same domain transaction as the externally observable mutation; webhook delivery is asynchronous.';


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(6) with time zone NOT NULL,
    used_at timestamp(6) with time zone,
    revoked_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pay_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pay_components (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    component_type public."PayComponentType" NOT NULL,
    calculation_type public."PayComponentCalculationType" NOT NULL,
    formula_definition jsonb,
    is_taxable boolean NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.pay_components FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_adjustments (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    payroll_run_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    type public."PayrollAdjustmentType" NOT NULL,
    source public."PayrollAdjustmentSource" NOT NULL,
    description text NOT NULL,
    amount numeric(14,2) NOT NULL,
    taxable boolean NOT NULL,
    external_id text,
    created_by_user_id uuid,
    created_by_client_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payroll_adjustments_amount_check CHECK ((amount <> (0)::numeric))
);

ALTER TABLE ONLY public.payroll_adjustments FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_approvals (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    payroll_run_id uuid NOT NULL,
    approver_user_id uuid NOT NULL,
    approval_policy_step_id uuid,
    status public."ApprovalStatus" NOT NULL,
    comment text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.payroll_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_line_item_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_line_item_components (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    payroll_line_item_id uuid NOT NULL,
    pay_component_id uuid NOT NULL,
    component_code text NOT NULL,
    component_name text NOT NULL,
    component_type public."PayComponentType" NOT NULL,
    calculation_type public."PayComponentCalculationType" NOT NULL,
    quantity numeric(14,4),
    rate numeric(14,6),
    amount numeric(14,2) NOT NULL,
    is_taxable boolean NOT NULL,
    calculation_snapshot jsonb NOT NULL,
    display_order integer NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payroll_line_item_components_amount_check CHECK ((amount >= (0)::numeric))
);

ALTER TABLE ONLY public.payroll_line_item_components FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_line_items (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    payroll_run_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    gross_amount numeric(14,2) NOT NULL,
    deduction_amount numeric(14,2) NOT NULL,
    net_amount numeric(14,2) NOT NULL,
    regular_amount numeric(14,2) NOT NULL,
    overtime_amount numeric(14,2) NOT NULL,
    leave_amount numeric(14,2) NOT NULL,
    input_snapshot jsonb NOT NULL,
    calculation_breakdown jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payroll_line_items_amounts_check CHECK (((gross_amount >= (0)::numeric) AND (deduction_amount >= (0)::numeric) AND (net_amount >= (0)::numeric)))
);

ALTER TABLE ONLY public.payroll_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_runs (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    pay_frequency public."PayFrequency" NOT NULL,
    currency_code character(3) NOT NULL,
    approval_policy_id uuid,
    status public."PayrollRunStatus" DEFAULT 'DRAFT'::public."PayrollRunStatus" NOT NULL,
    calculation_version text NOT NULL,
    input_snapshot_hash character(64) NOT NULL,
    calculation_hash character(64),
    calculated_at timestamp(6) with time zone,
    approved_at timestamp(6) with time zone,
    released_at timestamp(6) with time zone,
    locked_at timestamp(6) with time zone,
    correction_of_run_id uuid,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT payroll_runs_date_order_check CHECK ((period_end >= period_start))
);

ALTER TABLE ONLY public.payroll_runs FORCE ROW LEVEL SECURITY;


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    payroll_run_id uuid NOT NULL,
    payroll_line_item_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    file_object_id uuid,
    status public."FileStatus" NOT NULL,
    issued_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.payslips FORCE ROW LEVEL SECURITY;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid NOT NULL,
    key text NOT NULL,
    description text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: platform_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_permissions (
    id uuid NOT NULL,
    key text NOT NULL,
    description text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: platform_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: platform_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_roles (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: project_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_members (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    project_role text,
    allocation_percentage numeric(5,2),
    starts_on date NOT NULL,
    ends_on date,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT project_members_allocation_check CHECK (((allocation_percentage IS NULL) OR ((allocation_percentage >= (0)::numeric) AND (allocation_percentage <= (100)::numeric)))),
    CONSTRAINT project_members_date_order_check CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)))
);

ALTER TABLE ONLY public.project_members FORCE ROW LEVEL SECURITY;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status public."ProjectStatus" DEFAULT 'PLANNED'::public."ProjectStatus" NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.projects FORCE ROW LEVEL SECURITY;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid NOT NULL,
    organization_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    scope public."RoleScope" NOT NULL,
    branch_id uuid,
    is_system boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.roles FORCE ROW LEVEL SECURITY;


--
-- Name: shift_break_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_break_rules (
    id uuid NOT NULL,
    shift_id uuid NOT NULL,
    name text NOT NULL,
    duration_minutes integer NOT NULL,
    is_paid boolean NOT NULL,
    sequence integer NOT NULL,
    CONSTRAINT shift_break_rules_duration_check CHECK ((duration_minutes > 0))
);


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    code text NOT NULL,
    name text NOT NULL,
    days_of_week integer[],
    starts_at time(6) without time zone NOT NULL,
    ends_at time(6) without time zone NOT NULL,
    crosses_midnight boolean DEFAULT false NOT NULL,
    break_minutes integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT shifts_break_minutes_check CHECK ((break_minutes >= 0))
);

ALTER TABLE ONLY public.shifts FORCE ROW LEVEL SECURITY;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    team_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    joined_at date NOT NULL,
    left_at date,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT team_members_date_order_check CHECK (((left_at IS NULL) OR (left_at >= joined_at)))
);

ALTER TABLE ONLY public.team_members FORCE ROW LEVEL SECURITY;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    description text,
    team_lead_employee_id uuid,
    status public."TeamStatus" DEFAULT 'ACTIVE'::public."TeamStatus" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.teams FORCE ROW LEVEL SECURITY;


--
-- Name: timesheet_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_approvals (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    timesheet_id uuid NOT NULL,
    approver_user_id uuid NOT NULL,
    approval_policy_step_id uuid,
    status public."ApprovalStatus" NOT NULL,
    comment text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.timesheet_approvals FORCE ROW LEVEL SECURITY;


--
-- Name: timesheet_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_entries (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    timesheet_id uuid NOT NULL,
    attendance_record_id uuid,
    work_date date NOT NULL,
    minutes integer NOT NULL,
    regular_minutes integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    source public."TimesheetEntrySource" NOT NULL,
    description text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT timesheet_entries_minutes_check CHECK (((minutes >= 0) AND (regular_minutes >= 0) AND (overtime_minutes >= 0)))
);

ALTER TABLE ONLY public.timesheet_entries FORCE ROW LEVEL SECURITY;


--
-- Name: timesheet_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_periods (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    period_type public."TimesheetPeriodType" NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status public."TimesheetStatus" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT timesheet_periods_date_order_check CHECK ((period_end >= period_start))
);

ALTER TABLE ONLY public.timesheet_periods FORCE ROW LEVEL SECURITY;


--
-- Name: timesheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheets (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    timesheet_period_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    approval_policy_id uuid,
    branch_id uuid,
    status public."TimesheetStatus" NOT NULL,
    total_minutes integer DEFAULT 0 NOT NULL,
    regular_minutes integer DEFAULT 0 NOT NULL,
    overtime_minutes integer DEFAULT 0 NOT NULL,
    source_access_mode public."AccessMode" NOT NULL,
    external_id text,
    submitted_at timestamp(6) with time zone,
    approved_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT timesheets_minutes_check CHECK (((total_minutes >= 0) AND (regular_minutes >= 0) AND (overtime_minutes >= 0)))
);

ALTER TABLE ONLY public.timesheets FORCE ROW LEVEL SECURITY;


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    email_normalized text NOT NULL,
    token_hash text NOT NULL,
    invited_by_user_id uuid NOT NULL,
    accepted_by_user_id uuid,
    expires_at timestamp(6) with time zone NOT NULL,
    accepted_at timestamp(6) with time zone,
    revoked_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.user_invitations FORCE ROW LEVEL SECURITY;


--
-- Name: user_organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_organizations (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status public."MembershipStatus" NOT NULL,
    source public."OrganizationSource" NOT NULL,
    joined_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    removed_at timestamp(6) with time zone,
    external_id text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.user_organizations FORCE ROW LEVEL SECURITY;


--
-- Name: user_platform_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_platform_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    granted_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(6) with time zone
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role_id uuid NOT NULL,
    branch_id uuid,
    assignment_source public."AccessMode" NOT NULL,
    source_federation_grant_id uuid,
    granted_by_user_id uuid,
    starts_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ends_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE ONLY public.user_roles FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email public.citext NOT NULL,
    email_normalized text NOT NULL,
    display_name text NOT NULL,
    password_hash text,
    identity_type public."IdentityType" DEFAULT 'NATIVE'::public."IdentityType" NOT NULL,
    external_identity_provider text,
    external_identity_id text,
    external_organization_id text,
    is_active boolean DEFAULT true NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    last_login_at timestamp(6) with time zone,
    deactivated_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid NOT NULL,
    outbox_event_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    status public."WebhookDeliveryStatus" DEFAULT 'PENDING'::public."WebhookDeliveryStatus" NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp(6) with time zone NOT NULL,
    last_http_status integer,
    last_response_excerpt text,
    last_error_code text,
    delivered_at timestamp(6) with time zone,
    replay_requested_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL
);

ALTER TABLE ONLY public.webhook_deliveries FORCE ROW LEVEL SECURITY;


--
-- Name: webhook_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_delivery_attempts (
    id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    attempt_number integer NOT NULL,
    request_id uuid NOT NULL,
    signature_key_id text NOT NULL,
    request_body_hash character(64) NOT NULL,
    http_status integer,
    response_excerpt text,
    error_code text,
    started_at timestamp(6) with time zone NOT NULL,
    finished_at timestamp(6) with time zone
);


--
-- Name: webhook_signing_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_signing_keys (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    key_id text NOT NULL,
    secret_ref text NOT NULL,
    algorithm text NOT NULL,
    status public."CredentialStatus" NOT NULL,
    valid_from timestamp(6) with time zone NOT NULL,
    valid_until timestamp(6) with time zone,
    created_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(6) with time zone
);


--
-- Name: webhook_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_subscriptions (
    id uuid NOT NULL,
    client_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    callback_url text NOT NULL,
    event_types text[],
    signing_key_id uuid NOT NULL,
    status public."WebhookSubscriptionStatus" DEFAULT 'ACTIVE'::public."WebhookSubscriptionStatus" NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    revoked_at timestamp(6) with time zone
);

ALTER TABLE ONLY public.webhook_subscriptions FORCE ROW LEVEL SECURITY;


--
-- Name: work_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_locations (
    id uuid NOT NULL,
    organization_id uuid NOT NULL,
    branch_id uuid,
    name text NOT NULL,
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    radius_meters numeric(8,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT work_locations_latitude_check CHECK (((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))),
    CONSTRAINT work_locations_longitude_check CHECK (((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))),
    CONSTRAINT work_locations_radius_check CHECK ((radius_meters > (0)::numeric))
);

ALTER TABLE ONLY public.work_locations FORCE ROW LEVEL SECURITY;


--
-- Name: approval_policies approval_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_pkey PRIMARY KEY (id);


--
-- Name: approval_policy_steps approval_policy_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_pkey PRIMARY KEY (id);


--
-- Name: attendance_approvals attendance_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_approvals
    ADD CONSTRAINT attendance_approvals_pkey PRIMARY KEY (id);


--
-- Name: attendance_corrections attendance_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_pkey PRIMARY KEY (id);


--
-- Name: attendance_punches attendance_punches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: employee_branch_assignments employee_branch_assignments_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch_assignments
    ADD CONSTRAINT employee_branch_assignments_no_overlap EXCLUDE USING gist (employee_id WITH =, branch_id WITH =, daterange(starts_on, COALESCE((ends_on + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: employee_branch_assignments employee_branch_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch_assignments
    ADD CONSTRAINT employee_branch_assignments_pkey PRIMARY KEY (id);


--
-- Name: employee_compensation employee_compensation_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_compensation
    ADD CONSTRAINT employee_compensation_no_overlap EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, COALESCE((effective_to + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: employee_compensation employee_compensation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_compensation
    ADD CONSTRAINT employee_compensation_pkey PRIMARY KEY (id);


--
-- Name: employee_emergency_contacts employee_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_emergency_contacts
    ADD CONSTRAINT employee_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: employee_employment_records employee_employment_records_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_records
    ADD CONSTRAINT employee_employment_records_no_overlap EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, COALESCE((effective_to + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: employee_employment_records employee_employment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_records
    ADD CONSTRAINT employee_employment_records_pkey PRIMARY KEY (id);


--
-- Name: employee_field_ownership employee_field_ownership_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_field_ownership
    ADD CONSTRAINT employee_field_ownership_pkey PRIMARY KEY (employee_id, field_name);


--
-- Name: employee_pay_components employee_pay_components_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pay_components
    ADD CONSTRAINT employee_pay_components_no_overlap EXCLUDE USING gist (employee_id WITH =, pay_component_id WITH =, daterange(effective_from, COALESCE((effective_to + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: employee_pay_components employee_pay_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pay_components
    ADD CONSTRAINT employee_pay_components_pkey PRIMARY KEY (id);


--
-- Name: employee_shift_assignments employee_shift_assignments_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_no_overlap EXCLUDE USING gist (employee_id WITH =, daterange(starts_on, COALESCE((ends_on + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: employee_shift_assignments employee_shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: external_id_mappings external_id_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_id_mappings
    ADD CONSTRAINT external_id_mappings_pkey PRIMARY KEY (id);


--
-- Name: federation_capabilities federation_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_capabilities
    ADD CONSTRAINT federation_capabilities_pkey PRIMARY KEY (id);


--
-- Name: federation_client_credentials federation_client_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_client_credentials
    ADD CONSTRAINT federation_client_credentials_pkey PRIMARY KEY (id);


--
-- Name: federation_clients federation_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_clients
    ADD CONSTRAINT federation_clients_pkey PRIMARY KEY (id);


--
-- Name: federation_grant_role_mappings federation_grant_role_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_role_mappings
    ADD CONSTRAINT federation_grant_role_mappings_pkey PRIMARY KEY (id);


--
-- Name: federation_grant_scopes federation_grant_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_scopes
    ADD CONSTRAINT federation_grant_scopes_pkey PRIMARY KEY (grant_id, scope_id);


--
-- Name: federation_grants federation_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grants
    ADD CONSTRAINT federation_grants_pkey PRIMARY KEY (id);


--
-- Name: federation_idempotency_records federation_idempotency_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_idempotency_records
    ADD CONSTRAINT federation_idempotency_records_pkey PRIMARY KEY (id);


--
-- Name: federation_request_records federation_request_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_request_records
    ADD CONSTRAINT federation_request_records_pkey PRIMARY KEY (id);


--
-- Name: federation_scopes federation_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_scopes
    ADD CONSTRAINT federation_scopes_pkey PRIMARY KEY (id);


--
-- Name: file_object_versions file_object_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object_versions
    ADD CONSTRAINT file_object_versions_pkey PRIMARY KEY (id);


--
-- Name: file_objects file_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_objects
    ADD CONSTRAINT file_objects_pkey PRIMARY KEY (id);


--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (id);


--
-- Name: leave_approvals leave_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approvals
    ADD CONSTRAINT leave_approvals_pkey PRIMARY KEY (id);


--
-- Name: leave_balance_transactions leave_balance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_pkey PRIMARY KEY (id);


--
-- Name: leave_balances leave_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: leave_types leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_pkey PRIMARY KEY (id);


--
-- Name: organization_federation_capabilities organization_federation_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_federation_capabilities
    ADD CONSTRAINT organization_federation_capabilities_pkey PRIMARY KEY (organization_id, capability_id);


--
-- Name: organization_settings organization_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (organization_id);


--
-- Name: organization_source_changes organization_source_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_source_changes
    ADD CONSTRAINT organization_source_changes_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: pay_components pay_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_components
    ADD CONSTRAINT pay_components_pkey PRIMARY KEY (id);


--
-- Name: payroll_adjustments payroll_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);


--
-- Name: payroll_approvals payroll_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_approvals
    ADD CONSTRAINT payroll_approvals_pkey PRIMARY KEY (id);


--
-- Name: payroll_line_item_components payroll_line_item_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_item_components
    ADD CONSTRAINT payroll_line_item_components_pkey PRIMARY KEY (id);


--
-- Name: payroll_line_items payroll_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_items
    ADD CONSTRAINT payroll_line_items_pkey PRIMARY KEY (id);


--
-- Name: payroll_runs payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: platform_permissions platform_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_permissions
    ADD CONSTRAINT platform_permissions_pkey PRIMARY KEY (id);


--
-- Name: platform_role_permissions platform_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_role_permissions
    ADD CONSTRAINT platform_role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: platform_roles platform_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_roles
    ADD CONSTRAINT platform_roles_pkey PRIMARY KEY (id);


--
-- Name: project_members project_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shift_break_rules shift_break_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_break_rules
    ADD CONSTRAINT shift_break_rules_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_no_overlap EXCLUDE USING gist (team_id WITH =, employee_id WITH =, daterange(joined_at, COALESCE((left_at + 1), 'infinity'::date), '[)'::text) WITH &&);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: timesheet_approvals timesheet_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_pkey PRIMARY KEY (id);


--
-- Name: timesheet_entries timesheet_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_entries
    ADD CONSTRAINT timesheet_entries_pkey PRIMARY KEY (id);


--
-- Name: timesheet_periods timesheet_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_pkey PRIMARY KEY (id);


--
-- Name: timesheets timesheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: user_organizations user_organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_pkey PRIMARY KEY (id);


--
-- Name: user_platform_roles user_platform_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_platform_roles
    ADD CONSTRAINT user_platform_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_delivery_attempts webhook_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_delivery_attempts
    ADD CONSTRAINT webhook_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: webhook_signing_keys webhook_signing_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_signing_keys
    ADD CONSTRAINT webhook_signing_keys_pkey PRIMARY KEY (id);


--
-- Name: webhook_subscriptions webhook_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: work_locations work_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_pkey PRIMARY KEY (id);


--
-- Name: approval_policies_active_default_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX approval_policies_active_default_key ON public.approval_policies USING btree (organization_id, domain) WHERE ((is_default = true) AND (is_active = true));


--
-- Name: approval_policies_organization_id_domain_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX approval_policies_organization_id_domain_code_key ON public.approval_policies USING btree (organization_id, domain, code);


--
-- Name: approval_policies_organization_id_domain_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_policies_organization_id_domain_is_active_idx ON public.approval_policies USING btree (organization_id, domain, is_active);


--
-- Name: approval_policy_steps_approval_policy_id_step_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX approval_policy_steps_approval_policy_id_step_number_key ON public.approval_policy_steps USING btree (approval_policy_id, step_number);


--
-- Name: approval_policy_steps_organization_id_approval_policy_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX approval_policy_steps_organization_id_approval_policy_id_idx ON public.approval_policy_steps USING btree (organization_id, approval_policy_id);


--
-- Name: attendance_approvals_attendance_correction_id_step_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_approvals_attendance_correction_id_step_number_key ON public.attendance_approvals USING btree (attendance_correction_id, step_number);


--
-- Name: attendance_approvals_organization_id_approver_user_id_statu_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_approvals_organization_id_approver_user_id_statu_idx ON public.attendance_approvals USING btree (organization_id, approver_user_id, status);


--
-- Name: attendance_corrections_organization_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_corrections_organization_id_status_created_at_idx ON public.attendance_corrections USING btree (organization_id, status, created_at);


--
-- Name: attendance_punches_attendance_record_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punches_attendance_record_id_occurred_at_idx ON public.attendance_punches USING btree (attendance_record_id, occurred_at);


--
-- Name: attendance_punches_organization_id_employee_id_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punches_organization_id_employee_id_occurred_at_idx ON public.attendance_punches USING btree (organization_id, employee_id, occurred_at);


--
-- Name: attendance_punches_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_punches_organization_id_external_id_key ON public.attendance_punches USING btree (organization_id, external_id);


--
-- Name: attendance_punches_organization_id_work_location_id_occurre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_punches_organization_id_work_location_id_occurre_idx ON public.attendance_punches USING btree (organization_id, work_location_id, occurred_at);


--
-- Name: attendance_records_employee_id_work_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_records_employee_id_work_date_key ON public.attendance_records USING btree (employee_id, work_date);


--
-- Name: attendance_records_organization_id_employee_id_work_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_records_organization_id_employee_id_work_date_idx ON public.attendance_records USING btree (organization_id, employee_id, work_date);


--
-- Name: attendance_records_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_records_organization_id_external_id_key ON public.attendance_records USING btree (organization_id, external_id);


--
-- Name: attendance_records_organization_id_work_date_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_records_organization_id_work_date_status_idx ON public.attendance_records USING btree (organization_id, work_date, status);


--
-- Name: audit_logs_actor_client_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_actor_client_id_created_at_idx ON public.audit_logs USING btree (actor_client_id, created_at);


--
-- Name: audit_logs_actor_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_actor_user_id_created_at_idx ON public.audit_logs USING btree (actor_user_id, created_at);


--
-- Name: audit_logs_correlation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_correlation_id_idx ON public.audit_logs USING btree (correlation_id);


--
-- Name: audit_logs_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_type_entity_id_created_at_idx ON public.audit_logs USING btree (entity_type, entity_id, created_at);


--
-- Name: audit_logs_organization_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_organization_id_created_at_idx ON public.audit_logs USING btree (organization_id, created_at);


--
-- Name: auth_sessions_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_sessions_organization_id_status_idx ON public.auth_sessions USING btree (organization_id, status);


--
-- Name: auth_sessions_refresh_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX auth_sessions_refresh_token_hash_key ON public.auth_sessions USING btree (refresh_token_hash);


--
-- Name: auth_sessions_user_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_sessions_user_id_status_idx ON public.auth_sessions USING btree (user_id, status);


--
-- Name: branches_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_organization_id_code_key ON public.branches USING btree (organization_id, code);


--
-- Name: branches_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_organization_id_external_id_key ON public.branches USING btree (organization_id, external_id);


--
-- Name: branches_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX branches_organization_id_status_idx ON public.branches USING btree (organization_id, status);


--
-- Name: employee_branch_assignments_active_primary_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employee_branch_assignments_active_primary_key ON public.employee_branch_assignments USING btree (organization_id, employee_id) WHERE ((is_primary = true) AND (ends_on IS NULL));


--
-- Name: employee_branch_assignments_organization_id_branch_id_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_branch_assignments_organization_id_branch_id_start_idx ON public.employee_branch_assignments USING btree (organization_id, branch_id, starts_on);


--
-- Name: employee_branch_assignments_organization_id_employee_id_sta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_branch_assignments_organization_id_employee_id_sta_idx ON public.employee_branch_assignments USING btree (organization_id, employee_id, starts_on);


--
-- Name: employee_compensation_organization_id_employee_id_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_compensation_organization_id_employee_id_effective_idx ON public.employee_compensation USING btree (organization_id, employee_id, effective_from);


--
-- Name: employee_emergency_contacts_organization_id_employee_id_sor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_emergency_contacts_organization_id_employee_id_sor_idx ON public.employee_emergency_contacts USING btree (organization_id, employee_id, sort_order);


--
-- Name: employee_employment_records_organization_id_employee_id_eff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_employment_records_organization_id_employee_id_eff_idx ON public.employee_employment_records USING btree (organization_id, employee_id, effective_from);


--
-- Name: employee_field_ownership_organization_id_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_field_ownership_organization_id_employee_id_idx ON public.employee_field_ownership USING btree (organization_id, employee_id);


--
-- Name: employee_pay_components_organization_id_employee_id_effecti_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_pay_components_organization_id_employee_id_effecti_idx ON public.employee_pay_components USING btree (organization_id, employee_id, effective_from);


--
-- Name: employee_pay_components_organization_id_pay_component_id_ef_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_pay_components_organization_id_pay_component_id_ef_idx ON public.employee_pay_components USING btree (organization_id, pay_component_id, effective_from);


--
-- Name: employee_shift_assignments_organization_id_employee_id_star_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_shift_assignments_organization_id_employee_id_star_idx ON public.employee_shift_assignments USING btree (organization_id, employee_id, starts_on);


--
-- Name: employee_shift_assignments_organization_id_shift_id_starts__idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_shift_assignments_organization_id_shift_id_starts__idx ON public.employee_shift_assignments USING btree (organization_id, shift_id, starts_on);


--
-- Name: employees_organization_id_employee_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_organization_id_employee_number_key ON public.employees USING btree (organization_id, employee_number);


--
-- Name: employees_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_organization_id_external_id_key ON public.employees USING btree (organization_id, external_id);


--
-- Name: employees_organization_id_last_name_first_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_organization_id_last_name_first_name_idx ON public.employees USING btree (organization_id, last_name, first_name);


--
-- Name: employees_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_organization_id_status_idx ON public.employees USING btree (organization_id, status);


--
-- Name: employees_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_user_id_key ON public.employees USING btree (user_id);


--
-- Name: external_id_mappings_client_id_entity_type_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX external_id_mappings_client_id_entity_type_external_id_key ON public.external_id_mappings USING btree (client_id, entity_type, external_id);


--
-- Name: external_id_mappings_client_id_entity_type_local_entity_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX external_id_mappings_client_id_entity_type_local_entity_id_key ON public.external_id_mappings USING btree (client_id, entity_type, local_entity_id);


--
-- Name: external_id_mappings_organization_id_entity_type_external_i_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_id_mappings_organization_id_entity_type_external_i_idx ON public.external_id_mappings USING btree (organization_id, entity_type, external_id);


--
-- Name: federation_capabilities_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_capabilities_code_key ON public.federation_capabilities USING btree (code);


--
-- Name: federation_client_credentials_client_id_key_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_client_credentials_client_id_key_id_key ON public.federation_client_credentials USING btree (client_id, key_id);


--
-- Name: federation_client_credentials_client_id_status_valid_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_client_credentials_client_id_status_valid_from_idx ON public.federation_client_credentials USING btree (client_id, status, valid_from);


--
-- Name: federation_clients_client_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_clients_client_id_key ON public.federation_clients USING btree (client_id);


--
-- Name: federation_clients_status_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_clients_status_expires_at_idx ON public.federation_clients USING btree (status, expires_at);


--
-- Name: federation_grant_role_mappings_grant_id_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_grant_role_mappings_grant_id_priority_idx ON public.federation_grant_role_mappings USING btree (grant_id, priority);


--
-- Name: federation_grant_role_mappings_grant_id_role_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_grant_role_mappings_grant_id_role_id_key ON public.federation_grant_role_mappings USING btree (grant_id, role_id);


--
-- Name: federation_grants_client_id_organization_id_branch_id_statu_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_grants_client_id_organization_id_branch_id_statu_idx ON public.federation_grants USING btree (client_id, organization_id, branch_id, status);


--
-- Name: federation_grants_organization_id_branch_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_grants_organization_id_branch_id_status_idx ON public.federation_grants USING btree (organization_id, branch_id, status);


--
-- Name: federation_idempotency_records_client_id_organization_id_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_idempotency_records_client_id_organization_id_id_key ON public.federation_idempotency_records USING btree (client_id, organization_id, idempotency_key);


--
-- Name: federation_idempotency_records_organization_id_status_expir_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_idempotency_records_organization_id_status_expir_idx ON public.federation_idempotency_records USING btree (organization_id, status, expires_at);


--
-- Name: federation_request_records_client_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_request_records_client_id_created_at_idx ON public.federation_request_records USING btree (client_id, created_at);


--
-- Name: federation_request_records_correlation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_request_records_correlation_id_idx ON public.federation_request_records USING btree (correlation_id);


--
-- Name: federation_request_records_organization_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_request_records_organization_id_created_at_idx ON public.federation_request_records USING btree (organization_id, created_at);


--
-- Name: federation_request_records_result_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX federation_request_records_result_created_at_idx ON public.federation_request_records USING btree (result, created_at);


--
-- Name: federation_scopes_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX federation_scopes_code_key ON public.federation_scopes USING btree (code);


--
-- Name: file_object_versions_current_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX file_object_versions_current_key ON public.file_object_versions USING btree (file_object_id) WHERE (is_current = true);


--
-- Name: file_object_versions_file_object_id_is_current_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_object_versions_file_object_id_is_current_idx ON public.file_object_versions USING btree (file_object_id, is_current);


--
-- Name: file_object_versions_file_object_id_s3_version_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX file_object_versions_file_object_id_s3_version_id_key ON public.file_object_versions USING btree (file_object_id, s3_version_id);


--
-- Name: file_objects_bucket_object_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX file_objects_bucket_object_key_key ON public.file_objects USING btree (bucket, object_key);


--
-- Name: file_objects_organization_id_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_objects_organization_id_employee_id_idx ON public.file_objects USING btree (organization_id, employee_id);


--
-- Name: file_objects_organization_id_leave_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_objects_organization_id_leave_request_id_idx ON public.file_objects USING btree (organization_id, leave_request_id);


--
-- Name: file_objects_organization_id_purpose_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_objects_organization_id_purpose_created_at_idx ON public.file_objects USING btree (organization_id, purpose, created_at);


--
-- Name: holidays_organization_branch_holiday_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holidays_organization_branch_holiday_date_key ON public.holidays USING btree (organization_id, branch_id, holiday_date) WHERE (branch_id IS NOT NULL);


--
-- Name: holidays_organization_holiday_date_global_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holidays_organization_holiday_date_global_key ON public.holidays USING btree (organization_id, holiday_date) WHERE (branch_id IS NULL);


--
-- Name: holidays_organization_id_branch_id_holiday_date_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holidays_organization_id_branch_id_holiday_date_key ON public.holidays USING btree (organization_id, branch_id, holiday_date);


--
-- Name: holidays_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holidays_organization_id_external_id_key ON public.holidays USING btree (organization_id, external_id);


--
-- Name: holidays_organization_id_holiday_date_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX holidays_organization_id_holiday_date_is_active_idx ON public.holidays USING btree (organization_id, holiday_date, is_active);


--
-- Name: leave_approvals_leave_request_id_step_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leave_approvals_leave_request_id_step_number_key ON public.leave_approvals USING btree (leave_request_id, step_number);


--
-- Name: leave_approvals_organization_id_approver_user_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_approvals_organization_id_approver_user_id_status_idx ON public.leave_approvals USING btree (organization_id, approver_user_id, status);


--
-- Name: leave_balance_transactions_organization_id_leave_balance_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_balance_transactions_organization_id_leave_balance_id_idx ON public.leave_balance_transactions USING btree (organization_id, leave_balance_id, created_at);


--
-- Name: leave_balances_employee_id_leave_type_id_period_start_perio_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leave_balances_employee_id_leave_type_id_period_start_perio_key ON public.leave_balances USING btree (employee_id, leave_type_id, period_start, period_end);


--
-- Name: leave_balances_organization_id_employee_id_period_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_balances_organization_id_employee_id_period_start_idx ON public.leave_balances USING btree (organization_id, employee_id, period_start);


--
-- Name: leave_requests_organization_id_employee_id_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_requests_organization_id_employee_id_start_date_idx ON public.leave_requests USING btree (organization_id, employee_id, start_date);


--
-- Name: leave_requests_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leave_requests_organization_id_external_id_key ON public.leave_requests USING btree (organization_id, external_id);


--
-- Name: leave_requests_organization_id_status_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_requests_organization_id_status_start_date_idx ON public.leave_requests USING btree (organization_id, status, start_date);


--
-- Name: leave_types_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX leave_types_organization_id_code_key ON public.leave_types USING btree (organization_id, code);


--
-- Name: leave_types_organization_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_types_organization_id_is_active_idx ON public.leave_types USING btree (organization_id, is_active);


--
-- Name: organization_source_changes_organization_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organization_source_changes_organization_id_created_at_idx ON public.organization_source_changes USING btree (organization_id, created_at);


--
-- Name: organizations_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);


--
-- Name: organizations_source_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_source_external_id_key ON public.organizations USING btree (source, external_id);


--
-- Name: organizations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX organizations_status_idx ON public.organizations USING btree (status);


--
-- Name: outbox_events_event_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX outbox_events_event_id_key ON public.outbox_events USING btree (event_id);


--
-- Name: outbox_events_organization_id_event_type_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_organization_id_event_type_created_at_idx ON public.outbox_events USING btree (organization_id, event_type, created_at);


--
-- Name: outbox_events_status_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_status_next_attempt_at_idx ON public.outbox_events USING btree (status, next_attempt_at);


--
-- Name: password_reset_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: password_reset_tokens_user_id_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_user_id_expires_at_idx ON public.password_reset_tokens USING btree (user_id, expires_at);


--
-- Name: pay_components_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pay_components_organization_id_code_key ON public.pay_components USING btree (organization_id, code);


--
-- Name: pay_components_organization_id_is_active_display_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pay_components_organization_id_is_active_display_order_idx ON public.pay_components USING btree (organization_id, is_active, display_order);


--
-- Name: payroll_adjustments_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_adjustments_organization_id_external_id_key ON public.payroll_adjustments USING btree (organization_id, external_id);


--
-- Name: payroll_adjustments_organization_id_payroll_run_id_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_adjustments_organization_id_payroll_run_id_employee_idx ON public.payroll_adjustments USING btree (organization_id, payroll_run_id, employee_id);


--
-- Name: payroll_approvals_payroll_run_id_approver_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_approvals_payroll_run_id_approver_user_id_key ON public.payroll_approvals USING btree (payroll_run_id, approver_user_id);


--
-- Name: payroll_line_item_components_organization_id_component_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_line_item_components_organization_id_component_type_idx ON public.payroll_line_item_components USING btree (organization_id, component_type, component_code);


--
-- Name: payroll_line_item_components_payroll_line_item_id_pay_compo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_line_item_components_payroll_line_item_id_pay_compo_key ON public.payroll_line_item_components USING btree (payroll_line_item_id, pay_component_id);


--
-- Name: payroll_line_items_organization_id_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_line_items_organization_id_employee_id_idx ON public.payroll_line_items USING btree (organization_id, employee_id);


--
-- Name: payroll_line_items_payroll_run_id_employee_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_line_items_payroll_run_id_employee_id_key ON public.payroll_line_items USING btree (payroll_run_id, employee_id);


--
-- Name: payroll_runs_organization_id_period_start_period_end_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payroll_runs_organization_id_period_start_period_end_key ON public.payroll_runs USING btree (organization_id, period_start, period_end);


--
-- Name: payroll_runs_organization_id_status_period_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payroll_runs_organization_id_status_period_start_idx ON public.payroll_runs USING btree (organization_id, status, period_start);


--
-- Name: payslips_file_object_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payslips_file_object_id_key ON public.payslips USING btree (file_object_id);


--
-- Name: payslips_organization_id_employee_id_issued_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payslips_organization_id_employee_id_issued_at_idx ON public.payslips USING btree (organization_id, employee_id, issued_at);


--
-- Name: payslips_payroll_line_item_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payslips_payroll_line_item_id_key ON public.payslips USING btree (payroll_line_item_id);


--
-- Name: payslips_payroll_run_id_employee_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payslips_payroll_run_id_employee_id_key ON public.payslips USING btree (payroll_run_id, employee_id);


--
-- Name: permissions_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_key_key ON public.permissions USING btree (key);


--
-- Name: platform_permissions_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_permissions_key_key ON public.platform_permissions USING btree (key);


--
-- Name: platform_roles_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX platform_roles_code_key ON public.platform_roles USING btree (code);


--
-- Name: project_members_organization_id_employee_id_starts_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_members_organization_id_employee_id_starts_on_idx ON public.project_members USING btree (organization_id, employee_id, starts_on);


--
-- Name: project_members_organization_id_project_id_starts_on_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX project_members_organization_id_project_id_starts_on_idx ON public.project_members USING btree (organization_id, project_id, starts_on);


--
-- Name: projects_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX projects_organization_id_code_key ON public.projects USING btree (organization_id, code);


--
-- Name: projects_organization_id_status_start_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projects_organization_id_status_start_date_idx ON public.projects USING btree (organization_id, status, start_date);


--
-- Name: roles_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_organization_id_code_key ON public.roles USING btree (organization_id, code);


--
-- Name: roles_organization_id_scope_is_system_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_organization_id_scope_is_system_idx ON public.roles USING btree (organization_id, scope, is_system);


--
-- Name: shift_break_rules_shift_id_sequence_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shift_break_rules_shift_id_sequence_key ON public.shift_break_rules USING btree (shift_id, sequence);


--
-- Name: shifts_organization_id_branch_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_organization_id_branch_id_is_active_idx ON public.shifts USING btree (organization_id, branch_id, is_active);


--
-- Name: shifts_organization_id_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shifts_organization_id_code_key ON public.shifts USING btree (organization_id, code);


--
-- Name: team_members_organization_id_employee_id_joined_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_organization_id_employee_id_joined_at_idx ON public.team_members USING btree (organization_id, employee_id, joined_at);


--
-- Name: team_members_organization_id_team_id_joined_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_members_organization_id_team_id_joined_at_idx ON public.team_members USING btree (organization_id, team_id, joined_at);


--
-- Name: teams_organization_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX teams_organization_id_name_key ON public.teams USING btree (organization_id, name);


--
-- Name: teams_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teams_organization_id_status_idx ON public.teams USING btree (organization_id, status);


--
-- Name: timesheet_approvals_timesheet_id_approver_user_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timesheet_approvals_timesheet_id_approver_user_id_key ON public.timesheet_approvals USING btree (timesheet_id, approver_user_id);


--
-- Name: timesheet_entries_attendance_record_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timesheet_entries_attendance_record_id_idx ON public.timesheet_entries USING btree (attendance_record_id);


--
-- Name: timesheet_entries_organization_id_timesheet_id_work_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timesheet_entries_organization_id_timesheet_id_work_date_idx ON public.timesheet_entries USING btree (organization_id, timesheet_id, work_date);


--
-- Name: timesheet_periods_organization_id_period_start_period_end_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timesheet_periods_organization_id_period_start_period_end_key ON public.timesheet_periods USING btree (organization_id, period_start, period_end);


--
-- Name: timesheets_employee_id_timesheet_period_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timesheets_employee_id_timesheet_period_id_key ON public.timesheets USING btree (employee_id, timesheet_period_id);


--
-- Name: timesheets_organization_id_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX timesheets_organization_id_external_id_key ON public.timesheets USING btree (organization_id, external_id);


--
-- Name: timesheets_organization_id_status_timesheet_period_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX timesheets_organization_id_status_timesheet_period_id_idx ON public.timesheets USING btree (organization_id, status, timesheet_period_id);


--
-- Name: user_invitations_organization_id_email_normalized_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_invitations_organization_id_email_normalized_idx ON public.user_invitations USING btree (organization_id, email_normalized);


--
-- Name: user_invitations_organization_id_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_invitations_organization_id_expires_at_idx ON public.user_invitations USING btree (organization_id, expires_at);


--
-- Name: user_invitations_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_invitations_token_hash_key ON public.user_invitations USING btree (token_hash);


--
-- Name: user_organizations_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_organizations_organization_id_status_idx ON public.user_organizations USING btree (organization_id, status);


--
-- Name: user_organizations_user_id_organization_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_organizations_user_id_organization_id_key ON public.user_organizations USING btree (user_id, organization_id);


--
-- Name: user_platform_roles_role_id_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_platform_roles_role_id_revoked_at_idx ON public.user_platform_roles USING btree (role_id, revoked_at);


--
-- Name: user_roles_global_branch_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_global_branch_key ON public.user_roles USING btree (user_id, organization_id, role_id) WHERE (branch_id IS NULL);


--
-- Name: user_roles_organization_id_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_organization_id_branch_id_idx ON public.user_roles USING btree (organization_id, branch_id);


--
-- Name: user_roles_organization_id_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_roles_organization_id_user_id_idx ON public.user_roles USING btree (organization_id, user_id);


--
-- Name: user_roles_scoped_branch_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_roles_scoped_branch_key ON public.user_roles USING btree (user_id, organization_id, role_id, branch_id) WHERE (branch_id IS NOT NULL);


--
-- Name: users_email_normalized_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_normalized_key ON public.users USING btree (email_normalized);


--
-- Name: users_external_identity_provider_external_organization_id_e_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_external_identity_provider_external_organization_id_e_key ON public.users USING btree (external_identity_provider, external_organization_id, external_identity_id);


--
-- Name: users_identity_type_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_identity_type_is_active_idx ON public.users USING btree (identity_type, is_active);


--
-- Name: webhook_deliveries_organization_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_organization_id_created_at_idx ON public.webhook_deliveries USING btree (organization_id, created_at);


--
-- Name: webhook_deliveries_outbox_event_id_subscription_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_deliveries_outbox_event_id_subscription_id_key ON public.webhook_deliveries USING btree (outbox_event_id, subscription_id);


--
-- Name: webhook_deliveries_status_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_deliveries_status_next_attempt_at_idx ON public.webhook_deliveries USING btree (status, next_attempt_at);


--
-- Name: webhook_delivery_attempts_delivery_id_attempt_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_delivery_attempts_delivery_id_attempt_number_key ON public.webhook_delivery_attempts USING btree (delivery_id, attempt_number);


--
-- Name: webhook_signing_keys_client_id_key_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_signing_keys_client_id_key_id_key ON public.webhook_signing_keys USING btree (client_id, key_id);


--
-- Name: webhook_signing_keys_client_id_status_valid_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_signing_keys_client_id_status_valid_from_idx ON public.webhook_signing_keys USING btree (client_id, status, valid_from);


--
-- Name: webhook_subscriptions_client_id_organization_id_callback_ur_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX webhook_subscriptions_client_id_organization_id_callback_ur_key ON public.webhook_subscriptions USING btree (client_id, organization_id, callback_url);


--
-- Name: webhook_subscriptions_organization_id_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_subscriptions_organization_id_status_idx ON public.webhook_subscriptions USING btree (organization_id, status);


--
-- Name: work_locations_organization_id_branch_id_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_locations_organization_id_branch_id_is_active_idx ON public.work_locations USING btree (organization_id, branch_id, is_active);


--
-- Name: work_locations_organization_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX work_locations_organization_id_name_key ON public.work_locations USING btree (organization_id, name);


--
-- Name: audit_logs audit_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_append_only BEFORE DELETE OR UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();


--
-- Name: leave_balance_transactions leave_balance_transactions_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER leave_balance_transactions_append_only BEFORE DELETE OR UPDATE ON public.leave_balance_transactions FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();


--
-- Name: payroll_adjustments payroll_adjustments_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payroll_adjustments_locked BEFORE DELETE OR UPDATE ON public.payroll_adjustments FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();


--
-- Name: payroll_line_item_components payroll_line_item_components_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payroll_line_item_components_locked BEFORE DELETE OR UPDATE ON public.payroll_line_item_components FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();


--
-- Name: payroll_line_items payroll_line_items_locked; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payroll_line_items_locked BEFORE DELETE OR UPDATE ON public.payroll_line_items FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_mutation();


--
-- Name: approval_policies approval_policies_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: approval_policies approval_policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policies
    ADD CONSTRAINT approval_policies_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_approval_policy_id_fkey FOREIGN KEY (approval_policy_id) REFERENCES public.approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_policy_steps approval_policy_steps_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_policy_steps
    ADD CONSTRAINT approval_policy_steps_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_approvals attendance_approvals_approval_policy_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_approvals
    ADD CONSTRAINT attendance_approvals_approval_policy_step_id_fkey FOREIGN KEY (approval_policy_step_id) REFERENCES public.approval_policy_steps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_approvals attendance_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_approvals
    ADD CONSTRAINT attendance_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_approvals attendance_approvals_attendance_correction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_approvals
    ADD CONSTRAINT attendance_approvals_attendance_correction_id_fkey FOREIGN KEY (attendance_correction_id) REFERENCES public.attendance_corrections(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_approvals attendance_approvals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_approvals
    ADD CONSTRAINT attendance_approvals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_corrections attendance_corrections_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_approval_policy_id_fkey FOREIGN KEY (approval_policy_id) REFERENCES public.approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_corrections attendance_corrections_attendance_punch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_attendance_punch_id_fkey FOREIGN KEY (attendance_punch_id) REFERENCES public.attendance_punches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_corrections attendance_corrections_attendance_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_attendance_record_id_fkey FOREIGN KEY (attendance_record_id) REFERENCES public.attendance_records(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_corrections attendance_corrections_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_corrections attendance_corrections_requested_by_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_requested_by_client_id_fkey FOREIGN KEY (requested_by_client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_corrections attendance_corrections_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_corrections
    ADD CONSTRAINT attendance_corrections_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_punches attendance_punches_attendance_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_attendance_record_id_fkey FOREIGN KEY (attendance_record_id) REFERENCES public.attendance_records(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_punches attendance_punches_captured_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_captured_by_user_id_fkey FOREIGN KEY (captured_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: attendance_punches attendance_punches_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_punches attendance_punches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_punches attendance_punches_work_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_punches
    ADD CONSTRAINT attendance_punches_work_location_id_fkey FOREIGN KEY (work_location_id) REFERENCES public.work_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_client_id_fkey FOREIGN KEY (actor_client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: auth_sessions auth_sessions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: auth_sessions auth_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: branches branches_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_branch_assignments employee_branch_assignments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch_assignments
    ADD CONSTRAINT employee_branch_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_branch_assignments employee_branch_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch_assignments
    ADD CONSTRAINT employee_branch_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_branch_assignments employee_branch_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_branch_assignments
    ADD CONSTRAINT employee_branch_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_compensation employee_compensation_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_compensation
    ADD CONSTRAINT employee_compensation_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_compensation employee_compensation_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_compensation
    ADD CONSTRAINT employee_compensation_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_emergency_contacts employee_emergency_contacts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_emergency_contacts
    ADD CONSTRAINT employee_emergency_contacts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_emergency_contacts employee_emergency_contacts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_emergency_contacts
    ADD CONSTRAINT employee_emergency_contacts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_employment_records employee_employment_records_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_records
    ADD CONSTRAINT employee_employment_records_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_employment_records employee_employment_records_manager_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_records
    ADD CONSTRAINT employee_employment_records_manager_employee_id_fkey FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_employment_records employee_employment_records_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_records
    ADD CONSTRAINT employee_employment_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_field_ownership employee_field_ownership_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_field_ownership
    ADD CONSTRAINT employee_field_ownership_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_field_ownership employee_field_ownership_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_field_ownership
    ADD CONSTRAINT employee_field_ownership_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_field_ownership employee_field_ownership_owner_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_field_ownership
    ADD CONSTRAINT employee_field_ownership_owner_client_id_fkey FOREIGN KEY (owner_client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: employee_pay_components employee_pay_components_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pay_components
    ADD CONSTRAINT employee_pay_components_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_pay_components employee_pay_components_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pay_components
    ADD CONSTRAINT employee_pay_components_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_pay_components employee_pay_components_pay_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pay_components
    ADD CONSTRAINT employee_pay_components_pay_component_id_fkey FOREIGN KEY (pay_component_id) REFERENCES public.pay_components(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_shift_assignments employee_shift_assignments_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_shift_assignments employee_shift_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_shift_assignments employee_shift_assignments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_shift_assignments employee_shift_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_shift_assignments
    ADD CONSTRAINT employee_shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_manager_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_manager_employee_id_fkey FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_primary_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_primary_branch_id_fkey FOREIGN KEY (primary_branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: external_id_mappings external_id_mappings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_id_mappings
    ADD CONSTRAINT external_id_mappings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: external_id_mappings external_id_mappings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_id_mappings
    ADD CONSTRAINT external_id_mappings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_client_credentials federation_client_credentials_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_client_credentials
    ADD CONSTRAINT federation_client_credentials_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_client_credentials federation_client_credentials_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_client_credentials
    ADD CONSTRAINT federation_client_credentials_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_clients federation_clients_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_clients
    ADD CONSTRAINT federation_clients_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_clients federation_clients_home_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_clients
    ADD CONSTRAINT federation_clients_home_organization_id_fkey FOREIGN KEY (home_organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_grant_role_mappings federation_grant_role_mappings_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_role_mappings
    ADD CONSTRAINT federation_grant_role_mappings_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.federation_grants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: federation_grant_role_mappings federation_grant_role_mappings_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_role_mappings
    ADD CONSTRAINT federation_grant_role_mappings_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_grant_scopes federation_grant_scopes_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_scopes
    ADD CONSTRAINT federation_grant_scopes_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.federation_grants(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: federation_grant_scopes federation_grant_scopes_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grant_scopes
    ADD CONSTRAINT federation_grant_scopes_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.federation_scopes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_grants federation_grants_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grants
    ADD CONSTRAINT federation_grants_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_grants federation_grants_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grants
    ADD CONSTRAINT federation_grants_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_grants federation_grants_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grants
    ADD CONSTRAINT federation_grants_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_grants federation_grants_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_grants
    ADD CONSTRAINT federation_grants_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_idempotency_records federation_idempotency_records_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_idempotency_records
    ADD CONSTRAINT federation_idempotency_records_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_idempotency_records federation_idempotency_records_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_idempotency_records
    ADD CONSTRAINT federation_idempotency_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: federation_request_records federation_request_records_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_request_records
    ADD CONSTRAINT federation_request_records_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_request_records federation_request_records_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_request_records
    ADD CONSTRAINT federation_request_records_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: federation_request_records federation_request_records_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.federation_request_records
    ADD CONSTRAINT federation_request_records_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: file_object_versions file_object_versions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object_versions
    ADD CONSTRAINT file_object_versions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: file_object_versions file_object_versions_file_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_object_versions
    ADD CONSTRAINT file_object_versions_file_object_id_fkey FOREIGN KEY (file_object_id) REFERENCES public.file_objects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: file_objects file_objects_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_objects
    ADD CONSTRAINT file_objects_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: file_objects file_objects_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_objects
    ADD CONSTRAINT file_objects_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: file_objects file_objects_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_objects
    ADD CONSTRAINT file_objects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: file_objects file_objects_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_objects
    ADD CONSTRAINT file_objects_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: holidays holidays_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: holidays holidays_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_approvals leave_approvals_approval_policy_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approvals
    ADD CONSTRAINT leave_approvals_approval_policy_step_id_fkey FOREIGN KEY (approval_policy_step_id) REFERENCES public.approval_policy_steps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_approvals leave_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approvals
    ADD CONSTRAINT leave_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_approvals leave_approvals_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approvals
    ADD CONSTRAINT leave_approvals_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_approvals leave_approvals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_approvals
    ADD CONSTRAINT leave_approvals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balance_transactions leave_balance_transactions_created_by_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_created_by_client_id_fkey FOREIGN KEY (created_by_client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: leave_balance_transactions leave_balance_transactions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: leave_balance_transactions leave_balance_transactions_leave_balance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_leave_balance_id_fkey FOREIGN KEY (leave_balance_id) REFERENCES public.leave_balances(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balance_transactions leave_balance_transactions_leave_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_leave_request_id_fkey FOREIGN KEY (leave_request_id) REFERENCES public.leave_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balance_transactions leave_balance_transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balance_transactions
    ADD CONSTRAINT leave_balance_transactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balances leave_balances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balances leave_balances_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_balances leave_balances_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_requests leave_requests_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_approval_policy_id_fkey FOREIGN KEY (approval_policy_id) REFERENCES public.approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_requests leave_requests_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_requests leave_requests_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_requests leave_requests_leave_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_leave_type_id_fkey FOREIGN KEY (leave_type_id) REFERENCES public.leave_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_requests leave_requests_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: leave_types leave_types_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_types
    ADD CONSTRAINT leave_types_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_federation_capabilities organization_federation_capabilities_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_federation_capabilities
    ADD CONSTRAINT organization_federation_capabilities_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.federation_capabilities(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_federation_capabilities organization_federation_capabilities_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_federation_capabilities
    ADD CONSTRAINT organization_federation_capabilities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_settings organization_settings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_source_changes organization_source_changes_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_source_changes
    ADD CONSTRAINT organization_source_changes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_source_changes organization_source_changes_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_source_changes
    ADD CONSTRAINT organization_source_changes_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: outbox_events outbox_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pay_components pay_components_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pay_components
    ADD CONSTRAINT pay_components_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_adjustments payroll_adjustments_created_by_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_created_by_client_id_fkey FOREIGN KEY (created_by_client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payroll_adjustments payroll_adjustments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payroll_adjustments payroll_adjustments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_adjustments payroll_adjustments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_adjustments payroll_adjustments_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_approvals payroll_approvals_approval_policy_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_approvals
    ADD CONSTRAINT payroll_approvals_approval_policy_step_id_fkey FOREIGN KEY (approval_policy_step_id) REFERENCES public.approval_policy_steps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_approvals payroll_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_approvals
    ADD CONSTRAINT payroll_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_approvals payroll_approvals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_approvals
    ADD CONSTRAINT payroll_approvals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_approvals payroll_approvals_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_approvals
    ADD CONSTRAINT payroll_approvals_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_item_components payroll_line_item_components_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_item_components
    ADD CONSTRAINT payroll_line_item_components_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_item_components payroll_line_item_components_pay_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_item_components
    ADD CONSTRAINT payroll_line_item_components_pay_component_id_fkey FOREIGN KEY (pay_component_id) REFERENCES public.pay_components(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_item_components payroll_line_item_components_payroll_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_item_components
    ADD CONSTRAINT payroll_line_item_components_payroll_line_item_id_fkey FOREIGN KEY (payroll_line_item_id) REFERENCES public.payroll_line_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_items payroll_line_items_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_items
    ADD CONSTRAINT payroll_line_items_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_items payroll_line_items_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_items
    ADD CONSTRAINT payroll_line_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_line_items payroll_line_items_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_line_items
    ADD CONSTRAINT payroll_line_items_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_runs payroll_runs_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_approval_policy_id_fkey FOREIGN KEY (approval_policy_id) REFERENCES public.approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_runs payroll_runs_correction_of_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_correction_of_run_id_fkey FOREIGN KEY (correction_of_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payroll_runs payroll_runs_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payroll_runs payroll_runs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_runs
    ADD CONSTRAINT payroll_runs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_file_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_file_object_id_fkey FOREIGN KEY (file_object_id) REFERENCES public.file_objects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payslips payslips_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_payroll_line_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_payroll_line_item_id_fkey FOREIGN KEY (payroll_line_item_id) REFERENCES public.payroll_line_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: payslips payslips_payroll_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: platform_role_permissions platform_role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_role_permissions
    ADD CONSTRAINT platform_role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.platform_permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: platform_role_permissions platform_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_role_permissions
    ADD CONSTRAINT platform_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.platform_roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_members project_members_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_members project_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_members project_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: projects projects_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: projects projects_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: roles roles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: roles roles_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: roles roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: shift_break_rules shift_break_rules_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_break_rules
    ADD CONSTRAINT shift_break_rules_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: shifts shifts_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: shifts shifts_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: team_members team_members_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: team_members team_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teams teams_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teams teams_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: teams teams_team_lead_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_team_lead_employee_id_fkey FOREIGN KEY (team_lead_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: timesheet_approvals timesheet_approvals_approval_policy_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_approval_policy_step_id_fkey FOREIGN KEY (approval_policy_step_id) REFERENCES public.approval_policy_steps(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_approvals timesheet_approvals_approver_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_approver_user_id_fkey FOREIGN KEY (approver_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_approvals timesheet_approvals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_approvals timesheet_approvals_timesheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_approvals
    ADD CONSTRAINT timesheet_approvals_timesheet_id_fkey FOREIGN KEY (timesheet_id) REFERENCES public.timesheets(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_entries timesheet_entries_attendance_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_entries
    ADD CONSTRAINT timesheet_entries_attendance_record_id_fkey FOREIGN KEY (attendance_record_id) REFERENCES public.attendance_records(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_entries timesheet_entries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_entries
    ADD CONSTRAINT timesheet_entries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_entries timesheet_entries_timesheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_entries
    ADD CONSTRAINT timesheet_entries_timesheet_id_fkey FOREIGN KEY (timesheet_id) REFERENCES public.timesheets(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheet_periods timesheet_periods_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheets timesheets_approval_policy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_approval_policy_id_fkey FOREIGN KEY (approval_policy_id) REFERENCES public.approval_policies(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheets timesheets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheets timesheets_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheets timesheets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: timesheets timesheets_timesheet_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheets
    ADD CONSTRAINT timesheets_timesheet_period_id_fkey FOREIGN KEY (timesheet_period_id) REFERENCES public.timesheet_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_invitations user_invitations_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_invitations user_invitations_invited_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invited_by_user_id_fkey FOREIGN KEY (invited_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_invitations user_invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_organizations user_organizations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_organizations user_organizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_organizations
    ADD CONSTRAINT user_organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_platform_roles user_platform_roles_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_platform_roles
    ADD CONSTRAINT user_platform_roles_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_platform_roles user_platform_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_platform_roles
    ADD CONSTRAINT user_platform_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.platform_roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_platform_roles user_platform_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_platform_roles
    ADD CONSTRAINT user_platform_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_roles user_roles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_roles user_roles_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_roles user_roles_source_federation_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_source_federation_grant_id_fkey FOREIGN KEY (source_federation_grant_id) REFERENCES public.federation_grants(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_deliveries webhook_deliveries_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_deliveries webhook_deliveries_outbox_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_outbox_event_id_fkey FOREIGN KEY (outbox_event_id) REFERENCES public.outbox_events(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_deliveries webhook_deliveries_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.webhook_subscriptions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_delivery_attempts webhook_delivery_attempts_delivery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_delivery_attempts
    ADD CONSTRAINT webhook_delivery_attempts_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES public.webhook_deliveries(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_signing_keys webhook_signing_keys_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_signing_keys
    ADD CONSTRAINT webhook_signing_keys_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_signing_keys webhook_signing_keys_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_signing_keys
    ADD CONSTRAINT webhook_signing_keys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: webhook_subscriptions webhook_subscriptions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.federation_clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_subscriptions webhook_subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: webhook_subscriptions webhook_subscriptions_signing_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_subscriptions
    ADD CONSTRAINT webhook_subscriptions_signing_key_id_fkey FOREIGN KEY (signing_key_id) REFERENCES public.webhook_signing_keys(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_locations work_locations_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_locations work_locations_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_locations
    ADD CONSTRAINT work_locations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: approval_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_policy_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval_policy_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_punches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_branch_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_branch_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_compensation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_compensation ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_emergency_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_emergency_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_employment_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_employment_records ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_field_ownership; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_field_ownership ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_pay_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_pay_components ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_shift_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: external_id_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_id_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: federation_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.federation_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: federation_idempotency_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.federation_idempotency_records ENABLE ROW LEVEL SECURITY;

--
-- Name: federation_request_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.federation_request_records ENABLE ROW LEVEL SECURITY;

--
-- Name: file_objects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_objects ENABLE ROW LEVEL SECURITY;

--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_balance_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_balance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_federation_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_federation_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_source_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_source_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: pay_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pay_components ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_adjustments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_line_item_components; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_line_item_components ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: payroll_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: payslips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

--
-- Name: project_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: approval_policies tenant_isolation_approval_policies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_approval_policies ON public.approval_policies USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: approval_policy_steps tenant_isolation_approval_policy_steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_approval_policy_steps ON public.approval_policy_steps USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: attendance_approvals tenant_isolation_attendance_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_attendance_approvals ON public.attendance_approvals USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: attendance_corrections tenant_isolation_attendance_corrections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_attendance_corrections ON public.attendance_corrections USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: attendance_punches tenant_isolation_attendance_punches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_attendance_punches ON public.attendance_punches USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: attendance_records tenant_isolation_attendance_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_attendance_records ON public.attendance_records USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: audit_logs tenant_isolation_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_audit_logs ON public.audit_logs USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: auth_sessions tenant_isolation_auth_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_auth_sessions ON public.auth_sessions USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: branches tenant_isolation_branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_branches ON public.branches USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_branch_assignments tenant_isolation_employee_branch_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_branch_assignments ON public.employee_branch_assignments USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_compensation tenant_isolation_employee_compensation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_compensation ON public.employee_compensation USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_emergency_contacts tenant_isolation_employee_emergency_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_emergency_contacts ON public.employee_emergency_contacts USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_employment_records tenant_isolation_employee_employment_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_employment_records ON public.employee_employment_records USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_field_ownership tenant_isolation_employee_field_ownership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_field_ownership ON public.employee_field_ownership USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_pay_components tenant_isolation_employee_pay_components; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_pay_components ON public.employee_pay_components USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employee_shift_assignments tenant_isolation_employee_shift_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employee_shift_assignments ON public.employee_shift_assignments USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: employees tenant_isolation_employees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_employees ON public.employees USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: external_id_mappings tenant_isolation_external_id_mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_external_id_mappings ON public.external_id_mappings USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: federation_grants tenant_isolation_federation_grants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_federation_grants ON public.federation_grants USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: federation_idempotency_records tenant_isolation_federation_idempotency_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_federation_idempotency_records ON public.federation_idempotency_records USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: federation_request_records tenant_isolation_federation_request_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_federation_request_records ON public.federation_request_records USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: file_objects tenant_isolation_file_objects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_file_objects ON public.file_objects USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: holidays tenant_isolation_holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_holidays ON public.holidays USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: leave_approvals tenant_isolation_leave_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_leave_approvals ON public.leave_approvals USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: leave_balance_transactions tenant_isolation_leave_balance_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_leave_balance_transactions ON public.leave_balance_transactions USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: leave_balances tenant_isolation_leave_balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_leave_balances ON public.leave_balances USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: leave_requests tenant_isolation_leave_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_leave_requests ON public.leave_requests USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: leave_types tenant_isolation_leave_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_leave_types ON public.leave_types USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: organization_federation_capabilities tenant_isolation_organization_federation_capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_organization_federation_capabilities ON public.organization_federation_capabilities USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: organization_settings tenant_isolation_organization_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_organization_settings ON public.organization_settings USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: organization_source_changes tenant_isolation_organization_source_changes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_organization_source_changes ON public.organization_source_changes USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: organizations tenant_isolation_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_organizations ON public.organizations USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: outbox_events tenant_isolation_outbox_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_outbox_events ON public.outbox_events USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: pay_components tenant_isolation_pay_components; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_pay_components ON public.pay_components USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payroll_adjustments tenant_isolation_payroll_adjustments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payroll_adjustments ON public.payroll_adjustments USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payroll_approvals tenant_isolation_payroll_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payroll_approvals ON public.payroll_approvals USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payroll_line_item_components tenant_isolation_payroll_line_item_components; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payroll_line_item_components ON public.payroll_line_item_components USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payroll_line_items tenant_isolation_payroll_line_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payroll_line_items ON public.payroll_line_items USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payroll_runs tenant_isolation_payroll_runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payroll_runs ON public.payroll_runs USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: payslips tenant_isolation_payslips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payslips ON public.payslips USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: project_members tenant_isolation_project_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_project_members ON public.project_members USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: projects tenant_isolation_projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_projects ON public.projects USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: roles tenant_isolation_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_roles ON public.roles USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id IS NULL) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: shifts tenant_isolation_shifts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_shifts ON public.shifts USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: team_members tenant_isolation_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_team_members ON public.team_members USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: teams tenant_isolation_teams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_teams ON public.teams USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: timesheet_approvals tenant_isolation_timesheet_approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_timesheet_approvals ON public.timesheet_approvals USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: timesheet_entries tenant_isolation_timesheet_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_timesheet_entries ON public.timesheet_entries USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: timesheet_periods tenant_isolation_timesheet_periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_timesheet_periods ON public.timesheet_periods USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: timesheets tenant_isolation_timesheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_timesheets ON public.timesheets USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: user_invitations tenant_isolation_user_invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_user_invitations ON public.user_invitations USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: user_organizations tenant_isolation_user_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_user_organizations ON public.user_organizations USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: user_roles tenant_isolation_user_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_user_roles ON public.user_roles USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: webhook_deliveries tenant_isolation_webhook_deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_webhook_deliveries ON public.webhook_deliveries USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: webhook_subscriptions tenant_isolation_webhook_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_webhook_subscriptions ON public.webhook_subscriptions USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: work_locations tenant_isolation_work_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_work_locations ON public.work_locations USING (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid))) WITH CHECK (((current_setting('app.platform_bypass'::text, true) = 'true'::text) OR (organization_id = (NULLIF(current_setting('app.organization_id'::text, true), ''::text))::uuid)));


--
-- Name: timesheet_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: timesheet_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: timesheet_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheet_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: timesheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

--
-- Name: user_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: work_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

