CREATE TABLE "payroll_compliance_source_checks" (
  "organization_id" UUID NOT NULL,
  "source_key" TEXT NOT NULL,
  "scheme_code" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "source_label" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "content_hash" CHAR(64),
  "etag" TEXT,
  "last_modified" TEXT,
  "checked_at" TIMESTAMPTZ(6),
  "source_changed_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_compliance_source_checks_pkey" PRIMARY KEY ("organization_id", "source_key"),
  CONSTRAINT "payroll_compliance_source_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payroll_compliance_source_checks_organization_id_checked_at_idx"
  ON "payroll_compliance_source_checks"("organization_id", "checked_at");

ALTER TABLE "payroll_compliance_source_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_compliance_source_checks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_compliance_source_checks_tenant_policy" ON "payroll_compliance_source_checks"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE TABLE "payroll_rule_update_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "source_key" TEXT NOT NULL,
  "source_hash" CHAR(64) NOT NULL,
  "scheme_code" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "source_label" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  "change_summary" TEXT NOT NULL,
  "current_rule" JSONB,
  "proposed_rule" JSONB,
  "impact_preview" JSONB,
  "effective_from" DATE,
  "decided_by_user_id" UUID,
  "decided_at" TIMESTAMPTZ(6),
  "decision_note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_rule_update_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_rule_update_proposals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payroll_rule_update_proposals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payroll_rule_update_proposals_org_source_hash_key" UNIQUE ("organization_id", "source_key", "source_hash")
);

CREATE INDEX "payroll_rule_update_proposals_organization_id_status_created_at_idx"
  ON "payroll_rule_update_proposals"("organization_id", "status", "created_at");

ALTER TABLE "payroll_rule_update_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_rule_update_proposals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payroll_rule_update_proposals_tenant_policy" ON "payroll_rule_update_proposals"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
