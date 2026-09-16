# Payroll Salary Structure and Employee Payment Plan

**Status:** Implementation specification and delivery plan  
**Owner:** Smarteam payroll domain  
**Consumers:** Smarteam native application and BlizBooks federation  
**Scope:** Backend-first, with provider-backed BlizBooks UI changes included in the delivery design

## 1. Objective

Build a configurable payroll system where an employee's gross salary is the source amount and
Smarteam derives the salary structure, attendance/leave impact, statutory deductions, advance
recovery, payslip, and employee payment state from effective-dated rules.

Smarteam remains the authoritative system for:

- Employee identity, employment, compensation, salary policies, and effective dates.
- Attendance, approved corrections, shifts, timesheets, leave, and approval workflows.
- Payroll policy, salary calculations, statutory calculations, advances, payslips, payments, and
  payroll audit history.
- Tenant, branch, permission, event, and federation boundaries.

BlizBooks remains a consumer and operational interface. It may hold local sessions, application
permissions, provider mappings, accounting projections, and integration metadata. It must not
calculate payroll locally or become a second salary source of truth.

The same Smarteam APIs must work for a standalone Smarteam customer without a BlizBooks client.
Federation is an adapter and transport boundary, not a business-rule branch inside payroll.

## 2. Decisions confirmed by the client

1. Employee salary input is **monthly gross salary**.
2. HRA percentage is configurable and changeable by payroll administrators.
3. HRA is a normal configurable earning component, not a hard-coded special case.
4. PF, ESI, and PT must follow applicable rules and remain effective-dated/configurable.
5. Salary uses a fixed 30-day payroll basis for proration.
6. Employee salary structures may vary by employee and by effective date.
7. Salary calculation, attendance, leave, advances, and payments are Smarteam-owned.

## 3. Canonical calculation model

### 3.1 Monthly salary structure

The employee compensation record stores `grossSalary`, not a value whose meaning changes between
base pay and gross pay. A compatibility migration may temporarily read the existing
`baseAmount`, but new APIs must expose the unambiguous `grossSalary` name.

For a default structure:

```text
base = min(grossSalary, max(grossSalary × basePercentage, baseMinimum))
hra = min(base × hraPercentage, grossSalary − base)
otherAllowance = grossSalary − base − hra
```

Recommended initial organization defaults:

```text
basePercentage = 50%
baseMinimum = ₹15,000
hraPercentage = 40%
payrollDayBasis = 30
currency = INR
payFrequency = MONTHLY
```

The base and HRA values must never make total earnings exceed gross salary. Other allowance is a
balancing component and must never become negative. If an administrator creates a different
component configuration, the engine must validate that the earning components reconcile to gross.

### 3.2 Component model

Components are organization-owned definitions and employee-specific effective-dated assignments.
Each component has:

- Code and display name.
- `EARNING`, `DEDUCTION`, or `EMPLOYER_CONTRIBUTION` type.
- Fixed, percentage, or validated formula calculation.
- Calculation basis (`GROSS`, `BASE`, `ELIGIBLE_WAGES`, `REMAINING_GROSS`, or a future basis).
- Tax/statutory classification.
- Rounding rule.
- Display order.
- Effective start/end dates.
- Active/deactivated state.

The HRA component should be configured as:

```text
Code: HRA
Type: EARNING
Calculation: Percentage of base
Percentage: organization-configured, initially 40%
Maximum: remaining gross after base
Taxability: configured by the applicable payroll policy
```

The balancing component should be configured as:

```text
Code: OTHER_ALLOWANCE
Type: EARNING
Calculation: remaining gross
```

The engine, not the UI, is responsible for enforcing the reconciliation invariant.

### 3.3 Salary slip policy

Salary-slip visibility is separate from calculation:

- `DETAILED`: earnings, deductions, employer contributions, leave impact, overtime, statutory
  values, adjustments, advances, and net pay are shown.
- `SUMMARY`: gross, total deductions, advance recovery, net pay, status, and payment details are
  shown without the detailed structure.

The organization has a default mode. Each employee may have an override. Turning detailed slips
off must not bypass configured deductions or statutory calculations.

### 3.4 Employee policy overrides

Employee payroll policy must support explicit values rather than role-name assumptions:

- Payroll enabled/disabled.
- Salary slip mode override.
- PF enabled/disabled/auto.
- ESI enabled/disabled/auto.
- PT enabled/disabled/auto.
- Statutory registration and eligibility metadata.
- Effective date and reason.

`AUTO` resolves from the organization policy and statutory eligibility. Historical payroll runs
must retain the resolved value in their calculation snapshot.

## 4. Attendance, leave, and proration rules

### 4.1 Fixed 30-day basis

For a monthly employee:

```text
dailyComponentValue = monthlyComponentValue ÷ 30
payableComponentValue = dailyComponentValue × payableDays
```

The engine must not rebuild the employee structure using the reduced gross amount. For a ₹30,000
employee with 27 payable days:

```text
Base:            ₹15,000 × 27/30 = ₹13,500
HRA:              ₹6,000 × 27/30 = ₹5,400
Other allowance:  ₹9,000 × 27/30 = ₹8,100
Estimated gross: ₹27,000
```

### 4.2 Payable-day rules

The organization policy must declare how each day is classified:

- Present: payable.
- Approved paid leave: payable.
- Approved unpaid leave: not payable.
- Approved absence: not payable.
- Holiday/rest day: not deducted unless the organization's attendance policy explicitly marks it
  payable.
- Approved attendance correction: replaces the affected attendance fact before payroll freeze.
- Unresolved attendance: blocks final calculation or is explicitly resolved by an authorized user;
  it must never silently become payable or unpaid.

Timesheets and attendance remain separate inputs. Timesheets provide approved regular/overtime
minutes; attendance and leave determine payable-day treatment.

### 4.3 Overtime

Overtime is an earning component or adjustment with an explicit basis and multiplier. The default
should be:

```text
overtimeRate = grossSalary ÷ 30 ÷ standardDayHours
overtimePay = overtimeHours × overtimeRate × employeeMultiplier
```

The organization may choose a statutory/contractual basis. The selected basis must be included in
the payroll snapshot.

## 5. Statutory policy design

Statutory values must be represented as jurisdiction/rule records with effective dates, not
scattered constants in the calculation service. A rule contains eligibility predicate, wage basis,
rate, ceiling/floor, employee/employer side, rounding, and source reference.

### 5.1 PF

PF should support:

- Employee contribution rate.
- Employer contribution rate and split metadata.
- PF wage basis, initially eligible PF wages rather than an unqualified generic base.
- Wage ceiling and voluntary higher-wage option.
- Employee enrollment/eligibility state.
- Effective date and source reference.

The initial employee-rate default may be 12%, but the system must apply the selected official rule
for the establishment and employee rather than blindly applying 12% to every base salary.

### 5.2 ESI

ESI should support:

- Employee contribution rate, initially 0.75% where applicable.
- Employer contribution rate, initially 3.25% where applicable.
- Coverage wage ceiling and special eligibility metadata.
- ESI wage basis.
- Employee enrollment/eligibility state.
- Effective date and source reference.

The client examples use base salary, but the production rule must calculate against the configured
eligible ESI wage basis. The official ESIC material identifies both contribution rates and coverage
conditions; these must not be reduced to a single percentage toggle.

### 5.3 Professional Tax

PT is state/jurisdiction-specific. It must be modeled as an effective-dated slab table, for example:

```text
jurisdiction = IN-KA
ruleCode = KA_PT_2025
slabs = [{ min: 0, max: 24999.99, amount: 0 },
         { min: 25000, max: null, amount: 200 }]
frequency = MONTHLY
```

The Karnataka official notification identifies ₹200 per month for salary/wage earners at ₹25,000
and above. This rule must still be seeded only for the matching jurisdiction and effective date;
other states must use their own rule tables.

### 5.4 Statutory safety

The UI must show the jurisdiction, rule version, effective date, and source reference. Payroll
configuration must be blocked when the jurisdiction or rule source is incomplete. Statutory rules
must be auditable and historical payroll must retain the exact rule snapshot.

## 6. Advances

Salary advances are a first-class domain, not a generic payroll adjustment.

### 6.1 Advance lifecycle

```text
PENDING → APPROVED → PARTIALLY_RECOVERED → RECOVERED
PENDING → REJECTED
PENDING/APPROVED → CANCELLED
```

Required fields:

- Organization and employee.
- Requested amount, reason, request timestamp.
- Approver, decision timestamp, and decision reason.
- Recovery mode: one-time or installment.
- Approved recoverable amount.
- Recovered amount and outstanding amount.
- Payroll run/payment allocation references.
- Effective/recovery cutoff and audit version.

An approved advance becomes recoverable only when its approval is before the payroll cutoff. A
recovery allocation is immutable after payroll lock.

### 6.2 Recovery window

The default recovery window is:

```text
previous employee salary payment timestamp
→ current payroll salary-credit/payment cutoff
```

The rule must be explicit about inclusive/exclusive boundaries and must prevent duplicate recovery.
An advance approved after cutoff moves to the next eligible payroll cycle.

## 7. Payroll processing and payments

Calculation and payment are separate.

### 7.1 Payroll run lifecycle

Retain the current run lifecycle:

```text
DRAFT → CALCULATED → APPROVED → RELEASED → LOCKED
```

Add a calculation preview/detail response before approval. A calculation snapshot must include the
employee gross salary, selected components, payable days, attendance/leave inputs, statutory rule
versions, advance allocations, rounding, and calculation version.

### 7.2 Employee payment lifecycle

Add a payment record per employee line:

```text
PENDING → PAID
PENDING → FAILED
PAID → REVERSED
```

Required fields:

- Payroll line and employee.
- Payable amount and currency.
- Payment status.
- Paid timestamp and timezone.
- Payment method/reference.
- Actor/system that marked it paid.
- Reversal reason and audit history.

The payroll run must not be marked paid merely because one employee was paid.

## 8. Standalone Smarteam APIs

Implement native endpoints first. They must not require federation headers or BlizBooks identifiers:

- Payroll policy read/update.
- Statutory jurisdiction/rule catalog and organization selection.
- Pay component CRUD and effective-dated employee assignment.
- Employee payroll policy/profile read/update.
- Payroll preview and detailed line items.
- Payroll run creation, calculation, approval, release, and lock.
- Salary advance request, list, approve, reject, cancel, and recovery history.
- Employee payment mark-paid, failed, and reversed operations.
- Employee estimated salary dashboard.
- Detailed payslip and payroll history.

Native services are the single implementation of all calculation and authorization rules.

## 9. Federation contract changes

BlizBooks should call the same SmartTeams domain services through additive federation endpoints.
The federation adapter must translate identifiers and money units only; it must not recalculate.

Add capability/scopes for:

```text
payroll.settings.read
payroll.settings.write
payroll.components.read
payroll.components.write
payroll.employee-profile.read
payroll.employee-profile.write
payroll.preview.read
payroll.advances.read
payroll.advances.write
payroll.advances.decide
payroll.payments.read
payroll.payments.write
payroll.payslips.read
payroll.runs.read
payroll.runs.write
payroll.runs.calculate
payroll.runs.approve
payroll.runs.release
payroll.runs.lock
```

Every federated write must retain organization/branch scope, external employee ownership,
idempotency, correlation IDs, audit actor, and webhook/replay behavior.

## 10. BlizBooks UI/UX plan

### 10.1 HR settings → Payroll

Keep the existing provider-backed Payroll settings tab, but organize it into four sections:

1. **Payroll policy**
   - Monthly frequency.
   - Fixed 30-day basis.
   - Workday/attendance policy.
   - Rounding policy.
   - Salary-slip default mode.
   - Advance enablement and approval/recovery settings.

2. **Salary components**
   - Component list with type, basis, rate, taxability, effective date, and status.
   - HRA is created/edited here as a normal component.
   - Guided “balancing allowance” component cannot produce negative earnings.
   - Deactivation instead of deletion once referenced by payroll.

3. **Statutory rules**
   - Jurisdiction selector.
   - PF/ESI/PT enablement and defaults.
   - Rule version/source/effective date.
   - Eligibility preview and warnings.
   - No free-form statutory rates without required rule metadata.

4. **Payroll calendar**
   - Period start/end.
   - Attendance freeze.
   - Calculation date.
   - Release date.
   - Salary credit date.
   - No fake manager/finance approval dates; approvals remain workflow states.

Only users with payroll configuration permission see write controls.

### 10.2 HR → Employees → Employee → Payroll

Add an employee payroll tab with:

- Monthly gross salary and currency.
- Effective date and history.
- Salary-slip mode override.
- PF/ESI/PT policy toggles: Auto, On, Off.
- Statutory eligibility/registration details.
- Assigned components and employee-specific overrides.
- Live structure preview showing gross reconciliation.
- “What changes on [effective date]?” summary.

The preview must display:

```text
Gross salary
Base
HRA
Other allowance
Estimated deductions
Estimated net
```

It must clearly label estimated values until a payroll run is calculated.

### 10.3 HR → Payroll

Use tabs:

- **Overview:** current cycle, totals, action-required counts, paid/pending totals.
- **Runs:** create, calculate, preview, approve, release, lock.
- **Employees:** one row per employee with gross, deductions, net, payment status, and action.
- **Advances:** pending approvals, approved advances, recovery status.
- **Payments:** mark individual employees paid with method/reference and timestamp.
- **Ledger:** released/locked accounting entries.

Payroll preview must be available before approval and show blocking errors instead of allowing a
partially configured run to proceed.

### 10.4 Employee self-service

Keep `/employee/payroll` and add:

- Current monthly gross salary.
- Estimated current-month salary.
- Payable days and paid/unpaid leave summary.
- Approved advance balance and recovery history.
- Salary statements and detailed payslips when enabled.
- Payment date/status for each released payroll.

Add `/employee/advances` or a clearly separated Advances tab with request, status, approval,
recovery, and rejection reason.

Employees must never see another employee's payroll, statutory data, advance, or payment details.

### 10.5 Responsive and state design

- Desktop: tables with expandable calculation details.
- Tablet: condensed tables with horizontal-safe columns and detail drawers.
- Mobile: employee payroll cards with gross/net/status as primary content and details in a drawer.
- Every provider screen has loading, empty, stale, unavailable, validation, success, and retry
  states.
- Mutating payroll, statutory, advance, and payment actions require confirmation and a reason where
  applicable.
- Source badge must identify live Smarteam data versus a local projection.

## 11. Permissions and Teams & Access

Existing BlizBooks payroll permissions are `view`, `manage`, `approve`, and `configure`. Preserve
them and add granular permissions:

```text
hr.payroll.settings.view
hr.payroll.settings.manage
hr.payroll.salary-structures.view
hr.payroll.salary-structures.manage
hr.payroll.statutory.view
hr.payroll.statutory.manage
hr.payroll.advances.view
hr.payroll.advances.request
hr.payroll.advances.approve
hr.payroll.payments.view
hr.payroll.payments.manage
hr.payroll.preview.view
```

Recommended defaults:

- Employee/workforce member: view own payroll, request own advance.
- Payroll manager/HR: configure salary policies, manage employee structures, manage advances, run
  previews, and manage payments.
- Payroll approver/finance: approve payroll and mark/reconcile payments, but not change statutory
  policy unless separately granted.
- Hotel administrator: existing broad payroll configuration access, subject to tenant policy.
- Auditor: read-only payroll, statutory, advance, and payment history where explicitly granted.

The permissions must be added to the BlizBooks permission catalog, role defaults, Teams & Access
page, route guards, BFF guards, SmartTeams native permission catalog, federation grant catalog, and
contract tests. Never infer payroll authority from a job title.

## 12. Data migration and compatibility

1. Preserve existing employee compensation history.
2. Treat existing `baseAmount` records as a migration input that must be explicitly classified as
   gross or base before activation.
3. Do not silently transform historical payroll runs.
4. Create a migration report for employees whose existing value cannot be classified safely.
5. Seed a detailed salary structure only after gross salary is confirmed.
6. Preserve old payroll component codes and map them to the new basis where unambiguous.
7. Deactivate obsolete components instead of deleting referenced rows.
8. Keep old federation routes working while additive detail/settings/advance/payment routes roll out.

## 13. Verification strategy

### Calculation tests

Cover at minimum:

- Gross ₹10,000, ₹15,000, ₹20,000, ₹30,000, and ₹50,000.
- Base minimum and gross cap.
- HRA percentage changes and gross cap.
- Negative balancing allowance rejection.
- 30-day proration for 0, 1, 27, 30, and 31 payable-day inputs.
- Paid versus unpaid leave.
- Approved attendance correction before and after freeze.
- Overtime basis and multiplier.
- PF/ESI eligibility, ceilings, and effective-dated rule changes.
- Karnataka PT slab and a second jurisdiction fixture to prove no state hardcoding.
- Half-up rounding and zero-value deductions.
- Advance approval cutoff, partial recovery, duplicate recovery prevention, and locked-run safety.
- Individual payment timestamps and reversals.

### Contract and integration tests

- Native Smarteam API for every new command.
- Federation API with tenant, branch, scope, idempotency, and external employee ownership.
- BlizBooks adapter/BFF request/response mapping.
- Webhook/replay projections for payroll, advances, and payments.
- Permission matrix for every route and role.
- Migration compatibility and locked payroll immutability.

### UI acceptance

- Configure a component in BlizBooks and verify it is stored in Smarteam.
- Configure an employee gross salary and verify effective-dated SmartTeams data.
- Preview a payroll run and reconcile every component manually.
- Approve an advance, calculate payroll, and verify one recovery only.
- Mark two employees paid on different dates and verify separate timestamps.
- Verify employee self-service is employee-scoped.
- Verify disabled payroll capability fails closed without falling back to native BlizBooks payroll.
- Verify mobile/tablet/desktop layouts and all empty/error/loading states.

## 14. Delivery order

1. Add this specification and freeze the calculation vocabulary.
2. Add SmartTeams policy, rule, advance, payment, and snapshot schema.
3. Implement pure calculation functions and exhaustive fixtures.
4. Implement native SmartTeams services/controllers and permissions.
5. Add migration and compatibility checks.
6. Extend federation capabilities, scopes, controllers, adapter, and projections.
7. Extend BlizBooks BFF DTOs/controllers and permissions.
8. Update BlizBooks settings, employee payroll, payroll run, advance, payment, and self-service UI.
9. Run repository typechecks, focused tests, migration validation, contract tests, and browser
   acceptance.
10. Perform a fresh-context code review of the complete diff before release.

## 15. External rule references

- EPFO contribution and wage rule references: [EPFO FAQ](https://www.epfindia.gov.in/site_en/FAQ.php)
  and [EPFO contribution rates](https://www.epfindia.gov.in/site_docs/PDFs/MiscPDFs/ContributionRate.pdf).
- ESIC contribution and coverage reference: [ESIC citizen charter](https://roap.esic.gov.in/attachments/citizens_charter/485c7209dc413fcd841d4f59191e05a4.pdf).
- Karnataka PT reference used for the initial jurisdiction fixture: [Karnataka PT notification](https://gst.kar.nic.in/Documents/General/ptnotificationact29323.pdf).

These references support initial rule fixtures only. Statutory rules must remain versioned, effective-
dated, jurisdiction-specific, and reviewable before production payroll is enabled.
