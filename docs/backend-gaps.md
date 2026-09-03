# Backend gaps blocking frontend features

Frontend capability that exists in the design but has **no backend to wire to**. Nothing here is
faked in the UI: every item renders an explicit unavailable state instead of a placeholder value.

Kept current as each module is reconciled. Modules not yet reconciled are listed at the bottom.

Federation is intentionally out of scope for this EMS reconciliation and is not treated as a
dependency or an acceptance criterion anywhere in this document.

## Index — frontend features that need backend work

Everything below is a frontend capability that cannot be finished with the API as it stands. Sorted
by what it costs the product, not by effort.

| # | Frontend feature | What is missing on the backend | Where |
| --- | --- | --- | --- |
| 1 | Attendance calendar showing approved leave days | Approved leave produces no attendance day status; the two facts never meet | [Approved leave does not reach Attendance](#approved-leave-does-not-reach-attendance) |
| 2 | Payroll register for a calculated, unreleased run | No native line-item route; `ledger` is federation-only and released-only | [Payroll](#gaps) |
| 3 | Payslip showing payable / loss-of-pay days | The breakdown is persisted but not projected by `listPayslips` | [Payroll](#gaps) |
| 4 | Manager and HR approval routing by person | A user account cannot be linked to an employee record | [A user account cannot be linked to an employee record](#a-user-account-cannot-be-linked-to-an-employee-record) |
| 5 | Timesheet view that accounts for leave | Timesheets contain no reference to leave in either direction | [Approved leave does not reach Timesheets](#approved-leave-does-not-reach-timesheets) |
| 6 | Holiday-aware pay for a month | Working days are counted, recorded, and then not used in proration | [Payroll](#gaps) |
| 7 | Absence-driven deductions | Nothing ever creates an `ABSENT` attendance record | [Absence is never recorded](#absence-is-never-recorded) |
| 8 | Reporting line (manager, direct reports) | No manager relationship exposed | [Employees](#reporting-line-manager-and-direct-reports) |
| 9 | Punch notes, shift on an attendance row, work locations, holidays on the calendar | Fields absent from the attendance model or DTOs | [Attendance](#attendance) |
| 10 | Archived team listing, member job titles, allocation edits | Missing filters and mutations | [Teams](#teams), [Projects](#projects) |
| 11 | Avatar image, PAN / tax regime / TDS rate on a profile | Fields absent from the employee model | [Employees](#employees) |

Two rules the frontend follows throughout, and must keep following:

- **Never compute money in the UI.** Salary structure, statutory deductions, proration and net pay
  are backend results; the UI renders them.
- **Never treat a UI switch as an authorization or statutory decision.** PF/ESI/PT applicability
  and read permissions are backend state.

---

## Employees

### Reporting line (manager and direct reports)

- **Wanted:** the employee drawer and profile show "reports to X" and list direct reports.
- **Backend today:** `EmployeeEmploymentRecord.managerEmployeeId` is stored, but no route returns
  the manager's own record, and there is no direct-reports endpoint at all.
- **Needed:** either expand the employment-record response with a resolved manager summary, or add
  `GET /v1/organizations/:orgId/employees/:id/reports`. `toEmployeeDto` must not change — it is
  part of the federation response contract.
- **UI today:** "Reporting relationships are not available yet."

### Avatar image

- **Wanted:** profile photo on the drawer, profile panel and rosters.
- **Backend today:** no avatar column on `Employee`, and no file route scoped to employee photos.
- **Needed:** a decision on storage first (the `files` module exists but is not wired to
  employees), then a field or a dedicated endpoint. Adding `avatarUrl` to `Employee` would widen
  the federation DTO, so a separate route is the safer shape.
- **UI today:** initials, and the upload dialog states that uploads are unavailable.

### PAN, tax regime and TDS rate

- **Wanted:** the drawer's "Tax & statutory identity" block.
- **Backend today:** none of the three is modelled anywhere in the schema. `EmployeeStatutoryProfile`
  covers scheme enrolments (EPF/ESI/PT) with registration numbers and rates, which *is* wired.
- **Needed:** schema fields on a statutory/tax profile, plus write endpoints. These are regulated
  identifiers, so they need encryption-at-rest and a read permission separate from
  `payroll.compliance.read`.
- **UI today:** the fields are absent. They previously showed the same hardcoded
  `AAAPM0192L` / "New Regime (Sec 115BAC)" / "10% Statutory" for every employee.

---

## Teams

### Archived teams cannot be listed

- **Wanted:** an "Archived" tab beside active teams.
- **Backend today:** `listTeams` filters `status: 'ACTIVE'`, so archived teams are unreachable
  through the API. Archiving itself works and is audited.
- **Needed:** a status filter on `GET /teams`, e.g. `?status=ARCHIVED` or `?includeArchived=true`.
- **UI today:** no Archived tab. An always-empty tab would read as "there are none" rather than
  "this view cannot show them".

### Member job titles in a roster

- **Wanted:** each roster row shows the person's job title.
- **Backend today:** job title lives on `EmployeeEmploymentRecord`, fetched one employee at a time.
  A roster would need N requests.
- **Needed:** either a bulk employment-record endpoint, or a resolved job title on the employee
  list response.
- **UI today:** rosters show name and employee number only. The employee drawer shows the title.

---

## Projects

### Allocation cannot be changed after assignment

- **Wanted:** edit a member's allocation percentage or project role in place.
- **Backend today:** `ProjectMember` has add and end-date routes but no update route.
- **Needed:** `PATCH /projects/:projectId/members/:memberId`. Ending and re-adding is not a
  substitute — it rewrites the allocation history.
- **UI today:** allocation is captured at assignment and shown read-only, with a note saying so.

---

## Attendance

### Punch notes

- **Wanted:** a note captured with a check-in or check-out ("left early for a client call").
- **Backend today:** `PunchDto` has no note field, and `AttendancePunch` has no column for one.
- **Needed:** a nullable note on the punch, plus a length limit and audit treatment.
- **UI today:** the note input has been removed from the action bar. It previously accepted text
  and discarded it on submit.

### Shift assignment on an attendance row

- **Wanted:** each row shows the shift the day was worked against.
- **Backend today:** the shifts module exists but is not reconciled, and the attendance record
  does not carry a resolved shift.
- **UI today:** "Not recorded". It previously read `General Shift [ 10:00 AM - 6:00 PM ]` for
  every employee on every day, regardless of their real schedule.

### Holidays on the attendance calendar

- **Wanted:** holidays marked on the calendar and named on the timeline.
- **Backend today:** holidays live in the organization module, which is not reconciled.
- **UI today:** no holiday marking. The calendar also no longer fills any past weekday that has
  no record with a fabricated `08:00 Hrs · Present`.

### Work locations in the attendance policy

- **Wanted:** edit the geofence work locations.
- **Backend today:** `AttendancePreferencesDto` accepts `workLocations`, and the service stores
  them per branch, but `getPreferences` does not return them, so the editor cannot show what is
  currently configured.
- **Needed:** include work locations in the preferences response.
- **UI today:** the policy panel states that work locations are not editable there yet.

### A user account cannot be linked to an employee record *(fixed)*

`Employee.userId` is a unique column and the whole product depends on it: self-scoped reads
resolve "my employee" through it, and manager approval routing follows the requester's
`managerEmployeeId` to the manager's login. **Only the federated sync path ever populated it**, so
a natively created employee had no account attached — an employee saw no payroll of their own, and
a `MANAGER` approval step could never resolve.

Fixed with `POST /employees/:employeeId/user`, which requires `employees.write` and refuses any
user who is not an active member of the organization. The link is not overwritten in either
direction: a user already attached to another employee, or an employee already attached to another
user, is a conflict rather than a silent takeover — re-linking would move someone's leave,
payslips and approval authority to a different person. Re-linking the same pair is a no-op.

Verified live: an outside user is refused, a member links successfully, the same user cannot take a
second employee, and another tenant cannot link into this organization.

---

## Leave

### Approved leave does not reach Attendance

- **Wanted:** an approved leave day shows as leave on the attendance calendar and timeline, and is
  excluded from absence.
- **Backend today:** nothing writes an attendance record for a leave day. The only connection is
  a guard in `AttendanceService.punch` that *refuses* leave day statuses with "Absence and leave
  statuses must be recorded by their workflows" — but no leave workflow records them either. The
  relationship is intended and unimplemented.
- **Verified:** `pnpm verify:leave` approves a three-day request and then queries attendance for
  those dates; the API returns zero records.
- **Needed:** on final approval, `LeaveService.decide` should write attendance records with
  `dayStatus: ON_LEAVE` for the covered working days (and reverse them on cancellation).
- **UI today:** the calendar leaves those days blank. It does not label them as leave, and — since
  nothing marks a day ABSENT either — it does not mislabel them as absence.

### Approved leave does not reach Timesheets

- **Wanted:** leave reduces expected hours, or appears as a non-working entry.
- **Backend today:** the timesheet module contains no reference to leave at all, in either
  direction.
- **Verified:** the same script queries timesheets after approval and finds none.
- **Needed:** a decision on whether leave should pre-populate timesheet entries or only adjust
  expected hours, then the derivation to match.

### Absence is never recorded

`summarizeAttendance` counts `dayStatus === 'ABSENT'` toward unpaid days in payroll, but nothing
in the codebase ever creates an ABSENT attendance record. That deduction can therefore never
fire. Unpaid *leave* does reduce pay, through the leave path; unexplained absence does not.

---

## Backend bugs found and fixed

### Leave and Attendance did not self-scope reads *(fixed)*

This was a **bug against an established convention**, not a missing design.

The codebase has a clear pattern: `X.read` lets a caller read their *own* records, `X.read.all`
(or the tenant wildcard `*`) is required to read everyone's, and a federation context keeps the
read breadth its grant already carries. It was applied in **four** modules — `timesheets`,
`compliance`, `payroll`, `payroll-policy` — and missing in `LeaveService.listRequests`,
`LeaveService.listBalances` and `AttendanceService.list`, which took an `employeeId` filter and
scoped only by organization and branch. An employee holding `leave.requests.read` could therefore
enumerate any colleague's leave — reasons included — by changing one query parameter, and the
same held for balances and attendance.

**Fixed** by applying the existing pattern to those three methods, with `leave.requests.read.all`,
`leave.balances.read.all` and `attendance.read.all` as the broader grants:

```ts
if (!this.canReadAllEmployees(context, 'leave.requests.read.all')) {
  const self = await this.selfEmployee(tx, context);
  if (!self) return { requests: [], nextCursor: undefined };
  if (employeeId && employeeId !== self.id)
    throw new ConflictError('Employees may only read their own leave requests');
  employeeId = self.id;
}
```

The rules now enforced, in the API rather than the frontend:

| Caller | Requested employee | Result |
| --- | --- | --- |
| `leave.requests.read` / `leave.balances.read` / `attendance.read` | own id | allowed |
| same | another employee | `ConflictError`, no query issued |
| same | none | narrowed to the caller's own employee record |
| `…read.all` | any employee in the tenant | allowed |
| `*` | any employee in the tenant | allowed, unchanged |
| federation grant | as the grant allows | unchanged, so no partner code changes |

Covered by `leave-self-scoping.spec.ts` and `attendance-self-scoping.spec.ts` (the full matrix
above plus tenant scoping), and verified live: a normal employee session is refused Employee B's
leave requests, balances and attendance, still reads its own, an admin still reads any employee,
and cross-tenant reads stay refused.

Note for role design: a role that holds only `leave.requests.read` / `attendance.read` now sees
one employee's data. Manager and HR roles that are meant to see a team need the matching
`.read.all` permission — this is role configuration, not a code change.

### Cancelling an approved leave destroyed the days *(fixed)*

`LeaveService.cancel` decremented `usedAmount` without restoring `availableAmount`, leaving
entitlement that was neither used, reserved, nor available. Fixed in this pass, with a unit spec
and a live assertion.

---

## Security findings

### A new tenant has only a wildcard role

`OrganizationsService.onboard` creates exactly one role, `ORG_ADMIN`, holding the `*` permission,
and assigns it to the first user. There is no default employee role, so there is no
least-privilege starting point: every additional user either gets full administrative access or a
role someone has to define from scratch. The practical outcome is that most tenants will run with
over-broad grants — and a `*` role bypasses the self-scoping fixed above, so this stays open.

**Needed:** seed a least-privilege `EMPLOYEE` role at onboarding. The self-scoped permissions that
make such a role meaningful now exist; whether onboarding should seed one is an onboarding
requirement, so it is deliberately left unfixed here and re-inspected during the Payroll audit —
Payroll must not depend on a safe role existing, since backend permissions remain authoritative.

### Dependency advisory

`pnpm audit` reports one high advisory: `mysql2 <3.22.0` (auth-plugin downgrade leaking plaintext
credentials), reached transitively through the `prisma` CLI package. The runtime uses
`@prisma/adapter-pg` against Postgres and never loads the MySQL driver, so it is not reachable in
production — but it does ship in the dependency tree and should be resolved by upgrading the
Prisma CLI when a patched release is available.

### Verified clean

- Every native controller is guarded; all six routes added during reconciliation pin
  session-organization to path-organization via `DomainContextFactory.native` and call
  `requirePermission` in the service.
- Both approval-inbox routes use the **session** user id, not a client-supplied one, so a caller
  cannot request another person's queue.
- Row-level security still sets `app.organization_id` through parameterised tagged-template
  `$executeRaw`; no string interpolation, no `queryRawUnsafe` outside generated Prisma code.
- No credentials, tokens or keys in source.
- No swallowed errors in reconciled repositories or hooks.
- `localStorage` in reconciled code is limited to the theme preference, which is per-viewer UI
  state rather than server data.

---

## Cross-cutting

### Team assignment drives navigation but has no server-side notion of it

`isAssignedToAnyTeam` gates the Team space and several modules. It is now derived from
`GET /teams` on the client. That is correct data, but the *authorization decision* is made in the
browser. If team membership is meant to be a real access boundary rather than a navigation
convenience, it belongs in the server's permission resolution.

---

## Payroll

Traced end to end before any screen was wired, because payroll is where every other module's
truth has to arrive as money. The lifecycle below is exercised by `pnpm verify:payroll`, which
drives one employee through salary profile → approved leave → attendance → approved timesheet →
adjustment → run → calculate → approve → release → payslip → refetch (49 live assertions).

### What is genuinely connected

Each row was confirmed in `PayrollService.calculate` / `calculateLine` and asserted live — not
inferred from a matching field name.

| Dependency | Connected? | How |
| --- | --- | --- |
| Approved paid leave | Yes | `summarizeLeave` splits paid from unpaid; paid days do **not** reduce pay |
| Approved unpaid leave | Yes | reduces payable days, which prorates base, HRA and other allowance |
| Attendance | Yes | `ABSENT` counts as one unpaid day, `HALF_DAY` as half, both reducing payable days |
| Timesheets | Yes | a run refuses to calculate while any timesheet overlapping the period is unapproved |
| Overtime | Yes | approved overtime minutes × (gross ÷ (standard day minutes × day basis)) × the employee's multiplier |
| PF / ESI / PT | Yes | `calculateStatutoryDeduction` from `PayrollStatutoryRule` rows; eligibility is tested against the **monthly** structure so a part month cannot flip coverage |
| Salary components | Yes | the employee's assigned `EmployeePayComponent` rows, with earnings capped at the available other allowance |
| Adjustments | Yes | included before calculation, and a later one invalidates the calculation until it is redone |
| Salary advances | Yes | recovered from net pay, capped at what remains, and reversed on recalculation |
| Payslip | Yes | created from the persisted `PayrollLineItem`; totals and components are read back from it, never recomputed client-side |

Two consequences worth stating plainly: the salary structure (base / HRA / other allowance) is
derived by the backend from the org policy, and the statutory amounts are backend calculations.
**The frontend must render these, never compute them.** The PF/ESI/PT switches on an employee are
persisted backend state (`EmployeePayrollPolicy`) that the calculation reads — they are not
frontend toggles, and they must not become one.

### Gaps

#### Payroll day basis: a fixed monthly divisor, deliberately

Traced and settled rather than changed. `payrollDayBasis` (default 30) is a fixed monthly divisor,
the standard Indian convention: proration is `payableDays / dayBasis`, where

```
payableDays = dayBasis − unpaidLeaveDays − unpaidAttendanceDays − daysOutsideEmployment
```

Weekends and holidays are priced *into* the basis rather than counted, so a month with more
holidays pays the same as one with fewer. **That is correct for this convention, not a defect**,
and the Shifts and Holidays screens now say so instead of implying holiday-aware pay.

`countWorkingDays` still runs and records `periodWorkingDays` in the calculation snapshot. It is
informational — useful in an audit, unused in the arithmetic. Switching to working-day proration
would be a different payroll convention and a product decision, not a bug fix.

#### A mid-period joiner was paid for the whole month *(fixed)*

Found by probing the convention above: `payableDays` subtracted unpaid leave and unpaid attendance
but nothing about employment dates, and `dateOfJoining` never reached the calculation at all. An
employee who joined on the sixteenth of a month was paid the full month.

Fixed by counting days outside employment as unpaid days — applying the existing convention rather
than introducing a second one. `unemployedDays` handles joiners, leavers, both in one period, and
employment entirely outside the period, with ten unit tests on the day counts.

Proven live: the same employee who was paid ₹60,000 for a month they joined halfway through is now
paid ₹30,000, and `verify:payroll` pins it.

#### Preview and the authoritative run now use the same day accounting

Preview deliberately measures only as far as today — it is a to-date estimate, and that difference
is its purpose. Its *day arithmetic* had drifted though: it did not count employment dates either,
so it offered a mid-month joiner 30 payable days while the run gave 15. Both now call the same
`unemployedDays`, so the only remaining difference is the window measured.

Preview still omits pay components, overtime and adjustments, and accepts a client-supplied
`payableDays` for what-if modelling. It must stay labelled an estimate.

#### An adjustment added after calculation could never reach the money *(fixed)*

`addAdjustment` accepted writes while a run was `DRAFT` **or** `CALCULATED`, but `calculate`
refused anything that was not `DRAFT` and `validTransition` had no path back. A bonus or deduction
entered after calculation was persisted, was visible, and silently never entered a payslip.

**Fixed** by making the calculation invalidate rather than the write fail, so the federated write
contract is unchanged: an adjustment on a calculated run now stamps
`PayrollRun.calculationStaleAt`, a stale run can be calculated again, and a stale run cannot be
approved or released until it is. Verified live end to end: a 500 bonus added after calculation is
accepted, approval is refused, recalculation succeeds, and the released payslip's gross includes
it. Covered by `payroll-adjustment-lifecycle.spec.ts`.

#### No native route exposes a calculated run's line items

`PayrollService.ledger` returns per-employee line items with components, but it is reachable only
through `GET /federation/payroll/ledger` — there is no native equivalent, and it filters to
`RELEASED`/`LOCKED` runs. Between calculation and release, a native payroll register screen has
no endpoint that can show what the run produced per employee; `GET /payroll/runs` returns run
rows only.

**Needed:** a native `GET /payroll/ledger` (self-scoped like the rest), and a decision on whether
a calculated-but-unreleased run should be readable — an approver has to see the numbers before
approving them.

#### The payslip omits its own basis

`listPayslips` returns totals and components but not `calculationBreakdown`, so a payslip cannot
show payable days, loss-of-pay days, or the leave and attendance days behind them — the very
fields an employee queries. The data is persisted; it is just not projected.

#### Statutory opt-outs are unvalidated

`pfEnabled` / `esiEnabled` / `ptEnabled` are free booleans on the employee policy. Enabling a
scheme for someone above its threshold is safe (the calculation refuses it on eligibility), but
**disabling** one for a covered employee silently skips a legally due deduction, with no
validation and no warning. Statutory applicability is a backend concern; the API should not let a
UI switch it off for a covered employee without at least recording why.

#### Preview and the run do not agree

`payroll/preview` prices only base, HRA, other allowance, statutory and advances — no pay
components, no overtime, no adjustments — and it applies statutory rules only when a jurisdiction
is configured, whereas `calculate` applies **all** jurisdictions' rules when none is set. Preview
is a what-if (it even accepts a client-supplied `payableDays`), so it must be labelled as an
estimate in the UI and never presented as the payslip.

### Frontend

Wired to the API: the employee's salary structure, payslips and advances; the organisation's
payroll runs and their whole lifecycle (create, calculate, recalculate, approve, release, lock);
per-employee pay from released payslips; and the payroll policy with its statutory rules.

Removed with them: `payroll.json`, `payroll-runs.json` and `statutory-rules.json`, the
`localStorage` copies of runs and statutory config, and the line-item editor that let a calculated
payslip be edited in the browser. No screen computes money any more — the salary structure,
statutory deductions, proration and net pay are all read from responses.

Compensation is wired too: the pay-component catalogue (`GET/POST /payroll/components`),
effective-dated component assignments (`POST /payroll/components/assignments`) and the employee's
gross salary (`POST /payroll/profile`). **Payroll has no runtime fixture or `localStorage`
dependency left.**

The 2,240-line structure builder was removed rather than wired, because what it modelled does not
exist: named salary structures targeted at roles and departments, each with its own EPF/ESI/PT/TDS
and gratuity switches, plus a CTC simulator. The backend models compensation as an organisation
payroll policy, one effective-dated gross salary per employee, and effective-dated component
assignments — which is what the replacement screen offers. Recorded as unavailable rather than
rebuilt: salary-structure templates and targeting, consolidated pay mode, per-structure statutory
switches, gratuity, TDS and annual CTC.

#### Recalculation could not delete a line item that had components *(fixed)*

Found by the compensation work: `PayrollLineItemComponent` holds its line item under
`onDelete: Restrict`, so `calculate` failed with a 500 when re-running for any employee with an
assigned pay component. Unreachable before recalculation existed; reachable the moment it did.
Fixed by clearing the component rows first, with a spec asserting the deletion order.

### Authorization

Payroll already follows the self-scoping convention: `listPayslips`, `ledger`, `listAdvances`,
`listPayments`, `getSalaryProfile` and `preview` all resolve the caller's employee and require
`…read.all` (or `*`) to read anyone else. Locked down by `payroll-self-scoping.spec.ts`.

One latent hole: `listEmployeeComponents` takes an `employeeId` and checks only
`payroll.components.read`, with no self-scoping. It is federation-only today, so nothing native
reaches it — but **a native route for it must not be added without self-scoping first**, or it
becomes a salary-structure leak of exactly the kind fixed in Leave and Attendance.

---

## Approvals

Two surfaces, both now on the API.

**Routing policies** — `GET/POST/PATCH /approval-policies` and `/:id/deactivate` are real, and
leave, attendance corrections, timesheets and payroll all route by them. The builder wrote them to
`localStorage` instead, so an administrator configured rules the server never saw.

**The queue** — there is no unified approvals API. Each module owns its inbox and its decision
route, and the server decides whether the caller may approve. The screen composes the two inboxes
that exist (`/leave/requests/inbox`, `/attendance/corrections/inbox`) rather than inventing a
third surface, and says plainly that timesheet and payroll approvals are absent because neither
exposes an inbox route.

`MANAGER` steps **are** offered. An earlier pass omitted them on the assumption that user-to-
employee linkage was missing; that was wrong. `Employee.userId` is a unique column, and
`assertResolvableApprovers` already follows the requester's `managerEmployeeId` to the manager's
active user account and refuses self-approval. The omission is corrected.

`USER` steps remain unoffered: they name a specific approver account and need a user picker this
module does not have.

### Gaps

| Missing | Effect |
| --- | --- |
| Timesheet approval inbox | a timesheet approver has no queue; approval happens from the timesheet itself |
| Payroll approval inbox | same for payroll runs |
| Approval history | no route returns decided items, so the queue shows pending work only |

---

## Shifts

The inverse of every other module: a **complete backend that no screen ever called**. List,
create, update, retire and effective-dated employee assignment all existed, with branch scoping
and overlap rejection enforced server-side. The only artefact in the frontend was `shifts.json`,
which seeded a `localStorage` key nothing read — so the capability was invisible in the product
rather than faked.

Now a real screen (`ScreenShifts`, in the admin workspace next to Payroll), wired through
`shifts.repository.ts` and `use-shifts.ts`. Nothing was added to the backend for it.

One thing the screen states rather than implies: **a shift does not affect pay.** Attendance
measures punches against an employee's assigned shift, but payroll prorates against the flat
`payrollDayBasis`, so shift hours never reach a payslip. That is the same proration gap recorded
under Payroll, seen from the other end.

### Gaps

| Missing | Effect |
| --- | --- |
| No route lists an employee's shift assignments | the screen can create one but cannot show the roster back |
| Break rules are accepted but not exposed for editing | `breakRules` round-trips; only the aggregate `breakMinutes` is editable |
| Shift hours do not reach payroll | working-time configuration has no financial effect |

---

## Organization

Two capabilities are modelled, and two now work.

**Profile** — `GET /v1/organizations/:id` and `PATCH` the same path, which accepts exactly `name`,
`timezone` and `currencyCode`. Slug, status, source and locale are real backend values the tenant
does not own, so they are shown read-only. The workspace this replaced held the profile in
`localStorage`: renaming the organization changed nothing on the server and every other user saw
the old name.

**Branches** — list, create, update and retire, all real, all tenant-scoped. Previously also
`localStorage`, so a branch created by one administrator did not exist for anyone else — including
for the employee scoping, attendance and shift assignment that genuinely depend on it.

### Backend capability gaps, now stated as such

Nine tab components (2,088 lines) were removed rather than wired. The workspace lists each gap
instead of hiding it. Note the distinction: announcements and milestones have no entity at all,
whereas a manager *is* persisted and merely cannot be read back — different gaps, different fixes.

| Capability | Why it is not available |
| --- | --- |
| Departments | `department` is a free-text field on an employment record, not an entity; no route lists departments or their members |
| Reporting hierarchy | `managerEmployeeId` is **writable** through `PUT /employees/:id/manager` but is returned by **no read** — `toEmployeeDto` omits it, so an org chart cannot be built from authoritative data |
| Announcements | no entity |
| Milestones | no entity |
| Quick links | were per-browser state; navigation lives in the sidebar |
| Headcount and statistics | no endpoint aggregates employees by branch or department, and the figures are not computed in the UI to fill a card |

The manager asymmetry is the notable one: the write path exists and the read path does not, so the
data is being captured and never surfaced. Closing it means adding `managerEmployeeId` to a read —
but `toEmployeeDto` is part of the federation response contract and must not change, so it needs a
separate native route, as `employment-records` already does for `jobTitle` and `department`.

Verified live by `pnpm verify:organization` (24 assertions): profile and branch changes persist and
read back, another tenant cannot read or rename this organization by supplying its id, and the four
absent entities return 404 so a fixture cannot quietly return.

---

## Files

The backend supports exactly four operations — begin an upload, complete it, get a download URL,
soft-delete — and **no listing**. `FilesService` has no query method and the controller has no
route, so the document library the old screen showed could not have come from anywhere but its
fixture. Every "download" in it was a `#` link.

### Why no list route was added

The metadata is there and is indexed for it (`@@index([organizationId, purpose, createdAt])`), so
the data would support a listing. The **authorization** would not:

`FilesService.download` checks `files.read` and the organization, and nothing else. There is no
per-employee boundary. `FileObject` holds `PAYSLIP` and `LEAVE_ATTACHMENT` files, so any user with
`files.read` can already download any colleague's payslip **if they know its id**. Adding a list
would turn that from a guess into an enumeration.

So the list is a **P1 backend gap paired with a P1 security gap**, and the second has to be
settled first: files need the self-scoping convention that Leave, Attendance and Payroll already
follow. Adding the route without it would widen an existing hole.

### What the screen does now

Upload (the real three-step presigned flow), download, and delete with the reason the API audits.
Files uploaded **in the current session** are listed so they can be acted on — those records came
from the server moments earlier, and nothing is written to browser storage. The screen states
plainly that stored documents cannot be browsed, and why.

### Gaps

| Missing | Severity | Effect |
| --- | --- | --- |
| ~~`download` has no per-employee authorization~~ | **fixed** | now self-scoped: `files.read` reaches your own files, `files.read.all` reaches everyone's; unowned files need the broader permission |
| No list route or service method | P1 | files are unreachable after the session that uploaded them |
| No employee/purpose filter | P2 | follows from the above |

Verified by `pnpm verify:files`: 9 assertions pass (size, content-type, leave-attachment-owner and
unknown-purpose rules; the three absent list routes). **5 operations are skipped, not passed** —
this environment has no object storage or S3 credentials, so the API cannot presign an upload and
no file id can be obtained. The script says so rather than reporting green.

---

## Holidays

The one module where a backend addition was the right answer, because the domain already existed:
a `Holiday` model with `@@unique([organizationId, branchId, holidayDate])`, and **two live
consumers**. No route let a tenant enter a row, so `holidays.json` stood in for a calendar that
could not affect anything.

### Added

A small native module — `HolidaysService`, `HolidaysController`, DTOs — with four operations:
`GET /holidays` (bounded by `from`/`to`), `POST`, `PATCH /:id`, `POST /:id/deactivate`.
**No schema change and no migration**: the model, its constraints and its indexes were already
right.

Permissions reuse the organization boundary rather than inventing a parallel one — a holiday is
organization (and optionally branch) configuration, so reading needs `organizations.read` and
changing needs `organizations.update`. There is no `holidays.*` permission, and adding one would
have meant a seed and a migration for no gain.

### Deliberate limits

- **The date cannot be edited.** It is part of the uniqueness key and it decides what past leave
  was charged, so moving a holiday would silently rewrite history. Retire it and add another.
- **Retire, never delete.** The row stays as the record of why a request was charged as it was.
- No categories, regions, or carry-forward: the model has no such fields.

### What a holiday actually does — the two consumers differ

| Consumer | Effect |
| --- | --- |
| **Leave** | `LeaveService.workingDays` excludes an active holiday (branch-specific or organization-wide) from the days a request is charged. **Real and financially meaningful.** |
| **Payroll** | `countWorkingDays` counts holidays into `periodWorkingDays`, which is recorded in the calculation snapshot and **never used** — proration is against the flat `payrollDayBasis`. |

So adding a holiday changes leave immediately and changes pay only indirectly, through unpaid
leave. The screen says exactly this rather than implying holiday-aware pay. The proration gap is
unchanged and still P1.

### Lifecycle semantics, established rather than assumed

Changing the calendar affects **future calculations only**. A leave request already created keeps
its recorded `requestedDays`, and a payroll run already calculated is not recomputed. There is no
invalidation mechanism tying holidays to persisted results — unlike the payroll adjustment path,
which marks a run stale. That asymmetry is now documented behaviour, not an oversight to trip over.

Verified live by `pnpm verify:holidays` (22 assertions), including the cross-module chain: a leave
request spanning a holiday is charged 4 days instead of 5; after the holiday is retired the same
request still shows 4, while a later request is charged the full 5.

---

## Onboarding

The last runtime fixture, and almost entirely a capability gap.

**Real and untouched:** creating an employee (`POST /employees`), and creating a tenant with its
first administrator (`POST /organizations/onboard`, which lives in the platform console).

**Not modelled at all:** candidates, offer stages, document verification, asset allocation and
onboarding checklists. Four entities would have had to be invented to keep the old pipeline
populated, so the screen states the gap instead. The wizard that created candidates wrote to
`localStorage`; a candidate advanced for the person who moved them and for nobody else.

A "recently joined" list was the obvious honest substitute and is deliberately absent:
**`dateOfJoining` is accepted on create but returned by no read.** Same read/write asymmetry as
`managerEmployeeId`, same cause — `toEmployeeDto` is part of the federation response contract and
was not widened. Both need a native employee-detail route, not a DTO change.

---

## The native employee read model *(added)*

Three fields were persisted and unreadable, because `toEmployeeDto` is the federation response
contract and could not be widened: `dateOfJoining` (accepted on create), `managerEmployeeId` (set
by the manager route), and `jobTitle`/`department` (on the employment record).

`GET /employees/:employeeId/detail` projects them into a native shape instead, alongside a manager
summary, direct reports derived from the `managerEmployeeId` self-relation, and whether a login is
attached. The shared DTO is unchanged — verified by an assertion that it still omits both fields.

Design notes worth keeping:

- **Direct reports are derived, never stored.** One source of truth for the reporting line, no
  second hierarchy to drift.
- **`hasUserAccount` is a boolean.** The screen needs to know whether a login exists; it does not
  need the user id, so the id is not exposed.
- **Self-scoped**: `employees.read` reaches your own record, `employees.read.all` or `*` reaches
  anyone's — the same boundary as Leave, Attendance, Payroll and Files.

---


## Modules not yet reconciled

These still read fixtures and have not been audited against the backend. They are not gaps —
they are simply not done yet.

| Module | Fixture still in the runtime |
| --- | --- |
| Timesheets | `timesheets.json` |
| Persona display | `mock-users.json` — cosmetic only; identity, roles and permissions come from `/me` |

---

## Closed on 3 September 2026

Recorded here rather than by editing the entries above, so the original finding and what actually
happened both stay readable.

### Employee reads are self-scoped (security)

`EmployeesService.list()` and `.get()` treated `employees.read` as "read everyone", while Leave,
Attendance, Payroll and Files all treated the same key as "read your own". Seeding the
least-privilege `EMPLOYEE` role — which holds `employees.read` — made that difference reachable:
an ordinary employee could call `GET /organizations/:id/employees` and receive every employee in
the tenant, `personalEmail` and `phone` included.

The boundary now lives in one place, `employee-access.ts`, and guards five reads: the directory,
a single record, the detail projection, employment history and emergency contacts.
`employees.read.all` is the new key for organization-wide access; a migration grants it to every
role that already holds `employees.write`, so existing HR roles keep the directory they had.
Federation breadth is untouched — a partner context has no own record to narrow to.

Verified live: `pnpm verify:employee-directory`, 26 assertions.

### Organization membership (capability gap, was blocking)

A tenant could onboard its bootstrap administrator and then had no way to add a second person.
`user_invitations` rows could be accepted but nothing created one, and `RbacAdminService.assign`
refuses a user who is not already an active member. `POST /organizations/:id/members` closes it:
it creates or attaches a user, makes them an active member and assigns roles, returning a
temporary password once for an identity it created. An email already known to Smarteam is
attached rather than duplicated, and an existing user's password is never reset.

### `dateOfJoining` and `managerEmployeeId` are readable

Both are returned by `GET /employees/:employeeId/detail`, along with job title, department, the
manager summary, derived direct reports and whether a login is attached. `toEmployeeDto` was not
widened — the federation contract is unchanged.

One thing this does **not** close: the employee *list* still carries neither, so ordering a
"recent joiners" view by joining date would take one request per employee. The onboarding screen
shows the roll unordered rather than shipping that N+1.

### Employee onboarding (product regression, self-inflicted)

The Onboarding screen had been reduced to a "Supported today / Backend capability gaps" page on
the reasoning that no candidate, checklist, document-verification or asset model exists. That
inference was wrong: those are separate capabilities, and employee onboarding itself was fully
supported. The screen is an operational workflow again — employee, employment record, manager,
login, role, link — with the four genuine gaps demoted to a secondary section.

Because the API has no transaction spanning those five calls, the outcome panel states which
steps succeeded and which one failed, rather than reporting a partial result as either.

Verified live: `pnpm verify:onboarding`, 33 assertions.
