-- Allow explicitly granted federation clients to read payroll ledger rows across employees.
-- This scope is intentionally not added to existing grants automatically.
INSERT INTO "federation_scopes" ("id", "code", "description", "is_active")
VALUES (
  gen_random_uuid(),
  'payroll.ledger.read.all',
  'Read payroll ledger entries for all employees.',
  TRUE
)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description",
    "is_active" = TRUE;
