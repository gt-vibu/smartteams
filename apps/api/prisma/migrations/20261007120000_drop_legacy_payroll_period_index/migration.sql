-- The initial payroll-period uniqueness was created as an index, not a table constraint.
-- The correction-run migration attempted to drop it as a constraint, leaving it behind and
-- preventing a correction from sharing the original run's period.
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_organization_id_period_start_period_end_key;
DROP INDEX IF EXISTS public.payroll_runs_organization_id_period_start_period_end_key;

-- One non-voided original run per period. Corrections are allowed alongside their original
-- because they carry correction_of_run_id; voided drafts can be replaced with a fresh original.
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_one_original_per_period_key
  ON public.payroll_runs (organization_id, period_start, period_end)
  WHERE correction_of_run_id IS NULL AND status <> 'VOIDED';
