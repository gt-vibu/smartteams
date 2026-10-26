-- Extend the named-policy schema already shipped by the September migration.
-- Keep every existing policy, component, assignment and salary snapshot.
ALTER TABLE public.payroll_policies
  ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- Match the prior resolver: prefer Standard payroll; otherwise retain the latest
-- named policy as the organization's default, including its dated versions.
WITH ranked AS (
  SELECT organization_id, name,
    row_number() OVER (
      PARTITION BY organization_id
      ORDER BY (name = 'Standard payroll') DESC, effective_from DESC, name ASC
    ) AS position
  FROM public.payroll_policies
)
UPDATE public.payroll_policies p SET is_default = true
FROM ranked r
WHERE r.position = 1 AND r.organization_id = p.organization_id AND r.name = p.name;

CREATE UNIQUE INDEX payroll_policies_organization_id_id_key
  ON public.payroll_policies (organization_id, id);
CREATE UNIQUE INDEX payroll_policies_default_effective_from_key
  ON public.payroll_policies (organization_id, effective_from) WHERE is_default;
CREATE UNIQUE INDEX pay_components_organization_id_id_key
  ON public.pay_components (organization_id, id);

-- Composite foreign keys enforce tenant ownership even outside the service layer.
ALTER TABLE public.employee_payroll_policies
  DROP CONSTRAINT employee_payroll_policies_payroll_policy_id_fkey,
  ADD CONSTRAINT employee_payroll_policies_policy_fkey
    FOREIGN KEY (organization_id, payroll_policy_id)
    REFERENCES public.payroll_policies (organization_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.payroll_policy_components
  DROP CONSTRAINT payroll_policy_components_payroll_policy_id_fkey,
  DROP CONSTRAINT payroll_policy_components_pay_component_id_fkey,
  ADD CONSTRAINT payroll_policy_components_policy_fkey
    FOREIGN KEY (organization_id, payroll_policy_id)
    REFERENCES public.payroll_policies (organization_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT payroll_policy_components_component_fkey
    FOREIGN KEY (organization_id, pay_component_id)
    REFERENCES public.pay_components (organization_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT;
