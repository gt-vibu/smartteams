-- A payroll run whose inputs changed after calculation must not be approved or released with the
-- stale figures. The column is nullable and defaults to NULL, so existing runs are unaffected.
ALTER TABLE "payroll_runs"
  ADD COLUMN IF NOT EXISTS "calculation_stale_at" TIMESTAMPTZ(6);
