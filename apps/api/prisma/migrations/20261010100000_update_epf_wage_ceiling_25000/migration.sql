-- The mandatory EPF coverage wage ceiling increased to ₹25,000 from 17 September 2026.
-- Preserve the old ceiling for earlier periods and carry forward only the standard 12% rules.
UPDATE payroll_statutory_rules
SET wage_ceiling = 25000,
    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{source}', '"EPFO wage ceiling update, Gazette S.O. 5109(E), effective 2026-09-17"'::jsonb, true),
    updated_at = NOW()
WHERE scheme_code IN ('EPF', 'PF')
  AND employee_rate = 12
  AND employer_rate = 12
  AND wage_ceiling = 15000
  AND effective_from >= DATE '2026-09-17';

UPDATE payroll_statutory_rules
SET effective_to = DATE '2026-09-16', updated_at = NOW()
WHERE scheme_code IN ('EPF', 'PF')
  AND employee_rate = 12
  AND employer_rate = 12
  AND wage_ceiling = 15000
  AND effective_from < DATE '2026-09-17'
  AND (effective_to IS NULL OR effective_to >= DATE '2026-09-17');

INSERT INTO payroll_statutory_rules (
  id, organization_id, scheme_code, jurisdiction, effective_from, effective_to,
  employee_rate, employer_rate, wage_ceiling, employee_threshold, flat_amount, metadata,
  created_at, updated_at
)
SELECT
  gen_random_uuid(), old.organization_id, old.scheme_code, old.jurisdiction,
  DATE '2026-09-17', NULL, old.employee_rate, old.employer_rate, 25000,
  old.employee_threshold, old.flat_amount,
  jsonb_set(COALESCE(old.metadata, '{}'::jsonb), '{source}', '"EPFO wage ceiling update, Gazette S.O. 5109(E), effective 2026-09-17"'::jsonb, true),
  NOW(), NOW()
FROM payroll_statutory_rules old
WHERE old.scheme_code IN ('EPF', 'PF')
  AND old.employee_rate = 12
  AND old.employer_rate = 12
  AND old.wage_ceiling = 15000
  AND old.effective_to = DATE '2026-09-16'
  AND NOT EXISTS (
    SELECT 1 FROM payroll_statutory_rules current
    WHERE current.organization_id = old.organization_id
      AND current.scheme_code = old.scheme_code
      AND current.jurisdiction = old.jurisdiction
      AND current.effective_from = DATE '2026-09-17'
  );

-- Runs already calculated against the old ceiling must be recalculated before approval/release.
UPDATE payroll_runs
SET calculation_stale_at = NOW(), version = version + 1, updated_at = NOW()
WHERE status IN ('CALCULATED', 'APPROVED')
  AND calculation_stale_at IS NULL
  AND period_end >= DATE '2026-09-17';
