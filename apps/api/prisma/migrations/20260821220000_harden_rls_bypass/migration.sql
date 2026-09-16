-- RLS must not trust a client-set session variable as an authorization signal.
-- Runtime connections remain tenant-scoped by app.organization_id. System and
-- platform connections must use separately provisioned PostgreSQL roles with
-- the required elevated privilege (for example, BYPASSRLS).
DO $$
DECLARE
  policy_record RECORD;
  tenant_column TEXT;
  tenant_expression TEXT;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'tenant_isolation_%'
  LOOP
    tenant_column := CASE
      WHEN policy_record.tablename = 'organizations' THEN 'id'
      ELSE 'organization_id'
    END;

    tenant_expression := CASE
      WHEN policy_record.tablename = 'file_object_versions' THEN
        'EXISTS (SELECT 1 FROM public.file_objects file_row WHERE file_row.id = file_object_versions.file_object_id AND file_row.organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)'
      ELSE format(
        '"%s" = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid',
        tenant_column
      )
    END;

    IF policy_record.tablename = 'roles' THEN
      tenant_expression := format(
        '("organization_id" IS NULL OR %s)',
        tenant_expression
      );
    END IF;

    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
      policy_record.policyname,
      policy_record.tablename,
      tenant_expression,
      tenant_expression
    );
  END LOOP;
END $$;
