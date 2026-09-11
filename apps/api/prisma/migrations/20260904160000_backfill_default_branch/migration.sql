-- Give every organization a branch.
--
-- Platform onboarding created a "Headquarters" branch; self-service registration did not. Leave
-- requests require the requesting employee to have a branch, so in a tenant with none the request
-- was refused with "an employee branch is required" and there was no branch available to assign —
-- leave was unusable and could not be made usable from inside the product.
--
-- Idempotent: guarded on the organization having no branch at all, so tenants that already have
-- one (including several) are untouched.
INSERT INTO branches (id, organization_id, name, code, source, created_at, updated_at)
SELECT gen_random_uuid(), o.id, 'Headquarters', 'HQ', 'NATIVE', now(), now()
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM branches b WHERE b.organization_id = o.id);
