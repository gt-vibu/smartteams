CREATE TYPE public."PayrollRoundingMode" AS ENUM ('HALF_UP', 'DOWN', 'UP');
CREATE TYPE public."SalarySlipMode" AS ENUM ('ENABLED', 'DISABLED');
CREATE TYPE public."SalaryAdvanceStatus" AS ENUM (
  'REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PARTIALLY_RECOVERED', 'RECOVERED'
);
CREATE TYPE public."PayrollPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');
CREATE TYPE public."PayrollPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'UPI', 'CHEQUE', 'OTHER');

ALTER TABLE public.employee_compensation
  ADD COLUMN gross_salary numeric(14,2);

CREATE TABLE public.payroll_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  salary_slip_default boolean NOT NULL DEFAULT true,
  payroll_enabled_default boolean NOT NULL DEFAULT true,
  payroll_day_basis smallint NOT NULL DEFAULT 30,
  base_percentage numeric(8,4) NOT NULL DEFAULT 50,
  base_minimum numeric(14,2) NOT NULL DEFAULT 15000,
  hra_percentage numeric(8,4) NOT NULL DEFAULT 40,
  pf_default boolean NOT NULL DEFAULT false,
  esi_default boolean NOT NULL DEFAULT false,
  pt_default boolean NOT NULL DEFAULT false,
  statutory_jurisdiction text,
  rounding_mode public."PayrollRoundingMode" NOT NULL DEFAULT 'HALF_UP',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_policies_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_policies_date_order_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT payroll_policies_day_basis_check CHECK (payroll_day_basis > 0),
  CONSTRAINT payroll_policies_base_percentage_check CHECK (base_percentage >= 0 AND base_percentage <= 100),
  CONSTRAINT payroll_policies_base_minimum_check CHECK (base_minimum >= 0),
  CONSTRAINT payroll_policies_hra_percentage_check CHECK (hra_percentage >= 0 AND hra_percentage <= 100)
);
CREATE UNIQUE INDEX payroll_policies_organization_id_effective_from_key
  ON public.payroll_policies (organization_id, effective_from);
CREATE INDEX payroll_policies_organization_id_effective_idx
  ON public.payroll_policies (organization_id, effective_from, effective_to);
ALTER TABLE public.payroll_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payroll_policies ON public.payroll_policies
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.payroll_policies ADD CONSTRAINT payroll_policies_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE public.payroll_statutory_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  scheme_code text NOT NULL,
  jurisdiction text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  employee_rate numeric(8,4),
  employer_rate numeric(8,4),
  wage_ceiling numeric(14,2),
  employee_threshold numeric(14,2),
  flat_amount numeric(14,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_statutory_rules_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_statutory_rules_date_order_check CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT payroll_statutory_rules_rates_check CHECK (
    (employee_rate IS NULL OR employee_rate >= 0) AND
    (employer_rate IS NULL OR employer_rate >= 0) AND
    (wage_ceiling IS NULL OR wage_ceiling >= 0) AND
    (employee_threshold IS NULL OR employee_threshold >= 0) AND
    (flat_amount IS NULL OR flat_amount >= 0)
  )
);
CREATE UNIQUE INDEX payroll_statutory_rules_unique
  ON public.payroll_statutory_rules (organization_id, scheme_code, jurisdiction, effective_from);
CREATE INDEX payroll_statutory_rules_lookup_idx
  ON public.payroll_statutory_rules (organization_id, scheme_code, jurisdiction, effective_from);
ALTER TABLE public.payroll_statutory_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_statutory_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payroll_statutory_rules ON public.payroll_statutory_rules
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.payroll_statutory_rules ADD CONSTRAINT payroll_statutory_rules_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE public.employee_payroll_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  payroll_enabled boolean NOT NULL DEFAULT true,
  salary_slip_mode public."SalarySlipMode" NOT NULL DEFAULT 'ENABLED',
  pf_enabled boolean NOT NULL DEFAULT false,
  esi_enabled boolean NOT NULL DEFAULT false,
  pt_enabled boolean NOT NULL DEFAULT false,
  statutory_jurisdiction text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_payroll_policies_pkey PRIMARY KEY (id),
  CONSTRAINT employee_payroll_policies_date_order_check CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX employee_payroll_policies_unique
  ON public.employee_payroll_policies (organization_id, employee_id, effective_from);
CREATE INDEX employee_payroll_policies_lookup_idx
  ON public.employee_payroll_policies (organization_id, employee_id, effective_from);
ALTER TABLE public.employee_payroll_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_payroll_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_employee_payroll_policies ON public.employee_payroll_policies
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.employee_payroll_policies
  ADD CONSTRAINT employee_payroll_policies_organization_id_fkey FOREIGN KEY (organization_id)
    REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT employee_payroll_policies_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE public.salary_advances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  requested_amount numeric(14,2) NOT NULL,
  approved_amount numeric(14,2),
  recovered_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public."SalaryAdvanceStatus" NOT NULL DEFAULT 'REQUESTED',
  reason text NOT NULL,
  requested_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at timestamptz(6),
  approved_by_user_id uuid,
  rejected_at timestamptz(6),
  rejected_by_user_id uuid,
  source public."PayrollAdjustmentSource" NOT NULL DEFAULT 'NATIVE',
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT salary_advances_pkey PRIMARY KEY (id),
  CONSTRAINT salary_advances_amount_check CHECK (requested_amount > 0 AND (approved_amount IS NULL OR approved_amount > 0) AND recovered_amount >= 0)
);
CREATE UNIQUE INDEX salary_advances_external_key ON public.salary_advances (organization_id, external_id);
CREATE INDEX salary_advances_lookup_idx ON public.salary_advances (organization_id, employee_id, status, requested_at);
ALTER TABLE public.salary_advances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_salary_advances ON public.salary_advances
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.salary_advances
  ADD CONSTRAINT salary_advances_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT salary_advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT salary_advances_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT salary_advances_rejected_by_user_id_fkey FOREIGN KEY (rejected_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE public.salary_advance_recoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  salary_advance_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  recovered_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT salary_advance_recoveries_pkey PRIMARY KEY (id),
  CONSTRAINT salary_advance_recoveries_amount_check CHECK (amount > 0)
);
CREATE UNIQUE INDEX salary_advance_recoveries_unique ON public.salary_advance_recoveries (salary_advance_id, payroll_run_id);
CREATE INDEX salary_advance_recoveries_lookup_idx ON public.salary_advance_recoveries (organization_id, employee_id, recovered_at);
ALTER TABLE public.salary_advance_recoveries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advance_recoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_salary_advance_recoveries ON public.salary_advance_recoveries
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.salary_advance_recoveries
  ADD CONSTRAINT salary_advance_recoveries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT salary_advance_recoveries_salary_advance_id_fkey FOREIGN KEY (salary_advance_id) REFERENCES public.salary_advances(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT salary_advance_recoveries_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT salary_advance_recoveries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TABLE public.payroll_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  payroll_line_item_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  status public."PayrollPaymentStatus" NOT NULL DEFAULT 'PENDING',
  payment_method public."PayrollPaymentMethod",
  payment_reference text,
  paid_at timestamptz(6),
  marked_by_user_id uuid,
  failure_reason text,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_payments_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_payments_amount_check CHECK (amount >= 0)
);
CREATE UNIQUE INDEX payroll_payments_line_item_key ON public.payroll_payments (payroll_line_item_id);
CREATE INDEX payroll_payments_run_status_idx ON public.payroll_payments (organization_id, payroll_run_id, status);
CREATE INDEX payroll_payments_employee_paid_idx ON public.payroll_payments (organization_id, employee_id, paid_at);
ALTER TABLE public.payroll_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payroll_payments ON public.payroll_payments
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
ALTER TABLE public.payroll_payments
  ADD CONSTRAINT payroll_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_payments_payroll_run_id_fkey FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_runs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_payments_payroll_line_item_id_fkey FOREIGN KEY (payroll_line_item_id) REFERENCES public.payroll_line_items(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_payments_marked_by_user_id_fkey FOREIGN KEY (marked_by_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;
