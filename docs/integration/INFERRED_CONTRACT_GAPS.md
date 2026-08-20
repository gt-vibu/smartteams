# Federation Contract Verification Gaps

The implementation follows `docs/integration/INTEGRATION_GUIDE.v1.md` for endpoint paths and transport security. The following items need confirmation from sanitized BlizBooks traffic before the federation contract can be called wire-verified:

1. **Initial tenant bootstrap:** the current schema requires a tenant and an explicit federation grant before a federation request is authorized. The tenant sync route therefore requires platform-side tenant registration/grant creation first. The platform API now supports pre-registering a `BLIZBOOKS` organization with its external ID; BlizBooks and Smarteam must confirm the operational bootstrap sequence and how the first grant is issued. Authorization must not be weakened to make an untrusted client create its own tenant or grant.
2. **Payload field mapping:** exact JSON casing, nesting, and enum values for tenant/branch sync, employees, attendance, leave, payroll, and WebAuthn payloads were not included in the guide. DTOs currently isolate the inferred mapping at the federation controller boundary.
3. **External versus local identifiers:** branch and employee fields such as `primaryBranchId`, `employeeId`, and `branchId` need confirmation as to whether they carry BlizBooks external IDs or Smarteam UUIDs. Path-based federation identifiers are resolved through the grant adapter; body fields currently follow the documented/native DTO shape.
4. **Webhook wire format:** confirm the exact RSA signature headers, timestamp format, key identifier header, and canonical signed bytes. The implementation currently signs `timestamp.body` with RSA-SHA256 and publishes the public PEM key.
5. **Payroll calendar semantics:** the guide names `/{year}/{month}` while the approved schema stores the organization payroll day as a current setting. Confirm whether the path is informational or requires a per-month calendar record before adding a schema change.
6. **Contract fixtures:** real sanitized request/response samples and mTLS reverse-proxy integration tests are still required. Unit tests cover deterministic domain calculations, idempotency fingerprints, and RSA signing, but cannot prove compatibility with an unavailable external payload.

These are explicit verification items, not silent TODOs in the domain layer.

## Release gates still open

These are implementation/deployment gates rather than BlizBooks payload questions:

7. **Database role deployment:** the application now supports distinct `DATABASE_URL`, `DATABASE_SYSTEM_URL`, and `DATABASE_PLATFORM_URL` pools and rejects reused URLs in staging/production. The deployment still must provision the corresponding least-privilege roles and verify that the runtime role cannot bypass RLS.
8. **Integration verification:** the repository now includes native update/deactivate operations for shifts, teams, projects, and approval policies, plus the configurable timesheet approval chain. Full native/federation endpoint integration tests, RLS bypass/isolation tests, and real BlizBooks traffic contract fixtures are still required for the Phase 1 exit criteria.
9. **Stable response DTO audit:** the federation adapters isolate several inferred request mappings, but some native and federation read paths still return Prisma-shaped nested objects. These must be converted to explicit versioned response DTOs before declaring the external API contract frozen.
