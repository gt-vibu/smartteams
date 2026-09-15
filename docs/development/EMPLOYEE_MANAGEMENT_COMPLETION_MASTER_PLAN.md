# Employee Management Completion Master Plan

**Status:** Implementation baseline delivered; remaining production gates are tracked below
**Scope:** Smarteam employee/workforce backend, Smarteam federation APIs, BlizBooks workforce BFF, BlizBooks workforce UI, and BlizBooks superadmin federation controls
**Primary consumer:** BlizBooks
**Standalone requirement:** Smarteam must remain a complete standalone workforce platform and must not depend on BlizBooks-specific tables, workflows, or UI assumptions
**Out of scope:** Products, stock, issues, restocking, sales, and other non-employee application operations

## 1. Decisions and corrected scope

### 1.1 System ownership

Smarteam is the authoritative system for:

- Employee identity, employment, lifecycle, compensation, and workforce access.
- Attendance, shifts, timesheets, leave, approvals, payroll, payslips, and statutory records.
- Workforce business rules, calculations, audit history, events, and tenant/branch isolation.

BlizBooks is a consumer and operational interface. It may store local authentication/session data, application permissions, accounting projections, provider mappings, and integration delivery metadata. It must not become a second authoritative workforce database or calculate payroll independently.

Smarteam's native APIs and services must remain usable by standalone Smarteam customers. Federation is an additional boundary, not a replacement for the native domain.

### 1.2 BlizBooks route ownership

These routes have different purposes and must remain separate:

- `/hr`: workforce and employee management backed by Smarteam. This includes employee profiles, attendance, leave, payroll, timesheets, compliance, and workforce settings.
- `/teams` (recommended canonical route): BlizBooks application teams and operational access. This manages who can use BlizBooks application services such as products, stock, issues, restocking, POS operations, and other application permissions.
- `/employee`: the employee self-service workspace for attendance, leave, payroll statements, and permitted workforce actions.

The current `/employees` route is not a duplicate workforce employee-management route; it is the legacy name for the application teams/access surface. Use `/teams` as the canonical route for clarity, retain `/employees` as a backwards-compatible route alias, and do not merge either route with `/hr`. The implementation must prevent accidental cross-editing while allowing the same human to have both a Smarteam workforce identity and a BlizBooks operational role.

The route migration must include:

- Updating navigation labels, breadcrumbs, permissions documentation, links, tests, and deep links to `/teams`.
- Preserving existing `/employees` bookmarks with a compatibility alias that retains the existing route behavior and query parameters.
- Keeping the route's existing team, role, branch, and application-access behavior unchanged.
- Showing “Teams & access” or equivalent user-facing copy rather than “Employees” on the renamed surface.
- Verifying that `/hr` employee records and `/teams` application users remain separate concepts even when they refer to the same person.

### 1.3 Payroll calendar decision

Payroll does not require separate calendar dates for manager approval, finance approval, or other approval actors. Approval remains a stateful, permission-controlled workflow with comments and audit history, not a set of separate calendar milestones.

The payroll calendar should contain only the dates required to run payroll:

- Payroll period start and end.
- Attendance freeze date.
- Calculation date.
- Payroll release date.
- Salary credit date.

The following must not be added as payroll-calendar fields:

- Manager approval date.
- Finance approval date.
- HR approval date.
- Separate approver-specific calendar dates.

Approval permissions, approver assignment, comments, delegation, and audit history remain required; only the redundant calendar-date breakdown is excluded.

## 2. Current baseline

The employee create, compensation synchronization, employee edit synchronization, and attendance check-in/check-out paths are already functioning in the current environment according to the latest validation. The code also contains the core Smarteam domain, federation adapter, BlizBooks workforce BFF, and workforce UI surfaces.

The remaining work is completion and hardening, not a replacement of the existing architecture.

### 2.3 Implementation review snapshot — 22 August 2026

The current change set now delivers these items end to end through the Smarteam native domain,
Smarteam federation API, BlizBooks workforce BFF, and the relevant BlizBooks screens:

- Simplified payroll calendars with period start/end, attendance freeze, calculation, release, and
  salary-credit dates. Manager, HR, and finance approval dates are intentionally excluded.
- Provider-backed leave policy configuration using Smarteam's supported fields.
- Federated leave attachments with type/size validation, upload completion, employee ownership, and
  best-effort cleanup when leave creation fails.
- Federated approval-policy list/create/update/deactivate operations with ordered role, employee,
  and manager steps.
- Provider-backed payroll component creation and employee component assignment.
- A statutory scheme catalog for the initial India reference schemes, with explicit notices that
  the catalog is not itself a statutory calculation engine.
- The `/teams` application-access route alias, while `/hr` remains the workforce employee route.
- Federation rate limiting and idempotency protection on the newly added approval and file routes.
- Dedicated approval-policy capability gating, native/federated leave-file ownership compatibility,
  and server-side payroll component value/formula validation.
- Payroll component assignment controls are hidden from BlizBooks payroll viewers who do not have
  payroll-management permission.

The following are **not yet production-complete** and must not be represented as complete merely
because the configuration screens now exist: attendance-to-payroll fixture coverage, full payroll
preview/detail UI, jurisdiction-specific EPF/ESI/PT/TDS calculation and filing exports, delegation
and SLA escalation, shifts/holiday administration, document/payslip download UX, superadmin
credential rotation and reconciliation controls, live migration rehearsal, and browser-based
responsive acceptance. These are explicit release gates, not hidden assumptions.

### 2.1 Existing capabilities to preserve

- OAuth client-credentials federation and production mTLS support.
- Federation tenant and branch provisioning.
- Grants, scopes, capability discovery, and organization/branch isolation.
- Correlation IDs, idempotency, audit logging, outbox/events, webhook verification, replay, and reconciliation patterns.
- Smarteam native employee, attendance, leave, shift, timesheet, payroll, and compliance modules.
- BlizBooks provider adapter and workforce BFF.
- BlizBooks HR tabs for employees, attendance, leave, payroll, timesheets, and compliance.
- BlizBooks employee self-service workspace.
- BlizBooks superadmin provider and outlet integration configuration.

### 2.2 Gap status after the current implementation

1. **Branch mapping:** the adapter now resolves provider branch IDs through the cached mapping
   before using the legacy local-ID fallback. A missing or stale mapping still needs a dedicated
   superadmin repair/diagnostic experience.
2. **Payroll calendar:** the contract and UI now persist only the simplified processing dates
   defined above; manager, HR, and finance approval dates remain intentionally absent.
3. **Leave policy:** the BlizBooks form now sends Smarteam's supported policy fields. Advanced
   leave-year, half-day/hourly, eligibility, and effective-dating controls remain open.
4. **Approval policies:** basic federated list/create/update/deactivate and ordered steps are now
   available. Delegation, escalation, SLA, and immutable version UX remain open.
5. **Payroll components:** creation, formula metadata, and employee assignments are now exposed.
   Full payroll preview/detail, employer-contribution presentation, and correction UX remain open.
6. **Attendance-to-payroll:** the domain has the existing attendance/timesheet/payroll path, but
   fixture-based rule coverage and acceptance testing remain open.
7. **Statutory compliance:** the scheme catalog and profile/record plumbing are available, but
   jurisdiction-specific EPF/ESI/PT/TDS calculation and filing exports remain open.
8. **Employee self-service:** leave reasons, cancellation reasons, approval comments, and leave
   attachments are covered. Detailed payslip, statutory detail, notification, and document UX remain open.
9. **Superadmin controls:** existing integration enablement and capability refresh remain available;
   credential rotation, mapping repair, reconciliation, webhook operations, and emergency-disable UX remain open.

## 3. Target architecture and contract rules

### 3.1 Shared ownership contract

Every workforce field and command must be classified as one of:

- **Smarteam-owned:** authoritative workforce data and business rules.
- **BlizBooks-owned:** local application roles, sessions, application permissions, and accounting records.
- **Mapped:** external organization, branch, employee, user, grant, and capability identifiers.
- **Projected:** read-only BlizBooks representation of Smarteam data.

The classification must be documented in the integration guide and represented in API response metadata where practical.

### 3.2 Federation invariants

Every federation request must validate:

- Client authentication and transport requirements.
- Organization and branch mapping.
- Required grant and scope.
- External employee ownership by the target organization.
- Branch assignment where the operation is branch-scoped.
- Idempotency for writes.
- Correlation ID propagation.
- Expected version for approval/correction/update conflicts.
- Audit reason for material changes.

Federation controllers remain thin. Native Smarteam services remain the single implementation of workforce business rules.

### 3.3 Standalone Smarteam rule

No Smarteam service, database table, domain rule, or native controller may require a BlizBooks organization ID, BlizBooks branch ID, BlizBooks user ID, BlizBooks route, or BlizBooks-specific role name. External identifiers belong at the federation boundary and must be translated there.

## 4. Smarteam backend workstreams

### 4.1 Employee and employment domain

Complete and test native plus federated support for:

- Employee list, search, filters, stable pagination, and branch scope.
- Employee create/upsert with external ID and idempotency.
- Legal name, preferred name, employee number, work/personal contact details, and status.
- Joining date, leaving date, employment type, job title, department, work location, manager, and shift.
- Employment history with effective dates and change reasons.
- Compensation history with pay basis, currency, frequency, amount, overtime rule, effective date, and end date.
- Emergency contacts.
- Branch assignment and removal.
- Workforce role/access assignment and revocation.
- Deactivation, termination, session revocation, and audit history.
- Provider source metadata and external-ID mapping.

Use deactivation and termination for normal lifecycle management. Do not add destructive deletion for records that participate in attendance, leave, payroll, statutory, accounting, audit, or federation history.

### 4.2 Attendance, shifts, and timesheets

Complete:

- Work-week and holiday calendars.
- Shift definitions, working hours, breaks, overnight shifts, grace periods, late thresholds, and effective dates.
- Employee and branch shift assignment.
- Attendance method configuration: passkey, GPS, geofence, liveness, trusted device, Wi-Fi, offline mode, notes, and correction requests.
- Manual attendance records and corrections with reason, actor, version, and approval state.
- Attendance history with verification evidence and correction history.
- Timesheet derivation from approved attendance.
- Manual timesheet adjustments with reason.
- Regular minutes, overtime minutes, break minutes, and approval state.
- Timesheet submission, approval, rejection, and resubmission.

Define and test the exact payroll input contract. A check-in/check-out record must not silently become payable time without the configured attendance and timesheet rules.

### 4.3 Leave domain

The Smarteam leave policy contract must support:

- Code and name.
- Paid or unpaid status.
- Accrual type: none, fixed annual, monthly, per pay period, or manual.
- Annual allowance.
- Monthly accrual.
- Carry-forward limit.
- Leave-year start month.
- Attachment requirement.
- Half-day and hourly rules where supported by the domain.
- Effective date and deactivation.
- Eligibility by organization, branch, employee type, department, or assignment.

The leave request contract must support:

- Leave type.
- Start/end date and duration.
- Half-day/hourly duration where configured.
- Reason.
- Attachments.
- Balance reservation.
- Approval-chain state.
- Cancellation reason.
- Version and idempotency.

Balance accrual must be implemented as a deterministic, auditable process. A new balance must not silently remain at zero when a configured policy should accrue days.

### 4.4 Approval policies

Expose a standalone Smarteam approval-policy domain and a federation surface for permitted BlizBooks administrators.

Support:

- Approval domain: leave, attendance correction, timesheet, payroll, and future domains.
- Policy code, name, active/default state, effective dates, and version.
- Ordered steps.
- Manager, role, or specific-user approvers.
- Multiple approval steps.
- Delegation and substitute approver.
- Escalation and SLA configuration where supported.
- Required decision comment.
- Rejection reason.
- Full decision timeline and audit history.

Approval policy execution must remain in Smarteam. BlizBooks may configure or display it through federation but must not recreate approval state locally.

### 4.5 Payroll setup and calculation

Implement or complete Smarteam support for:

- Organization payroll frequency and simplified payroll calendar.
- Payroll period start/end.
- Attendance freeze date.
- Calculation date.
- Release date.
- Salary credit date.
- Salary components.
- Employee component assignments.
- Effective dates and historical component changes.
- Fixed, percentage, and formula components.
- Earning, deduction, and employer-contribution component types.
- Taxability and display order.
- Adjustments, bonuses, reimbursements, deductions, overtime, and corrections.
- Payroll preview and calculation snapshot.
- Payroll run state transitions.
- HR/authorized payroll review as a permissioned action, without adding an HR approval calendar date.
- Release, lock, correction, void, and audit behavior.
- Detailed payslip and ledger output.

The calculation must explicitly define:

- Monthly, daily, hourly, and shift-based pay.
- Joining and leaving month proration.
- Paid and unpaid leave treatment.
- Absence, half-day, late, early checkout, holiday, and weekly-off treatment.
- Break and overtime treatment.
- Overtime eligibility and approval.
- Component order and formula dependency.
- Rounding precision and currency.
- Negative net pay behavior.
- Arrears and retroactive salary changes.
- Recalculation and locked-run behavior.

The current base calculation pattern of base pay, unpaid-leave adjustment, approved overtime, components, adjustments, and deductions should be retained only after these rules are explicit and covered by payroll fixtures.

### 4.6 Statutory compliance domain

Replace the generic-only compliance model with a jurisdiction-neutral core plus versioned jurisdiction schemes.

The core must support:

- Organization registrations.
- Employee scheme enrollment.
- Employee identifiers.
- Eligibility/coverage state.
- Wage basis.
- Employee/employer contribution results.
- Effective-dated rule versions.
- Exemptions and overrides with reason and approval.
- Period snapshots.
- Filing references and status.
- Challan/payment references.
- Corrections and reversals.
- Reconciliation against payroll.
- Audit and retention.

Initial India scheme adapters should be separate from the core and should not be hard-coded into generic `schemeCode` handling.

## 5. Dynamic configuration interfaces

Dynamic values must be configurable through interfaces, but the authoritative configuration must be stored in Smarteam. BlizBooks should provide a provider-backed configuration UI; it must not maintain a parallel local configuration.

### 5.1 Smarteam organization settings

Provide native Smarteam configuration for:

- Organization timezone and locale.
- Currency.
- Work week.
- Leave year start.
- Payroll frequency.
- Payroll calendar dates.
- Standard workday minutes.
- Rounding rules.
- Default holiday calendar.
- Default approval policies.
- Statutory jurisdiction.
- Organization registrations.

### 5.2 BlizBooks HR configuration

The `/hr/settings` interface must provide provider-backed tabs for:

- Attendance.
- Shifts and work schedules.
- Holidays and work week.
- Leave types.
- Leave balances and adjustments.
- Approval policies.
- Payroll components.
- Employee component assignments.
- Payroll calendar.
- Statutory schemes and registrations.

Every tab must show:

- Data source: Smarteam.
- Last refreshed time.
- Save status.
- Provider availability.
- Permission required.
- Validation errors.
- Retry action.
- Audit reason where required.

### 5.3 Configuration safety

- Rates and statutory ceilings must not be free-text defaults in the general UI.
- Configuration changes must be effective-dated.
- Destructive changes must be deactivation, not deletion, when historical payroll or attendance references exist.
- Configuration changes must be versioned and auditable.
- A configuration must not be enabled until all required dependent fields are valid.
- BlizBooks must not display a successful save when the provider rejected or ignored a field.

## 6. BlizBooks UI/UX completion plan

The UI must use the existing BlizBooks visual language: light neutral surfaces, blue primary actions for workforce operations, restrained cards, clear status badges, consistent spacing, and the existing purple treatment for superadmin surfaces. The goal is refinement and consistency, not a separate design system.

### 6.1 Workforce admin screens

Complete the following interfaces:

- Employee directory with filters, search, pagination, export, sync status, and bulk actions.
- Employee create/edit form with complete employment and compensation fields.
- Employee profile with employment, compensation, attendance, leave, payroll, compliance, access, documents, and audit tabs as provider capabilities allow.
- Attendance register and correction queue.
- Shift and schedule administration.
- Leave type and balance administration.
- Approval policy administration.
- Timesheet review queue.
- Payroll component and assignment administration.
- Payroll run preview, action confirmation, adjustment, detail, release, and lock screens.
- Statutory profile, contribution record, reconciliation, and filing-status screens.

The application-access surface should be presented separately as `/teams` and must continue to manage BlizBooks operational roles and service access only. It must not expose Smarteam payroll, leave, attendance, or statutory mutations.

### 6.2 Employee self-service screens

Complete:

- Attendance dashboard with shift, expected hours, actual hours, breaks, overtime, corrections, and monthly history.
- Leave request flow with balance detail, half-day/hourly options, attachments, approval timeline, comments, rejection reason, and cancellation reason.
- Payroll statement detail with earnings, deductions, employer contributions, overtime, leave impact, statutory values, adjustments, and PDF/export where available.
- Personal profile and permitted statutory information.
- Notifications for approvals, rejection, payroll release, correction decisions, and provider errors.

### 6.3 Superadmin screens

Add:

- Provider health and version.
- Client credential rotation and revocation.
- mTLS certificate management.
- Organization and branch mapping.
- Grants, scopes, and capability visibility.
- Tenant/branch provisioning status.
- Synchronization and reconciliation controls.
- Webhook delivery and replay status.
- Emergency module disable.
- Audit history for integration changes.

### 6.4 Responsive and accessibility requirements

- No important table may require desktop-only horizontal scrolling without a responsive card alternative.
- On mobile, employee, leave, payroll, and attendance rows must become readable cards with primary actions visible.
- Forms must use single-column layouts on small screens and two-column layouts only where space permits.
- Dialogs must fit mobile viewports and support keyboard escape, focus trapping, and clear validation.
- All controls require labels, visible focus states, keyboard navigation, and accessible status text.
- Error, empty, loading, stale, unavailable, and success states must be distinct.
- Long provider errors must be human-readable with a technical details affordance.
- Dates, currency, hours, and status labels must use organization locale/timezone.
- Destructive or irreversible actions require confirmation and a reason.
- Responsive behavior must be verified at mobile, tablet, laptop, and wide desktop widths.

### 6.5 UI source and trust indicators

Provider-owned data must visibly indicate:

- Smarteam source.
- Last refreshed time.
- Unavailable/stale state.
- Whether the action is pending provider confirmation.
- Whether the row is a local projection or a live provider response.

Do not show a connected badge when the mapped provider branch or required capability is unusable.

## 7. BlizBooks and Smarteam integration hardening

### 7.1 Branch mapping

Implement a diagnostic and repair flow that verifies:

- BlizBooks organization and branch.
- Smarteam organization and branch.
- `providerBranchId` mapping.
- External employee mappings.
- Provider grants and scopes.
- Provider capability availability.

The settings error `Branch was not found` must produce a clear recovery path instead of a generic red banner only.

### 7.2 Contract consistency

Add contract tests for:

- Employee create, update, deactivate, and branch assignment.
- Attendance configuration and check-in/check-out.
- Attendance correction and decision comments.
- Leave policy create/update.
- Leave request, attachment, approval, rejection, and cancellation reasons.
- Approval-policy configuration.
- Shift and timesheet operations.
- Payroll calendar.
- Salary components and assignments.
- Payroll run actions and required comments.
- Payroll ledger and payslip detail.
- Compliance profiles and period records.

Tests must verify both accepted fields and rejected/unknown fields. A field must not appear in BlizBooks unless Smarteam persists and returns it.

### 7.3 Synchronization and recovery

Implement:

- Initial tenant/branch reconciliation.
- Employee reconciliation by external ID.
- Safe retry for transient provider errors.
- Idempotent writes.
- Dead-letter or failed-operation visibility.
- Webhook replay.
- Pull-based repair when an event is missed.
- Per-tenant and per-branch sync status.
- Audit trail for all repair actions.

## 8. India statutory planning assumptions

These values are planning references only. They must be represented as effective-dated, jurisdiction-configured rule data and revalidated against current official notifications before production use.

### 8.1 EPF baseline to validate

The official EPFO contribution reference lists a standard employee contribution of 12% and employer-side allocation involving EPF, EPS, EDLI, and administrative charges. It also references a ₹15,000 wage ceiling and exceptions/higher-wage options. The implementation must therefore model wage basis, coverage, higher-wage option, EPS/EDLI allocation, rounding, and establishment-level exceptions rather than a single editable PF percentage.

Reference: <https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf>

### 8.2 ESI baseline to validate

The official ESIC publication describes the commonly used employee contribution of 0.75%, employer contribution of 3.25%, and a ₹21,000 monthly coverage wage limit, with a separate threshold for eligible persons with disabilities. These must be configured by effective date and employee/establishment eligibility rather than hard-coded globally.

Reference: <https://esic.gov.in/attachments/publicationfile/79b91f03d8b280e6dc6da3537617ef26.pdf>

### 8.3 TDS baseline to validate

If TDS is included, employee declarations and Form 16 outputs must be designed around the applicable financial year and current Income Tax Department requirements. The employee workflow should support declaration evidence and the payroll workflow should retain the calculation snapshot used for TDS.

Reference: <https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1?mobile-app=1>

### 8.4 Additional statutory scope decision

Before implementation, explicitly confirm whether the first statutory release includes:

- Professional tax.
- Labour welfare fund.
- Gratuity accrual.
- Bonus calculations.
- Maternity-related leave/pay rules.
- Payment-of-wages constraints.
- Form 16/TDS.
- ECR/ESI filing export.

If a scheme is not in the first release, it must be visibly marked as not enabled rather than represented by a generic manual rate field.

## 9. Security, privacy, and audit requirements

- Apply least-privilege permissions to every workforce screen and endpoint.
- Separate view, manage, configure, approve, release, and compliance permissions.
- Enforce organization and branch boundaries on every read and write.
- Do not expose client secrets after initial storage.
- Encrypt sensitive statutory, tax, identity, bank, and document data where applicable.
- Do not place secrets or statutory identifiers in logs, URLs, browser storage, or error messages.
- Record actor, timestamp, reason, previous value, new value, source, correlation ID, and provider response for material changes.
- Protect payroll and compliance exports with permission checks and audit records.
- Revoke or disable workforce access after termination according to the configured policy.
- Retain immutable payroll and statutory snapshots according to the applicable retention policy.

## 10. Verification and acceptance gates

### 10.1 Automated checks

- Smarteam type-check, lint, unit tests, service tests, migration validation, and API contract tests pass.
- BlizBooks type-check, lint, unit tests, BFF tests, adapter tests, and UI tests pass.
- Federation contract tests run against a real Smarteam instance or production-equivalent test database.
- No DTO/UI field mismatch remains between BlizBooks and Smarteam.

### 10.2 End-to-end employee acceptance

For a new employee:

1. Create employee in BlizBooks.
2. Confirm employee, employment, compensation, and branch records in Smarteam.
3. Log in through the employee workspace.
4. Check in and check out.
5. Confirm attendance in Smarteam.
6. Derive or enter the timesheet.
7. Submit and approve the timesheet.
8. Submit leave and confirm balance reservation.
9. Approve/reject leave with a required comment.
10. Configure salary components.
11. Run payroll.
12. Confirm attendance, leave, overtime, components, deductions, and statutory results.
13. Release and lock payroll.
14. Confirm the employee payslip and ledger.
15. Edit employment or compensation and confirm effective-dated synchronization.
16. Terminate/deactivate the employee and confirm access/session behavior.

### 10.3 Integration acceptance

- Correct organization and provider branch are shown for every outlet.
- Settings load without `Branch was not found`.
- Provider outages fail closed without silently switching to native BlizBooks HR data.
- Retry and reconciliation repair expected transient failures.
- Duplicate commands do not create duplicate employees, punches, leave requests, payroll runs, or statutory records.
- Webhook replay produces the same final projection as the original event.
- A locked payroll run cannot be silently changed.
- Audit history can explain every material employee, leave, payroll, compliance, and access change.

### 10.4 UI acceptance

- All workforce pages work at mobile, tablet, desktop, and wide desktop widths.
- No form loses entered values after provider validation errors.
- Empty states explain what the user should configure next.
- Loading and stale states are distinguishable from empty data.
- All approval, cancellation, correction, payroll, and statutory actions show a confirmation and reason where required.
- All employee-facing data is scoped to the signed-in employee.
- Admin-facing data is scoped to the permitted organization/branch.

## 11. Delivery sequence

1. Fix branch mapping and provider diagnostics.
2. Align all DTOs, adapters, controllers, and UI fields.
3. Complete Smarteam approval-policy federation.
4. Complete leave, attendance, shift, holiday, and timesheet configuration.
5. Complete payroll components, assignments, simplified calendar, preview, adjustments, and detailed payslips.
6. Implement attendance-to-timesheet-to-payroll rules and fixtures.
7. Implement statutory core and the first confirmed India scheme adapters.
8. Complete employee self-service and admin workflow UI.
9. Rename the BlizBooks application-access route from `/employees` to `/teams`, add the compatibility redirect, and verify all navigation and permission paths.
10. Complete superadmin credentials, scopes, capabilities, mapping, reconciliation, and emergency controls.
11. Run migration/backfill rehearsal, end-to-end UAT, security review, and production rollout gates.

Completion means the same scenario works through Smarteam native APIs, Smarteam federation APIs, the BlizBooks BFF, and the relevant BlizBooks UI without duplicated business rules, dropped configuration, scope violations, stale success messages, or unsynchronized records.
