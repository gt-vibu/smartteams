-- The initial schema created a standalone index, not a constraint. The older
-- correction migration dropped only a constraint, leaving replacements blocked.
ALTER TABLE public.payroll_runs DROP CONSTRAINT IF EXISTS payroll_runs_organization_id_period_start_period_end_key;
DROP INDEX IF EXISTS public.payroll_runs_organization_id_period_start_period_end_key;
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_one_original_per_period
ON public.payroll_runs (organization_id, period_start, period_end)
WHERE correction_of_run_id IS NULL;
