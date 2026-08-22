# Smarteam Employee Management and BlizBooks Federation Completion Plan

**Status:** Implementation completed; verification and deployment gates remain
**Scope:** Smarteam backend, BlizBooks federation/BFF, and existing BlizBooks workforce UI
**Systems:** Smarteam V2 and BlizBooks
**Primary outcome:** Smarteam is the system of record for the complete employee/workforce domain. BlizBooks is the authenticated interface and federation client that fetches Smarteam data, sends approved commands through the federation API, and may retain read-only projections and accounting-specific records.

---

## 1. Objective

Complete the Smarteam-to-BlizBooks integration so that no employee-management business rule or employee/workforce data is authoritatively maintained in BlizBooks.

The completed system must support, through Smarteam APIs:

- Employee creation, listing, detail, editing, lifecycle, branch assignment, access, and deactivation.
- Employee profile records, employment history, manager assignment, emergency contacts, compensation, and salary components.
- Attendance check-in, check-out, history, manual corrections, correction approval, policies, shifts, and WebAuthn verification.
- Leave types, balances, application, approval, rejection, cancellation, balance adjustments, and history.
- Timesheets and approvals when they are inputs to payroll.
- Payroll setup, salary breakdown, components, adjustments, calculation, approval, release, locking, payslips, statements, and ledger data.
- Statutory employee/payroll compliance as a versioned Smarteam domain.
- Organization and branch isolation for every operation.
- Signed events, replay, idempotency, auditability, and safe recovery across the federation boundary.

BlizBooks must not calculate, persist, or independently mutate these workforce records for a Smarteam-managed organization.

## 1.1 Implementation status

The implementation now includes the core ownership cutover and the missing federation surfaces:

- Smarteam federated employee list/detail/upsert/patch/deactivate, branch assignment, employment records, compensation, emergency contacts, and manager operations.
- Smarteam federated shifts, timesheets, payroll payslips, employee pay-component assignments, payroll ledger filtering, and a jurisdiction-neutral statutory compliance profile/record domain.
- Expanded scopes, capabilities, migrations, audit/outbox coverage, effective-dated compensation/employment updates, and organization/branch scoping.
- BlizBooks provider-backed workforce employee CRUD/status/import, provider records, branch/manager commands, payroll breakdown/payslip/component access, shifts/timesheets, attendance correction decisions, and compliance BFF routes.
- BlizBooks HR UI support for provider-backed employee details, employment history, compensation, emergency contacts, timesheets, and statutory compliance, using the existing visual system.
- BlizBooks access synchronization now repairs only missing SmartTeams employee identities; it does not overwrite an existing SmartTeams-owned employee.

The compliance model intentionally stores configurable scheme profiles and period records without hard-coding jurisdiction-specific legal formulas. Those formulas require the organization's jurisdiction, registration configuration, and current official rules before calculation logic can be safely enabled.

The workstream and gate sections below are retained as the implementation checklist and acceptance record. Their “must” language describes the required design contract, not an indication that the corresponding code was skipped. The remaining gates are operational: apply and verify migrations, configure federation grants/capabilities, rehearse/backfill existing tenants, and complete jurisdiction-specific legal configuration before enabling statutory calculations.

Explicitly outside this implementation are binary employee-document storage, performance-management workflows, onboarding workflows, bank disbursement/payment reconciliation, and jurisdiction-specific filing submission. No existing Smarteam federation contract for those domains was available, so they are not represented as hidden local BlizBooks fallbacks or falsely marked complete.

---

## 2. Implemented architecture and ownership decision

The implemented architecture is provider-first for Smarteam-managed organizations:

1. Smarteam owns the canonical employee identity, lifecycle, workforce records, and workforce workflows.
2. BlizBooks authenticates the application user, resolves the mapped organization/outlet, and calls Smarteam through its federation adapter and BFF.
3. BlizBooks may retain access/session records, accounting records, mapping metadata, and read-only workforce projections, but those records cannot authorize conflicting workforce mutations.
4. Workforce writes, reads, approvals, payroll actions, and compliance changes are sent to Smarteam with the mapped organization and provider outlet identifiers.
5. Native BlizBooks HR fallback behavior is not used for Smarteam-managed workforce workspaces; unavailable provider capabilities fail closed.

### 2.1 Target ownership rules

| Domain | Canonical owner after completion | BlizBooks responsibility |
|---|---|---|
| Organization/branch mapping | Shared contract; Smarteam stores the mapped organization/branch | Maintain the BlizBooks-to-Smarteam external mapping and select the authenticated tenant |
| Employee identity and lifecycle | Smarteam | Render and proxy commands through federation |
| Employee profile and employment records | Smarteam | Render and proxy commands through federation |
| Employee access inside Smarteam | Smarteam RBAC, with explicit federated grant mapping | Request access changes through federation; retain BlizBooks application authorization separately if required |
| Attendance | Smarteam | Capture UI actions through the BFF and display Smarteam results |
| Leave | Smarteam | Capture UI actions through the BFF and display Smarteam results |
| Timesheets and shifts | Smarteam | Capture/display through federation |
| Payroll and salary | Smarteam | Display Smarteam results and consume ledger data for accounting integration |
| Statutory compliance | Smarteam | Display reports/status and export where the contract permits |
| Audit and event history | Smarteam is authoritative | Store delivery/reconciliation metadata and read projections only |
| BlizBooks UI cache | Not authoritative | Read-only cache with freshness, source, and cursor metadata |

BlizBooks may continue to own its own application users, sessions, hotel permissions, accounting records, and organization mapping. It must not use those records as a second employee/workforce source of truth.

---

## 3. Current-state inventory

### 3.1 Already implemented and reusable

These capabilities are present and should be preserved, hardened, and covered by end-to-end contract tests:

- OAuth client-credentials authentication and optional mTLS transport.
- Federation tenant and branch provisioning.
- Federation grants, scopes, tenant boundaries, and branch boundaries.
- Webhook registration, signature verification, durable inbound event storage, replay, and reconciliation.
- Correlation IDs, idempotency handling, audit infrastructure, and outbox/event patterns.
- Smarteam native employee domain, employee compensation models, employee employment records, emergency contacts, and manager assignment.
- Smarteam attendance storage, punches, policies, preferences, corrections, and WebAuthn.
- Smarteam leave types, balances, requests, decisions, cancellation, and adjustments.
- Smarteam payroll components, calendars, payroll runs, calculation, adjustments, lifecycle actions, detailed line items, payslips, and ledger data.
- BlizBooks provider adapter and BFF routes for most attendance, leave, and payroll workflows.
- Organization/branch scoping in both applications.
- Existing employee shadow synchronization and access/session-revocation synchronization.

Existing implementation references:

- BlizBooks employee CRUD: `Blizbooks/apps/api/src/modules/employees/employees.controller.ts` and `employees.service.ts`.
- BlizBooks workforce BFF: `Blizbooks/apps/api/src/integrations/workforce-provider.controller.ts` and `workforce-provider.service.ts`.
- BlizBooks federation adapter: `Blizbooks/apps/api/src/integrations/providers/smartteams-federation.adapter.ts`.
- Smarteam native employees: `smarteam/apps/api/src/modules/employees/employees.controller.ts` and `employees.service.ts`.
- Smarteam federation employees: `smarteam/apps/api/src/modules/federation/federation-employees.controller.ts`.
- Smarteam federation attendance: `smarteam/apps/api/src/modules/federation/federation-attendance.controller.ts`.
- Smarteam federation leave: `smarteam/apps/api/src/modules/federation/federation-leave.controller.ts`.
- Smarteam federation payroll: `smarteam/apps/api/src/modules/federation/federation-payroll.controller.ts`.

### 3.2 Previously partial gaps now closed

The implementation closed the identified code-level gaps across both repositories:

- Federated employee list/detail, lifecycle, branch assignment, records, manager, compensation, and access paths.
- Branch-aware attendance, corrections, leave, shifts, timesheets, payroll, payslips, ledger, and statutory compliance paths.
- BlizBooks adapter/BFF commands and provider-backed HR UI for employee management, attendance, leave, timesheets, payroll, salary breakdown, payslips, and compliance.
- Provider-first ownership guards, organization/outlet mapping, external-ID propagation, audit/projection behavior, and capability/grant coverage.

### 3.3 Explicitly outside this release

These are not silently treated as complete because no corresponding Smarteam federation contract exists in this release:

- Binary employee-document storage and document workflows.
- Performance-management workflows.
- Onboarding workflows.
- Bank disbursement, payment-provider integration, and payment reconciliation.
- Jurisdiction-specific statutory formula calculation and filing submission.
- Production migration rehearsal, tenant backfill, and live cross-repository UAT; these remain deployment gates rather than missing code paths.

---

## 4. Completion workstreams

Each workstream is complete only when the Smarteam domain, federation API, BlizBooks adapter/BFF, database behavior, authorization, audit, events, and automated tests are complete together.

### Workstream A — Contract and ownership foundation

- Update `docs/integration/INTEGRATION_GUIDE.v1.md` to make Smarteam the workforce source of truth.
- Publish an additive, versioned federation contract for employee queries and commands.
- Define which fields are Smarteam-owned, BlizBooks-owned, or jointly mapped.
- Preserve existing external organization, branch, and employee IDs.
- Define command response envelopes, pagination, filtering, error codes, idempotency, correlation IDs, and event payloads.
- Define compatibility behavior for existing clients during migration.
- Add capability flags so BlizBooks can detect which completed services are enabled per organization.
- Define the human identity/session boundary: BlizBooks application sessions may protect the BlizBooks interface, while Smarteam remains authoritative for workforce identity, Smarteam RBAC, federated-user state, and Smarteam session revocation. No duplicate password or employee-authentication authority may be introduced accidentally.

### Workstream B — Complete Smarteam employee management

Add and test federation operations for:

- Employee list with organization/branch filters, status filters, search, pagination, and stable ordering.
- Employee detail, including source metadata and field ownership.
- Create/upsert with external ID and idempotency.
- Full editable profile fields.
- Lifecycle transitions: active, inactive, terminated.
- Branch assignment and removal.
- Smarteam role/access assignment and revocation.
- Session revocation after deactivation or termination.
- Emergency contacts.
- Employment records and employment history.
- Manager assignment.
- Compensation history and effective-dated salary records.
- Employee pay-component assignment.
- Employee documents or document metadata if required by the employee-management scope.
- Sensitive employee profile data required for payroll, tax, statutory, or compliance workflows, with explicit classification and access rules.

Use Smarteam's existing native employee services as the business-logic source. Federation controllers must be thin adapters and must not duplicate native rules.

Physical deletion must not be the normal employee operation. Existing Smarteam schema guidance retains operational, financial, attendance, leave, payroll, audit, and federation records. The contract should therefore provide deactivation/termination and, only if legally required, a separately authorized anonymization workflow.

### Workstream C — Attendance, shifts, and timesheets

- Complete employee attendance list/history queries by organization, branch, employee, and date range.
- Complete check-in/check-out commands with idempotency and duplicate-punch protection.
- Complete manual attendance entry and correction workflows.
- Expose correction approval/rejection through BlizBooks.
- Correct and test branch/organization header mapping in the BlizBooks adapter.
- Expose shift definitions, branch assignment, employee assignment, break rules, and effective dates.
- Expose timesheet generation, manual adjustments, submission, approval, rejection, and history.
- Define the exact attendance/timesheet inputs used by payroll.
- Emit attendance, correction, shift, and timesheet events.

### Workstream D — Leave management

- Keep existing leave type, balance, request, decision, cancellation, and adjustment services.
- Add a first-class leave history endpoint or stable history projection containing requests, decisions, balance transactions, actors, reasons, and timestamps.
- Ensure leave balances update atomically and are protected by idempotency.
- Expose approval-chain state and decision history.
- Verify that employee and branch filters cannot cross organization boundaries.
- Emit leave-request, decision, cancellation, and balance events.

### Workstream E — Payroll and salary

- Expose effective-dated employee compensation through federation.
- Expose employee pay-component assignments and salary-breakdown inputs.
- Expose payroll component definitions and organization configuration.
- Expose payroll calendar configuration.
- Preserve the existing run lifecycle: draft, calculated, approved, released, locked, corrected, or voided as supported by the domain.
- Expose adjustments with reason, source, actor, tax treatment, and audit data.
- Expose employee payroll statement and payslip reads through federation.
- Expose detailed line-item/component breakdowns without exposing unsafe internal calculation implementation details.
- Preserve immutable locked runs and correction-run behavior.
- Verify payroll calculation from approved timesheets, attendance, leave, salary components, holidays, and adjustments.
- Continue allowing BlizBooks to consume finalized ledger data for accounting, without allowing BlizBooks to calculate or mutate payroll locally.
- Decide explicitly whether bank-account storage, payroll disbursement, payment-provider integration, and payment reconciliation belong in this release. If they do not, document that boundary and ensure no BlizBooks-side payment source of truth is introduced.

### Workstream F — Statutory compliance

Create a dedicated Smarteam statutory-compliance domain rather than treating statutory items as generic payroll components.

The design must cover, subject to the confirmed jurisdiction and legal scope:

- Organization statutory registrations and applicable schemes.
- Employee statutory identifiers and declaration status.
- Jurisdiction-specific eligibility and contribution rules.
- Employer and employee contribution calculations.
- Taxable/non-taxable treatment and exemptions.
- Statutory payroll-period snapshots.
- Contribution ledgers and reconciliation.
- Filing/return preparation status.
- Compliance reports and exportable evidence.
- Effective-dated rule versions.
- Corrections, reversals, approvals, audit history, and retention.
- Access controls for sensitive personal and financial data.

The initial jurisdiction, legal requirements, data retention, and whether filing submission is inside or outside Smarteam must be confirmed before implementation. The service must be configuration-driven and versioned; it must not hard-code one country's assumptions into generic payroll logic.

### Workstream G — BlizBooks BFF conversion

Convert BlizBooks from local employee ownership to Smarteam-backed access:

- Employee list/detail routes call Smarteam through the federation adapter.
- Employee create/update/status/access/branch routes call Smarteam and return Smarteam responses.
- Employee compensation, employment, manager, emergency-contact, salary, payslip, leave-history, attendance-history, shift, and timesheet routes call Smarteam.
- Remove local employee writes from the canonical provider path.
- Keep `WorkforceProjectionRecord` only as a read cache/projection with source and freshness metadata.
- Stop using local `EmployeePayrollProfile`, native leave, and native attendance records as provider truth.
- Disable native fallback writes for Smarteam-managed organizations after cutover.
- Retain native BlizBooks HR only for explicitly native/non-Smarteam organizations, if that mode is still required.
- Make every provider call derive organization and branch scope from authenticated server-side mappings, never from an untrusted client-supplied tenant ID.

### Workstream H — Data migration and cutover

Use a controlled migration rather than changing ownership in place:

1. Inventory all BlizBooks employees, branches, roles, payroll profiles, leave balances, attendance records, and related identifiers.
2. Validate organization and branch mappings in Smarteam.
3. Backfill employee records into Smarteam using stable BlizBooks external IDs.
4. Backfill compensation, pay components, manager relationships, employment records, and applicable balances.
5. Reconcile counts, field values, active status, branches, and identifiers.
6. Run dual-read comparison between BlizBooks and Smarteam without changing the UI contract.
7. Freeze direct BlizBooks employee/HR writes for the selected organization.
8. Switch BlizBooks reads to Smarteam and use projections only for latency/resilience.
9. Monitor reconciliation and failed commands.
10. Retire obsolete canonical write paths after the agreed stabilization window.

No migration step may delete source data. Operational records must remain available for audit and reconciliation.

### Workstream I — Security, isolation, and reliability

- Enforce federation grants before resolving any organization or branch data.
- Enforce organization and branch boundaries in every Smarteam service and query.
- Keep federation-client authorization separate from human RBAC.
- Enforce field ownership for federated employees.
- Hash client secrets and never return them after issuance.
- Require idempotency for every mutating federation operation.
- Protect check-in/out, leave, payroll, and compliance commands against replay and duplicate side effects.
- Preserve signed webhooks, transactional outbox, retry, replay, and dead-letter visibility.
- Revoke sessions immediately after employee deactivation/termination or access removal.
- Redact payroll, statutory, identity, and credential data from logs.
- Verify tenant isolation at the application and database/RLS layers.

### Workstream J — Documentation and operational readiness

- Update the integration guide and capability matrix.
- Document all new endpoint contracts and field ownership.
- Document migration, rollback, reconciliation, and recovery procedures.
- Document which records are projections and their freshness guarantees.
- Document statutory scope and jurisdiction assumptions.
- Add dashboards/metrics for provider latency, command failures, webhook failures, replay lag, projection lag, and reconciliation mismatches.
- Document credential rotation and federation-grant revocation.

---

## 5. Proposed federation surface

Existing routes must remain compatible. New capabilities should be additive or versioned.

### Employee and employee records

```text
GET    /v1/federation/employees
GET    /v1/federation/employees/:employeeId
PUT    /v1/federation/employees/:employeeId
POST   /v1/federation/employees/:employeeId/deactivate
POST   /v1/federation/employees/:employeeId/terminate
PUT    /v1/federation/employees/:employeeId/branches/:branchId
DELETE /v1/federation/employees/:employeeId/branches/:branchId
PUT    /v1/federation/employees/:employeeId/access
POST   /v1/federation/employees/:employeeId/sessions/revoke

GET    /v1/federation/employees/:employeeId/emergency-contacts
POST   /v1/federation/employees/:employeeId/emergency-contacts
PATCH  /v1/federation/employees/:employeeId/emergency-contacts/:contactId
DELETE /v1/federation/employees/:employeeId/emergency-contacts/:contactId
GET    /v1/federation/employees/:employeeId/employment-records
POST   /v1/federation/employees/:employeeId/employment-records
GET    /v1/federation/employees/:employeeId/compensation
PUT    /v1/federation/employees/:employeeId/compensation
GET    /v1/federation/employees/:employeeId/pay-components
PUT    /v1/federation/employees/:employeeId/pay-components
PUT    /v1/federation/employees/:employeeId/manager
```

The exact paths may be adjusted during contract review; the capabilities must not be omitted.

### Workforce history and payroll

```text
GET    /v1/federation/attendance/history
POST   /v1/federation/attendance/:attendanceId/corrections/:correctionId/decision
GET    /v1/federation/leave/history
GET    /v1/federation/timesheets
POST   /v1/federation/timesheets/:timesheetId/submit
POST   /v1/federation/timesheets/:timesheetId/decision
GET    /v1/federation/shifts
POST   /v1/federation/shifts
PUT    /v1/federation/shifts/:shiftId
PUT    /v1/federation/shifts/:shiftId/assignments
GET    /v1/federation/payroll/statements
GET    /v1/federation/payroll/payslips/:payslipId
GET    /v1/federation/payroll/employees/:employeeId/breakdown
POST   /v1/federation/payroll/adjustments
GET    /v1/federation/compliance/employee/:employeeId
GET    /v1/federation/compliance/reports
```

Every mutation must define authorization, idempotency, audit, event, and error behavior before implementation.

---

## 6. Data and source-of-truth rules

### Smarteam canonical tables

Smarteam is authoritative for employee, employment, compensation, pay components, attendance, punches, corrections, leave, leave balances, shifts, timesheets, payroll runs, line items, adjustments, payslips, statutory data, audit records, and workforce events.

### BlizBooks projection tables

BlizBooks may retain projections for fast reads, resilience, reconciliation, and UI convenience. Every projection must include:

- Smarteam organization and employee identifiers.
- BlizBooks external identifiers.
- Source system.
- Last successful synchronization time.
- Source version/event ID or cursor.
- Projection status and error information.

Projection rows must never be used to authorize or perform a conflicting workforce mutation.

### Identifier rules

- Organization, branch, and employee external IDs must remain stable during migration.
- Every cross-system record must have an explicit external mapping.
- No client may select an arbitrary organization or branch by changing a request body field.
- Smarteam must resolve the organization/branch from the authenticated federation grant and mapped external IDs.

### Retention rules

Normal APIs must not physically delete operational, financial, attendance, leave, payroll, statutory, federation, or audit history. Lifecycle operations should use inactive/terminated states. Any later anonymization must be separately authorized, audited, and retention-policy driven.

---

## 7. Breaking points and controls

| Risk | Control required before cutover |
|---|---|
| Existing BlizBooks code expects local employee IDs | Preserve external IDs and add a mapping layer; do not silently regenerate identifiers |
| Duplicate writes during transition | Organization-level write freeze and idempotent Smarteam commands |
| BlizBooks cache becomes a hidden source of truth | Mark projections read-only and add source/freshness metadata |
| Native fallback writes bypass Smarteam | Feature-gate by organization ownership and reject provider-owned local writes |
| Different employee field ownership | Publish field ownership and enforce it in both native and federation APIs |
| Physical employee deletion breaks history | Use inactive/terminated lifecycle and retain records |
| Payroll mismatch during migration | Dual-calculate/compare selected periods and reconcile line-item components before cutover |
| Leave balance drift | Backfill balance transactions, not just current totals; reconcile history and opening balances |
| Attendance duplicates | Stable punch idempotency keys and replay-safe commands |
| Wrong tenant/branch access | Grant-based target resolution plus application and database isolation tests |
| Webhook loss or ordering issues | Transactional outbox, retry, replay cursor, deduplication, and reconciliation jobs |
| Sensitive payroll/statutory data leakage | DTO allowlists, authorization tests, redacted logs, encrypted storage where required |
| Federation contract incompatibility | Additive/versioned routes and captured BlizBooks contract fixtures |
| Unclear statutory requirements | Confirm jurisdiction, rules, filing responsibility, retention, and legal review before building calculations |

---

## 8. Verification plan

### Unit and domain tests

- Employee lifecycle transitions and field ownership.
- Employee compensation effective-date overlap prevention.
- Branch and organization authorization.
- Attendance duplicate prevention and correction decisions.
- Leave balance atomicity, approval, cancellation, and adjustment history.
- Timesheet approval and payroll input rules.
- Payroll reproducibility, adjustments, immutable locked runs, and correction runs.
- Statutory rule versioning and contribution calculations.
- Session revocation and access changes.

### Federation contract tests

- OAuth and mTLS behavior.
- Tenant and branch provisioning.
- Employee list/detail/create/update/lifecycle operations.
- Attendance, leave, timesheet, shift, payroll, payslip, and compliance endpoints.
- Exact payload casing, enum values, external IDs, pagination, and error envelopes.
- Idempotency and retry behavior for every mutation.
- Signed webhook verification, replay, ordering, and deduplication.

### Cross-repository integration tests

- BlizBooks authenticated tenant maps to exactly one Smarteam organization.
- Branch-scoped reads cannot return another branch or organization.
- BlizBooks employee create/edit/deactivate is persisted in Smarteam and returned through the BlizBooks BFF.
- Check-in/out, leave application, leave approval, attendance history, payroll run, salary breakdown, payslip, and statutory report all read/write Smarteam data only.
- BlizBooks local projections update from responses/events but cannot override Smarteam values.
- Provider outages fail safely without local divergence or unauthorized fallback writes.

### Migration verification

- Record counts match.
- External IDs match.
- Employee status and branch assignments match.
- Compensation and pay components match effective dates.
- Leave balances and transaction histories reconcile.
- Attendance and payroll historical totals reconcile.
- No unresolved projection or mapping errors remain at cutover.

### Security and isolation tests

- Cross-organization employee lookup is rejected.
- Cross-branch operations are rejected without grant scope.
- Federation client credentials cannot act as a human user outside their grant.
- Native users cannot modify fields owned by BlizBooks where ownership remains explicit.
- BlizBooks cannot write directly to Smarteam database tables.
- Sensitive payroll and statutory fields are not returned without the required scope.

---

## 9. Implementation order and gates

### Gate 0 — Review and contract freeze

- Approve this plan.
- Confirm statutory jurisdiction and scope.
- Confirm whether performance and onboarding are part of the first complete employee-management release.
- Confirm which BlizBooks accounting records remain local.
- Approve lifecycle terminology: inactive/terminated versus any anonymization requirement.
- Approve field ownership and identity mapping.

### Gate 1 — Smarteam contract and domain completion

- Complete employee federation queries and commands.
- Complete employee records, compensation, shifts, timesheets, payslips, and compliance contracts.
- Add domain tests and federation authorization/audit/events.

### Gate 2 — BlizBooks adapter and BFF conversion

- Add adapter methods and DTOs.
- Convert employee/workforce routes to Smarteam-backed operations.
- Add provider-owned write guards and projection metadata.
- Add cross-repository contract tests.

### Gate 3 — Migration rehearsal

- Run backfill in a non-production environment.
- Reconcile all employee/workforce domains.
- Test rollback and replay.
- Fix all mapping, permission, and projection errors.

### Gate 4 — Controlled production cutover

- Cut over one organization or pilot group.
- Freeze direct BlizBooks HR writes.
- Monitor commands, projections, webhooks, reconciliation, and payroll results.
- Expand only after the pilot meets every verification gate.

### Gate 5 — Completion and cleanup

- Remove obsolete canonical BlizBooks HR write paths for Smarteam-managed organizations.
- Keep only explicitly supported native fallback behavior.
- Update all documentation and operational runbooks.
- Confirm no untracked local HR source of truth remains.

---

## 10. Definition of complete

This integration is complete only when all of the following are true:

- Smarteam owns the authoritative employee record and all workforce domains.
- BlizBooks can list and display employee data exclusively from Smarteam-backed APIs/projections.
- Employee create, edit, status, branch, access, compensation, employment, manager, and emergency-contact operations are Smarteam-backed.
- Check-in/out, attendance history/corrections, leave, leave history, shifts, timesheets, payroll, salary breakdown, payslips, and statutory data are Smarteam-backed.
- No provider-owned workflow writes authoritative HR data to BlizBooks.
- Every organization and branch operation is isolated and grant-authorized.
- All mutations are idempotent, audited, replay-safe, and observable.
- Webhooks and reconciliation recover from delayed or failed delivery.
- Existing external IDs remain stable.
- Migration has been reconciled and signed off.
- Focused unit, integration, contract, security, isolation, and migration tests pass.
- The integration guide, API contract, ownership matrix, and runbooks match the implemented behavior.

The code implementation is complete for the employee/workforce scope defined above. Production readiness remains gated on migration rehearsal and reconciliation, deployment of the two Smarteam migrations, federation grant/capability rollout, cross-repository contract testing against a live Smarteam environment, and confirmation/configuration of the statutory jurisdiction. Those gates must pass before the integration is declared production-complete.
