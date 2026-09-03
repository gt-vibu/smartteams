# Authentication & Authorization Security Audit

Scope: `apps/api` (NestJS), `apps/web-org`, `apps/web-admin`, `packages/*`.
Date of audit: 2026-08-31. Branch: `feat/frontend-ems-screens`.

---

# AUTHENTICATION ARCHITECTURE

**As found.**

- Native user auth lives in `apps/api/src/modules/auth`. One 516-line `auth.service.ts` holds
  password hashing, registration, login, platform login, refresh, logout, password reset,
  invitation acceptance, session revocation and token minting.
- `NativeJwtGuard` (`jwt.guard.ts`) validates `Authorization: Bearer <jwt>` only. It re-reads
  the user and `AuthSession` row on every request and checks `isActive`, `tokenVersion`,
  session status/expiry and that `session.organizationId === payload.organizationId`.
- A separate, unrelated federation auth path exists (`modules/federation/federation-auth.*`)
  for machine-to-machine BlizBooks traffic. It is correctly isolated and out of scope.
- `PlatformAuthGuard` implements the platform (super admin) boundary via `UserPlatformRole`
  and explicitly refuses any identity that is also an organization member.
- **There is no `/me` endpoint.** Identity, roles and permissions are returned once by
  `POST /v1/auth/login` and then trusted by the browser indefinitely.
- Rate limiting: `AuthRateLimitInterceptor`, Redis counter keyed on `ip + path + minute`.

# COOKIE STORAGE

**As found: no cookies exist at all.**

- `grep -ri cookie apps/api/src` returns zero matches.
- `packages/config/src/env.ts` declares `SESSION_COOKIE_NAME`, `SESSION_COOKIE_DOMAIN` and
  `SESSION_COOKIE_SECURE`, and the production `superRefine` even *enforces*
  `SESSION_COOKIE_SECURE=true` outside development. None of these are read by any code.
  The configuration implies a cookie architecture that was never implemented.
- Consequently: no `HttpOnly`, no `SameSite`, no `Secure`, no CSRF defence, and no
  server-controlled session cookie lifetime.
- `main.ts` sets `app.enableCors({ credentials: true, origin: CORS_ORIGINS })` — credentialed
  CORS is already configured for a cookie architecture that does not exist yet.

# ACCESS TOKEN

- JWT, HS256, signed by `@nestjs/jwt` with `issuer`/`audience` set.
- TTL 900s (`JWT_ACCESS_TOKEN_TTL_SECONDS`). Reasonable.
- Claims: `sub` (userId), `sid` (AuthSession id), `tv` (tokenVersion), `organizationId`.
- Validated on every request against the database, so revocation is effective — good design.
- **Risk (HIGH): secret fallback.** `auth.module.ts` uses
  `JWT_SECRET || getOrThrow('FEDERATION_BOOTSTRAP_SECRET')`. `FEDERATION_BOOTSTRAP_SECRET`
  has a 16-character minimum, so a deployment without `JWT_SECRET` signs user sessions with a
  short secret belonging to a different trust domain, shared with the federation subsystem.
- **Risk (CRITICAL): storage.** Returned in the JSON login body and written by the browser to
  `localStorage` (`smarteam_access_token`) in `web-org`, and to `sessionStorage` in `web-admin`.
  Any XSS in either app exfiltrates a live session.

# REFRESH TOKEN

- Opaque 32-byte `base64url` value; only its SHA-256 hash is stored (`AuthSession.refreshTokenHash`).
  Correct.
- TTL 30 days (`JWT_REFRESH_TOKEN_TTL_SECONDS = 2_592_000`).
- Rotation exists: `refresh()` revokes the presented session (`revocationReason: 'ROTATED'`)
  and issues a new one.
- **Risk (HIGH): no reuse detection.** `AuthSession.tokenFamily` exists in the schema and is
  never read or written by application code. Replaying an already-rotated refresh token simply
  returns 401; the still-valid session that the thief or the victim holds is not revoked, so a
  stolen-token race is undetected and the attacker's chain survives.
- **Risk (CRITICAL): storage.** Written to `localStorage` as `smarteam_refresh_token` in
  `web-org` — a 30-day credential in JavaScript-readable storage.
- Transport: sent in the request body of `POST /v1/auth/refresh`, so it also lands in any
  request-body logging.
- Logout revokes only the current session. Password reset correctly bumps `tokenVersion` and
  revokes all sessions.

# /ME

**Does not exist.** The frontends synthesise the authenticated identity themselves:

- `web-org` `auth.repository.ts` builds a `Persona` from the login response, then falls back to
  fabricating one client-side (see PRODUCTION RISKS #2).
- `web-admin` keeps `{accessToken, userId, expiresIn}` in `sessionStorage` and never asks the
  server who the user is.

# AUTHORIZATION

- The intended chain is sound: `DomainContextFactory.native(userId, organizationId)` →
  `RbacService.loadOrganizationPermissions` → `DomainContext.permissions` →
  `requirePermission(context, key)` inside each service → `TenantDatabaseService.run()` which
  sets `app.organization_id` for Postgres RLS.
- Every domain service enforces `requirePermission` consistently (verified across all 28
  services); authorization is genuinely server-side for domain operations.
- **Gap (HIGH): the URL organization is trusted over the session organization.** Controllers are
  mounted at `v1/organizations/:organizationId/...` and call
  `contexts.native(request.user.userId, organizationId)` using the **path** value. The session's
  own `organizationId` (validated by the guard) is ignored. A user with roles in Org A and Org B
  can operate on Org B using a session that was issued and scoped to Org A.
- **Gap (HIGH): membership is never re-checked.** `loadOrganizationPermissions` reads `UserRole`
  rows filtered by `userId + organizationId` and a time window. It does not join
  `UserOrganization.status`. A user whose membership is set to `REMOVED`/`SUSPENDED` keeps full
  authorization for as long as their `UserRole` rows have no `endsAt`.

# RBAC

- Platform and tenant roles are correctly modelled by **separate tables**: `PlatformRole` /
  `PlatformPermission` / `UserPlatformRole` versus `Role` / `Permission` / `UserRole`.
  `ORG_ADMIN` cannot become a platform administrator through the data model. This boundary is
  correct as designed.
- `PlatformAuthGuard` additionally refuses any platform operator who holds an organization
  membership — a strong separation-of-duties control. Good.
- **Wildcard `"*"`:** `Permission.key` is globally unique, so one shared `*` row is linked to
  many org-scoped `Role`s. Scoping comes from `Role.organizationId` plus the
  `userRole.organizationId` filter in `loadOrganizationPermissions`, so `*` is **tenant-scoped**
  and does not cross tenants or reach platform permissions. That is correct, but it is implicit
  and undocumented.
- **Bug (CRITICAL, production-blocking): `register()` cannot create a second organization.**
  `auth.service.ts` does `tx.permission.create({ data: { key: '*' } })`. `Permission.key` is
  `@unique` globally, so the first self-service registration succeeds and every subsequent one
  fails with a Prisma P2002 unique-constraint violation surfaced as a 500. `onboardPlatform()`
  correctly uses `upsert`; `register()` was never updated.

# TENANT ISOLATION

- Defence in depth is real: Postgres RLS driven by `set_config('app.organization_id', ...)`
  inside every transaction, plus three separate database roles
  (`DATABASE_URL` / `DATABASE_SYSTEM_URL` / `DATABASE_PLATFORM_URL`) whose distinctness is
  enforced by the production env schema. This is a well-built foundation.
- Cross-tenant reads are blocked in practice because a user with no `UserRole` in Org B gets an
  empty permission set and `requirePermission` throws — but this is a **side effect**, not an
  explicit membership assertion. Combined with the two authorization gaps above, the isolation
  boundary is thinner than it looks.
- `AuthService.login()` uses `runSystem()` (the RLS-bypassing role) for the credential lookup.
  That is necessary pre-authentication, but it means the login path has no RLS backstop and must
  be reviewed by hand.

# PRODUCTION RISKS

Ordered by severity.

1. **CRITICAL — Authentication bypass in `web-admin`** (`apps/web-admin/lib/api-client.ts`,
   `platformLogin`). If the API call throws *for any reason — including a 401 rejection* — the
   catch block grants a superadmin session to anyone whose email merely *contains* `"admin"` or
   `"platform"`, or who types the hardcoded password `a hardcoded literal (redacted; see git history before this commit)`. Anyone who can
   reach the admin console and cause (or simply wait for) an API error becomes a platform
   super admin in the UI. The same file also fabricates organizations in `sessionStorage` when
   `listOrganizations`/`onboardOrganization`/`deactivateOrganization` fail, silently presenting
   fake data as real tenant records.

2. **CRITICAL — Privilege escalation in `web-org`** (`modules/ems/repositories/auth.repository.ts`,
   `loginWithCredentialsAsync`). When the API is unreachable *or returns 401*, any input matching
   `email.includes('@') && password.length >= 6` is turned into a persona with
   `roles: [ORG_ADMIN]` and `permissions: ['*']`, and the session is marked authenticated.
   Additionally, when the API *does* answer, `permissions.length > 0 ? permissions : ['*']`
   escalates a user the server said has **no** permissions into a wildcard admin.

3. **CRITICAL — Tokens in browser-readable storage.** Access token and 30-day refresh token in
   `localStorage` (`web-org`); access token in `sessionStorage` (`web-admin`).

4. **CRITICAL — `register()` unique-constraint bug** on the `*` permission (see RBAC).

5. **HIGH — Bearer tokens are written to the application log.** `app.module.ts` configures
   `nestjs-pino` with `pinoHttp: { level }` and no `redact`. `pino-http`'s default `req`
   serializer logs the full header set, so every request logs its `Authorization: Bearer <jwt>`
   header. Log access becomes session access.

6. **HIGH — Committed demo credentials.** `apps/web-org/modules/ems/data/fixtures/credentials.json`
   and `mock-users.json` contain plaintext passwords (`admin123`, `super123`, ...) that the login
   screen renders as click-to-fill buttons, mapped to personas holding `"*"`.

7. **HIGH — Session/URL organization mismatch and missing membership re-check** (see AUTHORIZATION).

8. **HIGH — No refresh-token reuse detection** (see REFRESH TOKEN).

9. **HIGH — JWT secret falls back to the federation bootstrap secret** (see ACCESS TOKEN).

10. **MEDIUM — No CSRF defence and no security headers.** Currently mitigated only because auth
    is a Bearer header. Any move to cookies requires CSRF protection first. `helmet` is absent:
    no HSTS, `X-Content-Type-Options`, `X-Frame-Options`, or `Referrer-Policy`.

11. **MEDIUM — Login is a user-existence oracle.** Two ways: (a) `verifyPassword` is skipped
    entirely when no user matches, so a non-existent account answers in ~1 ms while a real one
    costs an argon2id verification — a reliable timing oracle; (b) a correct password for a user
    with no membership returns the distinct message
    `"User has no active organization membership"`.

12. **MEDIUM — Brute-force limiting is per-IP only.** `auth:rate:{ip}:{path}:{minute}` does not
    constrain attempts against a single account from many source addresses. Separately, a Redis
    outage turns every authentication request into a 429 (fails closed — safe, but a total
    auth outage with no signal distinct from real rate limiting).

13. **MEDIUM — Arbitrary organization selection on multi-org login.** `login()` picks
    `user.memberships[0]` when no `organizationId` is supplied. The ordering is not
    deterministic, so a multi-tenant user can silently land in the wrong tenant.

14. **MEDIUM — `onboardPlatform` returns a plaintext `temporaryPassword` in the API response**
    and the admin UI displays it. There is no forced-rotation flag on `User`, so the generated
    credential can remain valid indefinitely.

15. **LOW — `POST /v1/auth/register` is unauthenticated self-service tenant creation** that
    provisions an `ORG_ADMIN` with `*`. Rate-limited, but it permits mass tenant creation.
    Flagged for a product decision; not changed by this task.

# MONOREPO ARCHITECTURE RISKS

- `packages/contracts` holds only federation and generic HTTP contracts. **No auth contract is
  shared**, so `AdminSession`, `OrganizationSummary`, `Persona` and the login response shape are
  hand-redeclared in each frontend and drift from the API.
- `apps/web-org` has no API client at all: raw `fetch` with an inline `process.env.NEXT_PUBLIC_API_URL`
  is embedded inside a repository class that also owns fixtures, persona state and permission
  logic — four responsibilities in one file.
- `apps/web-admin/lib/api-client.ts` mixes transport, session storage, response validation,
  **and offline data fabrication** in one module.
- `packages/config` already exports `parseWebEnv`; neither web app uses it.

# CODE QUALITY RISKS

Measured against the <=250-line guideline:

| File | Lines | Problem |
|---|---|---|
| `apps/api/src/modules/auth/auth.service.ts` | 516 | Entire auth system in one class: hashing, registration, login, platform login, refresh, logout, reset, invitations, token minting. |
| `apps/web-org/modules/ems/repositories/auth.repository.ts` | ~420 | Fixture store + HTTP client + persona state + permission policy + storage writes. |
| `apps/web-admin/lib/api-client.ts` | ~430 | Transport + session + validation + fabricated fallbacks. |
| `apps/api/src/modules/organizations/onboarding-auth.spec.ts` | 441 | New, untracked; uses `any` throughout, which violates the repo's `@typescript-eslint/no-explicit-any: error` rule. |

Also: authorization policy is duplicated in `use-auth.ts` (`canAccessModule`) and
`auth.repository.ts` (`canApprove`) with subtly different wildcard semantics, and `web-org`
currently **fails `pnpm typecheck`** on `auth.repository.ts:230`.

# RECOMMENDED CHANGES

1. Delete both frontend authentication-bypass fallbacks and all fabricated-data fallbacks.
2. Move browser tokens out of JavaScript-readable storage into `HttpOnly` cookies; add
   double-submit CSRF protection and security headers as a precondition.
3. Add `GET /v1/auth/me` as the single server-derived source of identity/roles/permissions.
4. Implement refresh-token rotation with family-based reuse detection using the existing
   `AuthSession.tokenFamily` column.
5. Fix the `register()` `*`-permission unique-constraint bug.
6. Enforce session-organization == requested-organization, and assert active membership in
   `DomainContextFactory.native`.
7. Redact `authorization`/`cookie`/credential fields from logs.
8. Require `JWT_SECRET`; remove the federation-secret fallback.
9. Make login constant-time and its errors uniform; add per-account rate limiting.
10. Require explicit organization selection for multi-membership users.
11. Split `auth.service.ts` and both frontend god-modules along responsibility lines; move the
    shared auth response shapes into `packages/contracts`.

---

# REMEDIATION LOG

Implemented on 2026-08-31, after the audit above. Numbers refer to PRODUCTION RISKS.

| # | Status | Change |
|---|---|---|
| 1 | Fixed | `apps/web-admin/lib/api-client.ts` split into `http-client` / `auth-client` / `organizations-client` / `federation-client`. The offline superadmin fallback and every fabricated-data fallback are deleted; each call now succeeds against the API or throws. |
| 2 | Fixed | `web-org` sign-in goes through `session.repository.ts` only. The fabricated-persona branch is gone, and permissions come from `/me` with no wildcard default. |
| 3 | Fixed | Tokens moved to HttpOnly cookies (`auth.cookies.ts`). Neither app stores a token; both send `credentials: 'include'`. |
| 4 | Fixed | `grantOrganizationAdmin` upserts the `"*"` permission, so the second and later registrations succeed. |
| 5 | Fixed | `pinoHttp.redact` removes `authorization`, `cookie`, `set-cookie`, `x-csrf-token` and credential body fields. |
| 6 | Fixed | `credentials.json` deleted; the `password` field stripped from `mock-users.json`; the demo-credential panel removed from the sign-in screen. |
| 7 | Fixed | `DomainContextFactory.native` rejects a path organization that differs from the session's; `RbacService.loadOrganizationPermissions` and `NativeJwtGuard` both require an ACTIVE membership. |
| 8 | Fixed | `AuthSessionService.rotate` implements single-use rotation with `tokenFamily` reuse detection; a replayed token revokes the family. |
| 9 | Fixed | `JWT_SECRET` is required by the schema; the `FEDERATION_BOOTSTRAP_SECRET` fallback is removed, and HS256 is pinned for both signing and verification. |
| 10 | Fixed | `CsrfMiddleware` (double-submit) and `SecurityHeadersMiddleware` (HSTS, CSP, nosniff, frame-deny, referrer, COOP/CORP, permissions-policy) added. |
| 11 | Fixed | `PasswordService.verifyDecoy` equalises timing for unknown accounts; every credential failure returns the identical message. |
| 12 | Fixed | `AuthRateLimitInterceptor` adds a per-account counter keyed on a digest of the normalized email. |
| 13 | Fixed | Multi-membership login returns `ORGANIZATION_SELECTION_REQUIRED` and issues no session until the user chooses. |
| 14 | **Open** | `onboardPlatform` still returns a plaintext `temporaryPassword`. See REMAINING RISKS. |
| 15 | **Open — by design** | `POST /v1/auth/register` remains open self-service tenant creation. Unchanged pending a product decision. |

## Architecture after remediation

```
browser ──► POST /v1/auth/login          (credentials in body, over TLS)
        ◄── Set-Cookie: session   HttpOnly, SameSite, Secure, Path=/
        ◄── Set-Cookie: ..._refresh   HttpOnly, Path=/v1/auth
        ◄── Set-Cookie: ..._csrf   readable, double-submit half
        ◄── { outcome, userId, organizationId, csrfToken, expiresIn }   no tokens

browser ──► GET /v1/auth/me              cookie only
        ◄── identity + memberships + active org + roles + permissions + platform authority

browser ──► any mutation                 cookie + x-csrf-token
            NativeJwtGuard   re-reads user, session and membership every request
            DomainContextFactory.native   session org == path org, membership ACTIVE
            requirePermission   tenant-scoped keys, "*" bounded to one tenant
            TenantDatabaseService.run   sets app.organization_id for Postgres RLS

access token expires (900s)
browser ──► POST /v1/auth/refresh        refresh cookie only, never in a body
            single-use rotation, tokenFamily inherited
            replay of a spent token ⇒ whole family revoked
```

## REMAINING RISKS

1. **Plaintext `temporaryPassword` at onboarding (MEDIUM).** `onboardPlatform` still returns a
   generated password in its response for the operator to relay out of band, and `User` has no
   forced-rotation flag, so the credential stays valid until changed. Fixing it properly means
   switching onboarding to the existing `UserInvitation` token flow and adding a
   `mustChangePassword` column — a schema migration and a product change, both outside this
   task's scope. It is redacted from logs, but it is still a shared secret in a response body.
2. **Open self-service registration (LOW).** `POST /v1/auth/register` creates a tenant and an
   `ORG_ADMIN` without authentication. Rate-limited per IP and per account, but it permits mass
   tenant creation. Left unchanged as a product decision.
3. **Redis is a hard dependency for authentication (MEDIUM, availability).** The rate limiter
   fails closed, so a Redis outage rejects every sign-in. Safe, but it needs an alert that
   distinguishes an outage from genuine rate limiting.
4. **No end-to-end HTTP tests.** Coverage is unit-level against mocked Prisma clients. The RLS
   policies, the real cookie round-trip and true cross-tenant HTTP calls are not exercised by an
   automated suite; a supertest-plus-database integration suite is the natural next step.
5. **Refresh-token reuse is detected but not alerted.** It is logged at `warn`; nothing pages a
   human or notifies the account owner.
6. **Federation subsystem not re-audited.** `modules/federation` has its own client-credentials
   auth path and was out of scope here.
