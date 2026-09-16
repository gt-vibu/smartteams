WITH sole_active_policy AS (
  SELECT organization_id, domain, (ARRAY_AGG(id ORDER BY id))[1] AS policy_id
  FROM approval_policies
  WHERE is_active = true
  GROUP BY organization_id, domain
  HAVING COUNT(*) = 1
),
domains_without_default AS (
  SELECT sole.organization_id, sole.domain, sole.policy_id
  FROM sole_active_policy sole
  WHERE NOT EXISTS (
    SELECT 1
    FROM approval_policies policy
    WHERE policy.organization_id = sole.organization_id
      AND policy.domain = sole.domain
      AND policy.is_active = true
      AND policy.is_default = true
  )
)
UPDATE approval_policies policy
SET is_default = true,
    updated_at = CURRENT_TIMESTAMP
FROM domains_without_default missing
WHERE policy.id = missing.policy_id;
