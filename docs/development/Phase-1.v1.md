# Smarteam V2 — Phase 1 Plan (Backend Foundation)

**Status:** Draft for engineering review
**Related documents:** Smarteam V2 Rewrite Plan, Smarteam V2 PRD, Smarteam V2 Tech Stack

---

## 1. Purpose of Phase 1

Phase 1 delivers the **complete backend** for Smarteam V2 — data model, domain logic, native authentication/authorization, and the full BlizBooks federation integration — with no user-facing interface. At the end of Phase 1, the system must be capable of everything the PRD requires functionally and operationally, reachable only via API. The Organization Application and the Platform Super Admin Application (per PRD §10a) are explicitly deferred to a later phase and are out of scope here. The repository may contain minimal non-functional frontend shells for workspace/build validation, but no product UI is part of Phase 1.

The purpose of building backend-first is to prove the hardest, highest-risk parts of this rewrite — data modeling, multi-tenancy, federation compatibility with BlizBooks, and clean separation of business logic from access mode — before any interface work begins. An interface built against an unstable or incomplete backend creates rework; a backend validated directly against BlizBooks does not.

---

## 2. Phase 1 Scope

### 2.1 In Scope

- Full domain and database schema design and implementation, covering every domain defined in the PRD (organizations/branches, users, employees, roles/permissions, attendance, leave, timesheets, shifts, payroll, and the integration platform's own data — clients, grants, webhook/event records, audit).
- All required relationships, constraints, and multi-tenant isolation mechanisms between these entities.
- All domain services implementing the business logic for every domain, as the single source of truth for that logic (no duplication between access modes).
- Native authentication and authorization infrastructure (application-layer, ready for a future frontend to consume — session/token issuance, RBAC enforcement, permission model) even though no native UI exists yet in this phase.
- Full BlizBooks Federation integration layer: application authentication (OAuth client credentials), federation-specific authorization (scopes, tenant/branch grants), signed-request verification, replay protection, idempotency handling, webhook emission and replay, and correlation-ID propagation — built to the existing BlizBooks contract with no major changes required on the BlizBooks side.
- Platform-level backend capabilities needed to operate the system (federation client issuance/revocation, cross-tenant administrative operations), exposed as APIs only — no Platform Super Admin interface yet.
- Multi-tenancy enforcement at both the application layer and the database layer, per the approved shared-database/row-level-isolation model.
- Audit logging infrastructure covering every mutating operation across every domain and every access mode.
- Contract validation against real BlizBooks traffic, and automated test coverage (unit, integration, contract, and idempotency/replay tests) for everything built in this phase.
- Monorepo and backend project setup (Turborepo structure, backend app scaffolding, CI pipeline for the backend, environment/secrets configuration) needed to support this and future phases.

### 2.2 Explicitly Out of Scope for Phase 1

- Organization-facing frontend product application. A minimal placeholder shell may exist in the monorepo, but it is not a Phase 1 deliverable.
- Platform Super Admin frontend product application. A minimal placeholder shell may exist in the monorepo, but it is not a Phase 1 deliverable.
- Any UI/UX or product-interface work of any kind.
- Any interface for federation client management (the capability exists as an API in this phase; a UI for it comes later).
- Onboarding of any federation client other than BlizBooks (the mechanism must support it per the PRD, but no second integration is built or tested in this phase).

---

## 3. What Gets Built in Phase 1 (by category)

This section deliberately stays at the category level — the specific tables, entities, and endpoint paths are defined in the accompanying V2 domain/database design and API specification documents, not repeated here.

### 3.1 Data Foundation

- Design and implement the complete relational schema needed to represent every domain in the PRD, including the multi-tenancy key present on every tenant-scoped record, and the field-level provenance mechanism needed to track which fields are owned by BlizBooks versus owned natively.
- Implement all relationships and referential integrity between organizations, branches, users, employees, roles/permissions, and every operational domain (attendance, leave, timesheets, shifts, payroll).
- Implement the data structures required specifically for the integration platform: federation client records, federation grants, webhook/event delivery records (including the transactional outbox), and the audit log.
- Establish migration tooling and a reviewed, version-controlled migration process from day one, since this schema will need to evolve safely across the rest of the project and eventually support data migration from the existing system.

### 3.2 Domain Services (Business Logic)

- Implement one domain service per business domain, containing all business rules for that domain, independent of whether a request originates natively or via federation.
- Ensure every domain service exposes the distinct operations required by the PRD (e.g., a one-time creation path versus an idempotent synchronization path), rather than forcing all callers through a single ambiguous operation.
- Ensure no domain service contains conditional logic based on identity source, organization source, or access mode — that distinction is confined entirely to the adapter/integration layer, per the architecture principles already agreed.
- Cover every domain defined in the PRD: organizations/branches, employees, attendance, leave, timesheets, shifts, payroll, and the roles/permissions model that governs human authorization.

### 3.3 Native Authentication & Authorization Infrastructure

- Build the native authentication mechanism (credential handling, session/token issuance, revocation) even though no native login screen exists yet — this is backend infrastructure a future frontend will consume.
- Build the RBAC model and enforcement mechanism: role definitions, permission definitions, and enforcement at the domain-service layer (not only at the API layer), including support for organization-level custom roles.
- Build the mechanism that resolves how BlizBooks-issued access grants for a federated employee translate into that employee's native permissions inside Smarteam, closing the ambiguity identified during architecture review.

### 3.4 Federation Integration Layer (BlizBooks)

- Implement application-level authentication matching the existing BlizBooks mechanism (OAuth client credentials), including optional mutual TLS support.
- Implement federation-specific authorization: scopes, tenant/branch-level grants, and enforcement that a federation client can never act outside what it has been explicitly granted.
- Implement signed-request verification matching the existing BlizBooks signing scheme, including replay protection with an appropriately bounded validity window.
- Implement idempotency handling for all mutating federation operations, and correlation-ID propagation across the full request/response/webhook lifecycle.
- Implement outbound webhook emission (signed, using a transactional outbox for reliability) and support for replaying previously delivered events.
- Implement capability discovery so a federation client can determine what is currently enabled for its tenant.
- Implement all federation-facing operations required by the PRD across every domain: tenant/branch provisioning, employee provisioning/synchronization, attendance, leave, and payroll visibility — built strictly to preserve the existing BlizBooks contract, with any endpoint-level adjustments kept additive and non-breaking.

### 3.5 Platform-Level Backend Capabilities

- Implement the backend operations needed to issue, view, and revoke federation client credentials and grants, as APIs only.
- Implement the backend operations needed for cross-tenant administrative visibility (the data and logic a future Platform Super Admin interface will need), respecting the platform authorization tier defined in the PRD.
- These capabilities must be built now, even without an interface, because the federation client lifecycle (issuing BlizBooks its credentials, and being able to revoke/rotate them) is required for Phase 1 to be testable and usable at all.

### 3.6 Multi-Tenancy Enforcement

- Implement tenant scoping as a required input to every domain-service operation that touches tenant-scoped data, with no code path permitting an unscoped cross-tenant query outside the platform authorization tier.
- Implement database-level tenant isolation as defense-in-depth, in addition to application-layer scoping, so that a future application-layer defect cannot result in cross-tenant data exposure.

### 3.7 Audit and Observability

- Implement audit logging for every mutating operation across every domain, recording actor, action, before/after state where applicable, and access mode, consistently whether the request came natively or via federation.
- Implement the logging, tracing, and metrics foundations needed to observe backend behavior in the absence of any UI — this is how the team will validate Phase 1 is working correctly before any interface exists to visualize it.

### 3.8 Testing and Contract Validation

- Build automated unit and integration test coverage for every domain service and every API surface delivered in this phase.
- Build a contract test suite derived from real, captured BlizBooks production traffic, and require every federation-facing capability to pass it before being considered complete.
- Build explicit tests for the edge cases already identified as required (idempotent retries producing no duplicate side effects, rejected writes to externally-owned fields, immediate effect of credential revocation, reproducibility of calculated results, and cascade behavior on deactivation).

### 3.9 Project and Repository Foundation

- Set up the Turborepo monorepo structure with the backend application and minimal frontend placeholder shells in place. The shells exist only to validate the agreed two-application topology and shared package boundaries; they contain no Phase 1 product functionality.
- Set up the CI pipeline (GitLab CI/Runner) for the backend: linting, type-checking, the full automated test suite including contract tests, and build validation on every change.
- Set up environment and secrets configuration for local, staging, and production, consistent with the approved tech stack.

---

## 4. Phase 1 Exit Criteria

Phase 1 is complete when all of the following are true:

- Every domain in the PRD has a working domain service, backed by a complete and reviewed schema, with no interface required to exercise it — all operations are reachable and verifiable via API.
- BlizBooks's existing integration can authenticate, provision tenants/branches/employees, and exercise attendance, leave, and payroll-related federation operations against the new backend, in a staging environment, with no major changes on the BlizBooks side.
- The federation contract test suite (built from real BlizBooks traffic) passes in full.
- No domain service contains logic that branches on identity source, organization source, or access mode.
- Multi-tenancy isolation is enforced and verified at both the application layer and the database layer.
- Federation client credentials can be issued, used, and revoked entirely through the backend API, with revocation taking effect immediately.
- Audit logging is in place and verified for every mutating operation across every domain.
- All Phase 1 code is covered by automated tests (unit, integration, contract) running in CI on every change.

At this point, the backend is a complete, independently verifiable product surface — ready for the Organization Application and Platform Super Admin Application to be built against it as consumers, with no expected backend rework driven by interface development.

---

## 5. What Phase 1 Deliberately Does Not Include

To avoid scope creep back into interface work during Phase 1:

- No product screens, design-system implementation, or frontend routing — the repository's minimal welcome shells are scaffolding only and must not grow into product UI during Phase 1.
- No onboarding flow, signup flow, or any concept of a "first-run experience" — those are interface concerns.
- No second federation client integration beyond BlizBooks — the mechanism is built to support it, but proving it with a second real client is future scope.
- No performance/load tuning beyond what's needed to pass the contract and reliability requirements — broader scale testing is a later concern once real usage patterns exist.
