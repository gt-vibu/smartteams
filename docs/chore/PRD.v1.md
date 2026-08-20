# Product Requirements Document — Smarteam V2

**Status:** Draft for engineering review
**Owner:** Smarteam Product/Engineering
**Related documents:** Smarteam V2 Rewrite Plan, BlizBooks Federation Integration Guide (existing contract)

---

## 1. Overview

Smarteam is being rebuilt as a standalone **People Management platform** that can be used in two ways:

1. **Directly**, by any organization that signs up and uses Smarteam on its own.
2. **Through BlizBooks**, which today embeds Smarteam as its workforce module via a federation contract (OAuth client credentials, signed requests, webhooks).

V2 must serve both without compromising either: a direct customer must never be aware that federation exists, and BlizBooks must never be aware that the internal implementation changed. The BlizBooks integration must continue to work against materially the same external contract it uses today (endpoint paths may shift slightly; the overall mechanism, auth model, and data contract must not require a major BlizBooks-side rewrite).

### 1.1 Problem Statement

The current Smarteam implementation was built with the BlizBooks federation model as its foundation, which has made the codebase difficult to extend, difficult to reason about, and unsuitable as a base for direct/standalone customers or future third-party integrations. V2 must invert this: the federation integration becomes one adapter into a standalone product, not the foundation the product is built on.

### 1.2 Goals

- Smarteam functions as a fully standalone People Management product with no BlizBooks dependency for native customers.
- The existing BlizBooks federation contract continues to work with no major changes on the BlizBooks side.
- All business logic exists exactly once, regardless of whether it is invoked natively or via federation.
- The platform supports onboarding future third-party integrations using the same integration mechanism BlizBooks uses.
- Data ownership between BlizBooks-managed and Smarteam-managed records is explicit and never ambiguous.

### 1.3 Non-Goals

- Redesigning or renegotiating the BlizBooks external contract.
- Building a UI/frontend (covered by a separate PRD once the API layer is stable).
- Supporting identity providers or integrations beyond BlizBooks at initial launch (the mechanism must support it; building additional integrations is future scope).
- Timeline, staffing, and delivery scheduling (explicitly out of scope for this document).

---

## 2. Users and Actors

| Actor | Description |
|---|---|
| **Platform Super Admin** | Operates Smarteam itself across all customers (native and federated). Manages platform-level configuration, federation clients, and support operations. |
| **Organization Admin** (native) | Full control over a native customer's organization: users, roles, employees, settings. |
| **HR Admin** | Manages employees, leave, attendance, payroll within an organization or assigned branches. |
| **Manager** | Manages a team/branch: approves leave, views attendance, manages timesheets for direct reports. |
| **Employee** (native) | Self-service: clock in/out, apply for leave, view payslips, view own timesheet. |
| **Federated Employee** | Same self-service capabilities as a native employee, but identity and certain fields are owned by BlizBooks. |
| **Federation Client** (BlizBooks, future third parties) | A machine actor, not a user. Authenticates via OAuth client credentials, acts within granted scopes/tenant/branch boundaries. Must never be modeled or authorized as a human user. |

---

## 3. System Scope

### 3.1 In Scope — Core Domains

- Organizations and branches
- Users and authentication (native and federated)
- Roles and permissions (RBAC)
- Employees
- Attendance
- Leave
- Timesheets
- Shifts
- Payroll
- Integration platform: OAuth clients, federation grants, webhooks, event replay, audit log

### 3.2 In Scope — Access Modes

- **Application API**: consumed by the native Smarteam frontend and any first-party client acting on behalf of a logged-in human user.
- **Federation/Integration API**: consumed by BlizBooks and future authorized external systems, authenticated as an application, not a user.

### 3.3 Out of Scope (this PRD)

- Frontend UI/UX specification
- Billing/subscription management for native customers
- Timelines, staffing, rollout scheduling
- Any BlizBooks-side changes beyond what is explicitly listed in §9

---

## 4. Functional Requirements

Each requirement below applies **identically** regardless of access mode (native or federated) unless explicitly stated otherwise. Business rules must not fork based on how a request entered the system.

### 4.1 Organizations and Branches

- FR-1: The system shall support creating and managing organizations, each with a `source` of `NATIVE` or `BLIZBOOKS`.
- FR-2: A `BLIZBOOKS`-sourced organization shall store an `external_id` mapping back to its BlizBooks tenant.
- FR-3: The system shall support branches nested under an organization, each independently sourced (`NATIVE` or `BLIZBOOKS`) with an optional `external_id`.
- FR-4: Organization- and branch-level settings (working hours, leave policies, payroll cycle, etc.) shall be configurable regardless of source, unless a specific setting is explicitly designated as BlizBooks-owned.
- FR-5: A `BLIZBOOKS`-sourced organization must be able to operate fully within Smarteam (attendance, leave, timesheets, payroll) without any additional BlizBooks-side involvement beyond what the federation contract already provides.

### 4.2 Users and Identity

- FR-6: The system shall support two identity types on a single `users` model: `NATIVE` (password-based, self-registered or admin-invited) and `FEDERATED` (provisioned via BlizBooks, no local password).
- FR-7: A `FEDERATED` user must be able to authenticate into Smarteam directly (e.g., via SSO/token exchange with BlizBooks or a native login flow) if the organization enables it — this must not require a password to exist locally.
- FR-8: The system shall not represent a federation client (e.g., BlizBooks itself) as a user under any circumstance. Application authentication and human authentication are separate models (see §5).
- FR-9: Deactivating a user natively (native org) or deprovisioning an employee via federation (federated org) must immediately revoke all active sessions/tokens for that identity.

### 4.3 Roles and Permissions (RBAC)

- FR-10: The system shall support a Platform Super Admin role, scoped above all organizations.
- FR-11: The system shall support configurable organization-level roles: Organization Admin, HR Admin, Manager, Employee, at minimum, with the ability to define custom roles per organization.
- FR-12: Permissions shall be enforced at the domain-service layer, not solely at the controller layer, so that both Application API and Federation API requests are subject to equivalent enforcement.
- FR-13: A federated employee's in-app permissions shall be governed by native Smarteam RBAC (role assigned within Smarteam), not inferred from BlizBooks federation scopes. Federation grants govern what BlizBooks (the application) may do; RBAC governs what the human may do inside Smarteam.
- FR-14: The system shall explicitly resolve and enforce whether BlizBooks-issued access grants for an employee are reflected in that employee's native RBAC role, with no ambiguity between the two systems (this was an open gap in the current system and must be closed in V2).

### 4.4 Employees

- FR-15: The system shall support creating an employee natively (one-time creation, fails if a duplicate exists per organization) and provisioning an employee via federation (idempotent upsert keyed on `external_id`).
- FR-16: Each employee record shall track `identity_source` (`NATIVE` or `BLIZBOOKS`) and, for federated employees, an `external_id`.
- FR-17: Each employee record shall track field-level ownership (`owned_fields`) for attributes BlizBooks is authoritative over (at minimum: name, status/active-inactive, branch assignment). These fields shall be read-only through the Application API for federated employees and clearly indicated as externally managed.
- FR-18: All employee fields not designated as BlizBooks-owned (e.g., internal notes, emergency contacts added within Smarteam, Smarteam-specific settings) shall be editable natively regardless of the employee's identity source.
- FR-19: The system shall support employee lifecycle states: active, inactive, terminated — consistently across both access modes.
- FR-20: The system shall support assigning an employee to one or more branches and updating that assignment through both access modes, subject to §4.3 authorization rules.

### 4.5 Attendance

- FR-21: The system shall support clock-in/clock-out (or equivalent check-in/check-out) for any employee, native or federated, through the Application API.
- FR-22: The system shall support attendance record creation/update via the Federation API for organizations where BlizBooks is the attendance system of record, using the same underlying attendance domain logic as native check-in/out.
- FR-23: The system shall support attendance correction/approval workflows (e.g., manager adjusts a missed punch) with a full audit trail of who made the change and when.
- FR-24: The system shall expose attendance summaries/reports per employee, branch, and organization, filterable by date range.

### 4.6 Leave

- FR-25: The system shall support leave types configurable per organization (e.g., annual, sick, unpaid), including accrual rules.
- FR-26: The system shall support leave application, approval, rejection, and cancellation workflows, with configurable approval chains (e.g., manager → HR).
- FR-27: The system shall maintain a leave balance per employee per leave type, updated atomically on application, approval, and cancellation.
- FR-28: The system shall support balance adjustments (manual correction) with a mandatory reason and audit trail.
- FR-29: Leave operations shall be available identically through the Application API (native UI) and shall be triggerable via the Federation API where BlizBooks needs to reflect leave status.

### 4.7 Timesheets

- FR-30: The system shall support timesheet generation derived from attendance records, per employee, per configurable period (weekly/biweekly/monthly).
- FR-31: The system shall support manual timesheet entry/adjustment where attendance-derived data is insufficient, with an audit trail.
- FR-32: The system shall support a timesheet approval workflow (employee submit → manager approve) prior to payroll processing.
- FR-33: Approved timesheets shall be the sole input to payroll calculation for hourly/shift-based compensation.

### 4.8 Payroll

- FR-34: The system shall support payroll runs per organization per configurable cycle, calculating compensation from approved timesheets, leave (paid/unpaid), and configured salary/wage structures.
- FR-35: The system shall support payroll adjustments (bonuses, deductions, reimbursements) prior to finalizing a run, with an audit trail.
- FR-36: The system shall generate payslips accessible to each employee (native or federated) through the Application API.
- FR-37: The system shall expose payroll status and summary data via the Federation API for organizations where BlizBooks requires payroll visibility, without exposing internal payroll calculation internals.
- FR-38: Payroll data shall never be mutable retroactively without an explicit correction workflow that preserves the original record and the correction as separate, auditable entries.

### 4.9 Shifts

- FR-39: The system shall support shift definitions (start/end time, break rules) per organization/branch.
- FR-40: The system shall support shift assignment to employees, and shift-based attendance validation (e.g., flag early/late clock-in relative to assigned shift).

### 4.10 Integration Platform (Federation)

- FR-41: The system shall implement OAuth 2.0 client credentials for application authentication, matching the existing BlizBooks mechanism.
- FR-42: The system shall support optional mutual TLS (mTLS) as an additional transport-level authentication option, matching current capability.
- FR-43: The system shall verify signed federation requests, binding the signature to HTTP method, path, body hash, actor, tenant, outlet/branch, target, and nonce — matching current behavior.
- FR-44: The system shall reject replayed federation requests using nonce tracking with a defined validity window.
- FR-45: The system shall support tenant and branch provisioning via federation, mapping BlizBooks entities to Smarteam organizations/branches.
- FR-46: The system shall support federation grants that define what a federation client is authorized to do, scoped by tenant/branch, independent of and in addition to OAuth scopes.
- FR-47: The system shall emit signed, replayable webhooks for domain events (employee changes, attendance events, leave status changes, payroll events) to registered federation clients.
- FR-48: The system shall support idempotency keys on all mutating federation endpoints to safely handle retries.
- FR-49: The system shall support correlation IDs propagated through federation requests, internal processing, and resulting webhooks, for end-to-end traceability.
- FR-50: The system shall support capability discovery, allowing a federation client to query which federation endpoints/features are enabled for its tenant.
- FR-51: The system shall support onboarding a new federation client (issuing client_id/client_secret, defining scopes and grants) through a platform-admin-facing management capability, independent of BlizBooks-specific code.
- FR-52: The system shall support revoking a federation client's credentials and access immediately, with all subsequent requests from that client rejected.

### 4.11 Audit and Traceability

- FR-53: The system shall maintain an audit log for all mutating operations across every domain, recording actor (user or federation client), timestamp, action, before/after state where applicable, and access mode (native/federation).
- FR-54: The system shall retain audit logs independently of the retention policy for operational data, per applicable compliance requirements.

---

## 5. Non-Functional Requirements

### 5.1 Architecture

- NFR-1: Business logic shall exist exactly once per domain, implemented in domain services independent of access mode. Application API and Federation API shall be thin adapters translating external contracts into domain-service calls.
- NFR-2: Domain services shall not contain conditional logic branching on identity source, organization source, or access mode. Such logic is confined to the integration/federation adapter layer.
- NFR-3: No API (native or federation) shall expose internal database models directly. All APIs shall be backed by explicitly versioned, stable DTOs/contracts.
- NFR-4: The system shall not require a separate microservice for federation at current scale; federation shall be a module within the Smarteam backend, with clear internal boundaries that allow future extraction if justified.

### 5.2 Security

- NFR-5: Application authentication (which system is calling), federation authorization (what the application may do), and human authorization (what the user may do) shall be implemented as three distinct, non-overlapping mechanisms.
- NFR-6: All federation request signature verification, replay protection, and credential handling shall be implemented as independently tested modules, decoupled from any specific federation controller.
- NFR-7: Client secrets and equivalent credentials shall be stored hashed, never in plaintext, and never returned by any API after initial issuance.
- NFR-8: All inbound federation requests shall be validated against tenant/branch scope before reaching any domain service — a federation client shall never be able to act outside its granted tenant/branch, even if it supplies a valid signature for a different target.
- NFR-9: All data in transit shall be encrypted (TLS); federation traffic must support mTLS where configured.

### 5.3 Data Integrity and Compatibility

- NFR-10: All identifiers used in the existing BlizBooks federation contract (`external_id` equivalents for tenant, branch, employee) shall be preserved exactly through any internal migration — BlizBooks must never observe an identity change for an entity it already knows.
- NFR-11: Field-level ownership (`owned_fields`) shall be enforced consistently: a field owned by BlizBooks shall never be silently overwritten by a native edit, and shall never silently overwrite a native-only field on sync.
- NFR-12: All mutating federation endpoints shall be idempotent with respect to their idempotency key, producing the same result on retry without duplicate side effects (e.g., no duplicate attendance records, no duplicate payroll line items).

### 5.4 Reliability

- NFR-13: Webhook delivery shall use a transactional outbox pattern, ensuring an emitted domain event is never lost due to a crash between state change and webhook dispatch.
- NFR-14: Failed webhook deliveries shall be retried with backoff and shall be replayable on demand by an authorized operator.
- NFR-15: The system shall degrade gracefully if BlizBooks or another federation client is unreachable — native operations for native organizations shall be unaffected by federation-side outages.

### 5.5 Compatibility

- NFR-16: The Federation API shall remain backward-compatible with the existing BlizBooks integration guide's documented contract; any endpoint path changes shall be additive/versioned, not breaking.
- NFR-17: The system shall support the existing federation authentication and request-signing mechanism without requiring BlizBooks to adopt a new signing scheme, credential format, or transport mechanism.

### 5.6 Auditability and Observability

- NFR-18: Every request through the Federation API shall be traceable end-to-end via correlation ID across logs, domain service calls, and any resulting webhook.
- NFR-19: The system shall expose sufficient operational metrics (request rates, error rates, webhook delivery success/failure, replay attempts) to detect federation-layer issues independently of native-layer issues.

### 5.7 Extensibility

- NFR-20: Onboarding a new federation client (a future third-party integration) shall not require code changes to existing domain services or to the BlizBooks-specific adapter code.
- NFR-21: Adding a new `identity_source` or `OrganizationSource` value shall be possible without restructuring the core schema (i.e., the source field is an enum extension point, not a structural fork).

### 5.8 Repository and Build Topology

- NFR-22: The backend (single API service) and the two frontend applications (§11) shall be developed in a single monorepo, managed with Turborepo, to allow shared TypeScript types/DTOs (API contracts, RBAC types, federation payload shapes) to be consumed by both frontend applications without duplication or drift.
- NFR-23: Turborepo's task pipeline (build/lint/test) shall be configured so that CI only rebuilds and retests the packages/apps actually affected by a given change, keeping pipeline time proportional to the change size rather than the whole monorepo.

---

## 6. Data Model Requirements

The following entities are required at minimum. Detailed schema/relationships are defined in the accompanying V2 domain/database design, but the PRD-level requirements are:

- `organizations` — must carry `source`, nullable `external_id`.
- `branches` — must carry `source`, nullable `external_id`, `organization_id`.
- `users` — must carry `identity_type` (`NATIVE`/`FEDERATED`), nullable `password_hash`, nullable `external_identity_id`.
- `employees` — must carry `identity_source`, nullable `external_id`, `owned_fields` (field-level provenance), `organization_id`, `branch_id`.
- `roles`, `permissions` — must support both system-defined and organization-custom roles.
- `federation_clients` — `client_id`, hashed `client_secret`, `organization_id`, `scopes`, `status`, expiry.
- `federation_grants` — explicit record of what a federation client may do, scoped by tenant/branch, separate from OAuth scopes.
- `webhook_events` / `event_outbox` — must support at-least-once delivery with idempotent consumption on the receiving side.
- `attendance`, `leave`, `timesheets`, `payroll`, `shifts` — each must carry enough provenance to know whether a given record originated natively or via federation, without requiring that fact to affect business logic.
- `audit_log` — actor, action, before/after, timestamp, access mode, correlation ID.

---

## 7. API Requirements (Contract-Level)

### 7.0 Repository Layout (context for §7.1/§7.2)

The backend API service and both frontend applications (§10a.1) shall live in a single Turborepo-managed monorepo, e.g.:

```
apps/
├── api/            (NestJS backend — Application API + Federation API + Platform API)
├── web-org/        (Next.js — organization-facing application)
└── web-admin/      (Next.js — Platform Super Admin application)
packages/
├── types/          (shared DTOs/contract types, consumed by both frontend apps and the backend)
├── ui/             (shared component primitives, where applicable across web-org/web-admin)
└── config/         (shared eslint/tsconfig/tailwind config)
```

This is a repository-structure requirement, not merely a suggestion — it is what makes NFR-22 (shared types, no drift between frontend apps and backend contracts) achievable in practice.

### 7.1 Application API

- Shall expose CRUD and workflow operations for every domain in §4 to authenticated human users, enforced by RBAC.
- Shall never expose federation-specific concerns (client management, signed request verification, replay handling) — those are platform-admin-only, separate surface.
- Shall return stable, versioned response contracts, decoupled from internal schema.

### 7.2 Federation API

- Shall preserve the existing endpoint families: `/v1/oauth/token`, `/v1/federation/tenants/*`, `/v1/federation/employees/*`, `/v1/federation/attendance/*`, `/v1/federation/leave/*`, `/v1/federation/payroll/*`, `/v1/federation/events`.
- Shall accept and validate: OAuth client credentials, optional mTLS, signed request assertions (method, path, body hash, actor, tenant, outlet, target, nonce), idempotency keys, correlation IDs.
- Shall be additive-only relative to the current contract — no removal or breaking modification of existing fields/behavior without an explicit, separately reviewed deprecation process.
- Shall support capability discovery so BlizBooks (or any client) can determine what is currently enabled for its tenant.

---

## 8. Explicit Edge Cases and Gap Closures

These are requirements specifically included to close gaps identified during architecture review — they must not be treated as optional:

- EC-1: A federated employee's Smarteam RBAC role must be explicitly derived from BlizBooks-issued access grants at provisioning time, with a defined, deterministic mapping — not left ambiguous (closes the previously identified open issue around federation-managed permissions).
- EC-2: A retry of a federation provisioning request (`sync`) with identical payload must produce zero additional side effects (no duplicate employees, no duplicate attendance rows).
- EC-3: A native edit to a BlizBooks-owned field must be rejected at the API layer with a clear error, not silently ignored or silently accepted and then overwritten later.
- EC-4: A federation client whose credentials are revoked mid-session must have all subsequent requests rejected within the same request cycle — no stale token acceptance window beyond the defined access-token TTL.
- EC-5: An organization must be able to change source from `NATIVE` to `BLIZBOOKS` (or the reverse) only through an explicit, audited migration operation — never as a side effect of a routine update.
- EC-6: Payroll calculations must be reproducible: given the same timesheet, leave, and adjustment inputs, a payroll run must produce identical output if recalculated, for audit purposes.
- EC-7: Webhook delivery failures must not block the originating domain operation — the domain state change is authoritative and committed independently of webhook delivery success (outbox pattern, per NFR-13).
- EC-8: Deactivating an organization (native or federated) must cascade predictably to its users, employees, and active sessions, with the exact cascade behavior explicitly defined per entity (not left to default database behavior).

---

## 9. BlizBooks-Facing Requirements (What Must Not Change)

To satisfy the "no major BlizBooks changes" constraint, the following must be explicitly preserved and verified against real BlizBooks traffic before launch:

- OAuth client credentials flow and token format.
- Optional mTLS as currently supported.
- Signed federation request structure and signature verification behavior.
- Webhook payload structure, signing, and replay semantics.
- Idempotency key handling.
- Correlation ID propagation.
- All currently documented federation endpoint paths and their request/response shapes (additive changes only).

---

## 10a. Application Topology and Multi-Tenancy

### 10a.1 Applications

The system shall consist of **one backend service** and **two separate frontend applications**. Splitting the frontend, while keeping a single backend, is a requirement — not an implementation detail left to engineering discretion — for the reasons below.

| Application | Audience | Purpose |
|---|---|---|
| **Organization Application** (e.g. `app.smarteam.com`) | Organization Admin, HR Admin, Manager, Employee (native and federated) | The day-to-day product: employees, attendance, leave, timesheets, payroll, org settings. Always scoped to exactly one organization per session. |
| **Platform Super Admin Application** (e.g. `admin.smarteam.com`) | Platform Super Admin only (internal Smarteam staff) | Cross-organization operations: creating/managing organizations, managing federation clients and grants, platform-wide audit log and health monitoring. Not tied to a single organization. |
| **Backend API service** | Consumed by both frontend applications, and by federation clients (BlizBooks, future integrations) | Single NestJS service. No duplicated domain logic between what serves the organization app and what serves the platform admin app (see NFR-1/NFR-2). |

**FR-55**: The system shall provide a distinct Platform Super Admin application, separate from the organization-facing application, so that platform-level operations (cross-organization visibility, federation client issuance/revocation, system-wide audit access) are not reachable from within the organization-facing application under any role or permission configuration.

**FR-56**: The organization-facing application shall never expose a code path, hidden route, or permission escalation that grants cross-organization visibility, regardless of role. Cross-organization access exists only in the Platform Super Admin application.

**Rationale:** Separating the two applications (rather than gating an admin section behind a permission flag inside one app) limits blast radius — a routing or authorization defect in the organization app cannot expose platform-level capabilities or cross-tenant data. It also lets the platform admin surface evolve independently of customer-facing release cycles and avoids shipping platform-admin-only code to every customer session.

### 10a.2 Authorization Tiers (updated)

Building on §5.2 (NFR-5), the system shall enforce three distinct authorization tiers, now including a platform tier:

| Tier | Question it answers | Scope |
|---|---|---|
| Application authentication | Which system is calling? | Native app session or federation client (OAuth client credentials) |
| Human authorization (Organization RBAC) | What can this user do inside their organization? | Scoped to exactly one `organization_id` |
| Platform authorization (Super Admin) | What can this platform operator do across Smarteam? | Not scoped to any single organization; explicitly cross-tenant |

**FR-57**: Platform Super Admin shall be modeled as a distinct role space, entirely separate from Organization RBAC roles (§4.3) — a Platform Super Admin identity shall not also hold an Organization Admin/HR/Manager/Employee role within the same identity record.

### 10a.3 Multi-Tenancy Model

**FR-58**: The system shall implement multi-tenancy as a **shared database with row-level tenant isolation**, using `organization_id` as the tenant key on every tenant-scoped table (employees, attendance, leave, timesheets, payroll, shifts, roles where custom, etc.) — not database-per-tenant or schema-per-tenant.

**FR-59**: Every domain-service method that reads or writes tenant-scoped data shall require an `organization_id` (or an equivalent tenant-bound context) as an explicit input. No domain-service method shall support an unscoped, cross-organization query except methods explicitly reserved for the Platform Super Admin authorization tier.

**NFR-24**: The database shall enforce tenant isolation as defense-in-depth in addition to application-layer scoping, via PostgreSQL Row-Level Security (RLS) policies keyed on `organization_id`, set per request/session. Cross-tenant data access shall be rejected by the database itself even in the event of an application-layer scoping defect.

**NFR-25**: Only the Platform Super Admin authorization tier shall be permitted to bypass row-level tenant isolation, and only through an explicitly audited code path (logged with actor, target organization, and reason where applicable).

---

## 10. Success Criteria

- Every functional requirement in §4 is implemented once, in a domain service, consumed identically by both Application and Federation APIs.
- BlizBooks integration passes a contract test suite built from real production traffic samples, with zero required changes on the BlizBooks side beyond what is explicitly documented in §9.
- A native organization can be created, staffed, and fully operated (attendance through payroll) with zero interaction with any federation code path.
- No domain service contains a conditional branch on `source`, `identity_source`, or access mode.
- Every gap identified in §8 has a corresponding automated test.