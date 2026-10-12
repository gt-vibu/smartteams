ALTER TABLE "employee_payroll_policies"
  ADD COLUMN "assignment_source" TEXT NOT NULL DEFAULT 'INDIVIDUAL_OVERRIDE',
  ADD COLUMN "assignment_rule_id" UUID;


CREATE TABLE "payroll_policy_assignment_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "payroll_policy_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "criteria" JSONB NOT NULL DEFAULT '{}',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_policy_assignment_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_policy_assignment_rules_org_enabled_priority_idx"
  ON "payroll_policy_assignment_rules"("organization_id", "enabled", "priority", "effective_from");
CREATE INDEX "payroll_policy_assignment_rules_org_policy_idx"
  ON "payroll_policy_assignment_rules"("organization_id", "payroll_policy_id");
CREATE INDEX "employee_payroll_policies_assignment_rule_idx"
  ON "employee_payroll_policies"("assignment_rule_id");

ALTER TABLE "payroll_policy_assignment_rules"
  ADD CONSTRAINT "payroll_policy_assignment_rules_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_policy_assignment_rules"
  ADD CONSTRAINT "payroll_policy_assignment_rules_payroll_policy_id_fkey"
  FOREIGN KEY ("payroll_policy_id") REFERENCES "payroll_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_payroll_policies"
  ADD CONSTRAINT "employee_payroll_policies_assignment_rule_id_fkey"
  FOREIGN KEY ("assignment_rule_id") REFERENCES "payroll_policy_assignment_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
