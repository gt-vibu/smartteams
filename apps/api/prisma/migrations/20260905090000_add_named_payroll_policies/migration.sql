ALTER TABLE public.payroll_policies
  ADD COLUMN name text NOT NULL DEFAULT 'Standard payroll';

DROP INDEX IF EXISTS public.payroll_policies_organization_id_effective_from_key;
CREATE UNIQUE INDEX payroll_policies_organization_name_effective_from_key
  ON public.payroll_policies (organization_id, name, effective_from);

ALTER TABLE public.employee_payroll_policies
  ADD COLUMN payroll_policy_id uuid;

ALTER TABLE public.employee_payroll_policies
  ADD CONSTRAINT employee_payroll_policies_payroll_policy_id_fkey
  FOREIGN KEY (payroll_policy_id) REFERENCES public.payroll_policies(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX employee_payroll_policies_policy_lookup_idx
  ON public.employee_payroll_policies (organization_id, payroll_policy_id, effective_from);

CREATE TABLE public.payroll_policy_components (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_policy_id uuid NOT NULL,
  pay_component_id uuid NOT NULL,
  amount numeric(14,2),
  percentage numeric(8,4),
  formula_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_policy_components_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_policy_components_unique UNIQUE (payroll_policy_id, pay_component_id),
  CONSTRAINT payroll_policy_components_amount_check CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT payroll_policy_components_percentage_check CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100))
);

CREATE INDEX payroll_policy_components_lookup_idx
  ON public.payroll_policy_components (organization_id, payroll_policy_id, display_order);

ALTER TABLE public.payroll_policy_components FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_policy_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payroll_policy_components
  ON public.payroll_policy_components
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE public.payroll_policy_components
  ADD CONSTRAINT payroll_policy_components_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
  ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_policy_components_payroll_policy_id_fkey
  FOREIGN KEY (payroll_policy_id) REFERENCES public.payroll_policies(id)
  ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_policy_components_pay_component_id_fkey
  FOREIGN KEY (pay_component_id) REFERENCES public.pay_components(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;
