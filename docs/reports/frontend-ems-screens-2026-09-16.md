# What landed on GitLab in this push

**Smarteam · `feat/frontend-ems-screens`**

Every addition and alteration in the 30 commits pushed to `feat/frontend-ems-screens` on GitLab,
grouped by the feature it belongs to rather than by commit, with the commits that carry each one.
Nothing was merged: `main` and `dev` are untouched, and the same commit sits on GitHub with CI
green on all seven jobs.

```
feat/frontend-ems-screens: 4c5b980 → dfebb80 · fast-forward, 30 commits
```

| | |
| --- | --- |
| Commits pushed | 30 |
| Files touched | 274 |
| Lines added | +21,498 |
| Lines removed | −3,764 |
| Lines in federation | 0 |

> **Federation is untouched.** `git diff 4c5b980..dfebb80 -- apps/api/src/modules/federation` is
> empty across all 30 commits. Every new route below is native-only, so partner clients need no
> change.

---

## Attendance — 5 commits

### A missed check-out can be repaired
`d0895e1` `f34e451`

**Before:** a day that ended on a check-in counted zero worked time forever. The correction
workflow only moved punches that already existed, so asking for a check-out was refused, and an
approved reason-only correction changed nothing.

- The employee asks for the check-out they forgot, with the real time and a reason. It goes through
  the same approval policy as any other correction.
- Only the final approval writes the OUT punch, after locking the record and re-running every
  check, so nothing can add a second check-out. Worked minutes come from the existing totals, and
  payroll over that date is marked stale through the existing helper.
- Refused for: a colleague's day, another tenant's record, a check-out before the check-in, a
  future time, more than 24 hours after the check-in, a time after the employee's next punch, or
  while one is already awaiting a decision.
- Nothing closes a day automatically, and no check-out time is ever invented.
- The week arrows on the attendance screens work, and a day with no check-out reads "No check-out"
  instead of 00:00.

### Checking in on an approved optional holiday
`22b02d4`

**Before:** the day was silently both a granted holiday and a worked day, and nothing recorded
which it was.

- The check-in is always allowed — never rejected, never silently cancelled. The day is marked as
  needing resolution, and the employee gives a reason plus an optional comment.
- A manager or admin decides: **keep the holiday**, so the check-in stays as history but counts no
  worked time; or **convert to a working day**, which cancels the holiday selection through the
  existing cancellation, with its existing audit entry and event, and lets attendance stand.
- Either way, payroll over that date is marked stale. No automatic payroll decision is made.
- Self-resolution without permission, forged and cross-tenant ids, duplicate resolutions and two
  managers deciding at once are all refused. The state is explicit, not a boolean flag.
- New table `attendance_holiday_reviews`, with row-level security, one pending review per day, and
  a constraint keeping a decided review consistent.

### A day nobody checked out of is closed for review
`dfebb80`

**Before:** a forgotten check-out left the day at nothing, and nothing ever prompted anybody about
it — somebody had to notice.

- An organization switches it on and picks the closing time in its own timezone, 23:59 by default.
  A sweep then raises, for each open day whose own cutoff has passed, the ordinary
  missing-check-out correction at that time.
- **Closed means proposed, not decided.** No punch is written and no record changes: the day still
  counts no worked minutes and no overtime until a person settles it. Nothing reaches a timesheet
  or a payslip because a clock struck midnight.
- Who reviews it is the organization's existing attendance approval policy — their manager, a role,
  or named people, multi-step if wanted — so changing who receives these is done on the Approvals
  screen, not in code.
- The approver accepts the proposed time, **enters the real one**, or rejects the day. A
  replacement time is re-checked against the day's punches and recorded on the correction; only
  then is the check-out written and payroll marked stale.
- A shift that crosses midnight is never closed this way: at 23:59 it is still being worked.
- It looks back three days so an outage catches up, never raises a second request for a day, and
  one organization's missing policy cannot stop the others. An administrator can also run the close
  on demand.

---

## Shifts — 2 commits

### An assignment can be read, listed and ended
`5b6c571` `2416af6`

**Before:** shifts could be created and assigned, but no assignment could be read back. Home always
said "Not recorded", no screen listed who was on a shift, and moving someone between shifts was
impossible, because the old open-ended assignment could not be closed and the new one was refused
as an overlap.

- Home's Work Schedule shows the assigned shift and its hours, or states plainly that none is
  assigned — in neutral colours rather than the old red error styling. The Dashboard tile lost its
  invented "On Schedule" badge.
- Each shift now has a **People** dialog: who is on it, labelled Current, Upcoming or Ended against
  the tenant's own date, with a "Show ended" toggle and paging.
- **End assignment** asks for the employee's last day on the shift and a reason. The row is locked,
  a day before the start is refused, and the end only ever moves earlier — never later, which could
  overlap a later assignment.
- An overlap refusal in the Assign dialog now says how to fix it.
- Every end is audited as `SHIFT_ASSIGNMENT_ENDED` with its reason. Like retiring a shift, which
  already ends its open assignments, it publishes no federation event.

---

## Time off and holidays — 3 commits

### The status tabs visibly filter
`5b6c571` `3b23af4` `66fd8a8`

**Before:** the tabs did filter the request list, but it sat below four balance cards — so on a
phone, tapping "Pending" changed nothing in view.

- The filtered list sits directly under the tabs now, headed by the chosen status, with balances
  beneath it.
- "View all" on Home's Upcoming Holidays opens the holiday calendar; it previously had no handler
  at all.
- Cancelling a colleague's leave request is refused — an approved one reverses the balance ledger.
- Holiday selection and cancellation no longer reply from a second transaction opened before the
  first had committed, which could omit the change just made.
- `employee_holiday_policies` gained the row-level security it was created without.

---

## Timesheets and Log Time — 4 commits

### Hours are asked for, not assumed
`0ab4bae` `19c1ab3` `66fd8a8` `3b23af4`

**Before:** Log Time opened with 08:00 already entered, so saving without looking recorded a full
day whatever had been worked — and logged time feeds approval and pay.

- Hours start empty in both modes, and saving asks for them. A job type that did not exist is no
  longer filled in for you.
- Quick-adding a project from Log Time is visible and works. It now requires `projects.write`,
  closing a second, weaker path to creating organization-wide projects.
- A single day's logged time cannot exceed 24 hours; one 100,000-minute entry had been accepted.
- An approver can no longer approve their own timesheet. Opening or re-deriving a period needs
  `timesheets.read.all`, since it resets every sheet in the period and withdraws approvals.
- Submission requires a configured approval policy with resolvable approvers, so a decision can
  never skip approver checks.
- Managers hold `timesheets.decide` everywhere now: the seed granted a permission the catalogue
  does not define, so managers saw the approval screen and were refused by the API.

---

## Payroll — 2 commits

### Lists page, and nobody decides their own money
`66fd8a8` `1b8ee72`

- Salary advance and payment lists page on the native routes (`{ items, nextCursor }`, 500 at most),
  and the web reads them page by page. Federation calls pass no page and still receive the bare
  array.
- No self-decision on salary advances, and raising one for a colleague is a 403 rather than a
  confusing 409.
- The permission catalogue gained the seven payroll keys the API already enforced, guarded by a test
  that scans the enforcement points.
- `perf:payroll` also reports API CPU, peak memory, rows written, and the size of the audit and
  outbox documents.

---

## Giving an employee a login — 1 commit

### An access code, not a password the administrator knows
`968458f`

**Before:** the panel that issues access codes was written, but nothing rendered it — so the only
way to give someone a login was onboarding's temporary password, which the administrator reads.

- The employee record carries it now: whether they can sign in yet, and the one action that moves
  them forward. The code is shown once, expires in 48 hours and is stored only as a digest; issuing
  a new one withdraws the old.
- The employee enters it and chooses their own email and password, so no permanent credential is
  ever known to two people.
- Generate and Revoke need `employees.write`. Without it the state is visible and the actions are
  not, rather than offering buttons the API refuses.

---

## Home and the workspace on a phone — 5 commits

### Real data instead of placeholders
`1b8ee72` `e2220f7`

- Home's Approvals tab listed three invented people and "approved" them in local state. It now
  shares the real approval queue, and a decision is shown as done only once the API accepts it.
- The approval gates checked permissions no role holds, so managers never saw Approvals in the
  Employee workspace at all.
- The profile panel showed the same hard-coded PAN, UAN, tax regime and TDS rate for every
  employee, "Executive / Head of Department" for anyone with no manager on record, and a green "In"
  beside every colleague. All three are gone; statutory identity comes from the compliance API.
- Log Time's attachment control was decorative — nothing was uploaded, yet a storage URL was saved
  as if it were. Removed.

### It behaves like an app on a phone
`2bd40b6` `9e51139` `8495286` `e2220f7`

- All 27 tables become card lists when their own box is too narrow — a container query, not a
  viewport breakpoint — so nothing pans sideways.
- The bottom bar's labels were cropped out of it and its icons drew at 14px; Time Off and Leave
  shared a cloud, Timesheet and Shifts the same clock. One icon module holds them now, and a test
  fails if two modules in a space ever share a shape again.
- Team space had no bottom bar, so a manager could not leave it from a phone. The sign-in and
  activation screens could not scroll, so the keyboard hid the Sign In button.
- One subject per screen on a phone: Home opens on Profile, with Activities, Approvals and Dashboard
  beside it; Compensation and Organization follow the same list-then-detail pattern.
- Dialogs are bottom sheets on a phone, form text is 16px so iOS stops zooming in and never back
  out, and the keyboard resizes the page instead of covering the field.

---

## Security and data isolation — 3 commits

### Ownership on every self-service write
`3b23af4` `66fd8a8` `d371061`

**Before:** self-service writes trusted the employee, timesheet and attendance ids in the request.
Every seeded employee holds the write permissions, and the services only checked that the target was
in the same organization — so a colleague's UUID was enough to act as them.

- A shared write boundary resolves the employee from the session, and allows an explicit id only for
  callers holding that module's existing `.read.all` breadth. No new permission, no backfill.
- Native punches are recorded at server time, with the work date derived in the organization's
  timezone, instead of taking both from the request.
- File deletion, uploads and upload completion use the same self-or-breadth model as list and
  download; payslips and payroll exports need breadth.
- Row-level security is enforced in local development: a least-privilege runtime role is
  provisioned, and tools that genuinely need elevated access ask for it by their own variable
  instead of borrowing `DATABASE_URL`.
- Hard-coded database credential fallbacks were removed from three scripts.
- A path id that is not a UUID answered 500 — Postgres refused it and nothing mapped the error. It
  answers 404 now.

---

## Build, CI and operations — 7 commits

### No Docker, no MinIO
`f8bd591` `11dd240` `fedda3b` `08b4353`

- PostgreSQL 17 and Redis are installed and started natively on the CI runner. The Dockerfile,
  `docker-compose.yml`, `.dockerignore` and the container-image job are deleted, along with the S3
  endpoint override that existed only for the MinIO double.
- gitleaks runs as its pinned release binary, verified against the release's own checksums.
- `pnpm db:backup` accepts the documented database URL. `pg_dump` refuses Prisma's `?schema=public`,
  so with the environment configured as the example shows, every backup had been failing. A failed
  or empty dump now deletes its file instead of leaving it as the newest artifact.
- The release script restores the previous release when activation fails, and stops the API with a
  kill timeout long enough for a payroll run to finish. It has its own test in CI.
- The deployment document describes the deployment that exists: per-commit release directories,
  secrets from AWS Secrets Manager, migrations first, PM2 behind a health gate.

### The local API stays up, and typecheck stops killing it
`4e697af` `4f4250a` `402fcd6`

- Typecheck and build no longer regenerate the Prisma client unconditionally. That rewrote 97
  committed files, and the dev watcher killed the API mid-request — six times in one day.
- The dev server owns its process: it restarts after a clean build and after an unasked exit,
  printing how it died, and gives up after five exits in a minute.
- Fatal errors are written synchronously, so they reach the log on Windows instead of disappearing
  with the process.
- The workspace is reachable through a dev tunnel: the exact tunnel host is allowed rather than a
  wildcard subdomain, and `/v1/*` is proxied so the browser makes same-origin requests with
  first-party cookies.

---

## New API routes — 9, native only

| Route | What it does | Who may call it |
| --- | --- | --- |
| `POST /attendance/:id/corrections/missing-check-out` | Ask for a forgotten check-out | Own record |
| `GET /attendance/holiday-conflicts` | Days that are both a granted holiday and worked | Own unless breadth |
| `POST /attendance/:id/holiday-conflict` | Explain the check-in, with a reason | Own record |
| `GET /attendance/holiday-conflicts/inbox` | Reviews awaiting a decision | Deciders |
| `POST /attendance/holiday-conflicts/:id/decision` | Keep the holiday, or convert the day | Deciders |
| `GET /shifts/assignments/current` | The shift assigned on a given day | Own unless breadth |
| `GET /shifts/assignments` | Who is on which shift, a page at a time | Own unless breadth |
| `POST /shifts/assignments/:id/end` | Set an employee's last day on a shift | `shifts.write` |
| `POST /attendance/auto-check-out/run` | Close the days with no check-out that are due now | `attendance.preferences.write` |

Two existing routes also gained optional fields, both native-only and both untouched by federation:
the attendance decision takes a `checkOutAt`, so an approver can settle a day at the real time
rather than the proposed one; and attendance preferences take `autoCheckOutMode` and
`autoCheckOutAt`.

---

## Database migrations — 4 new

| Migration | Why |
| --- | --- |
| `20260909090000_employee_holiday_policies_rls` | The table had been created without row-level security |
| `20260909100000_timesheets_decide_canonical` | Corrects roles seeded with a permission the catalogue does not define |
| `20260915120000_attendance_holiday_reviews` | Reviews of a check-in on a granted optional holiday |
| `20260916100000_attendance_auto_checkout` | Whether days with no check-out are closed for review, and at what local time |

---

## Tests and CI — all 7 jobs green

| Measure | At GitLab's previous commit | Now |
| --- | --- | --- |
| Test files in the repository | 77 | 107 |
| API unit tests | — | 493 passing |
| Web tests, web-org and web-admin | — | 434 and 7 passing |
| End-to-end suites against a running API | 15 | 21 |
| CI jobs | 8, one of them the container image | 7, no Docker |

The six new end-to-end suites are `authorization-boundaries`, `ownership-and-approvals`,
`missing-checkout`, `holiday-checkin`, `shift-assignment` and `auto-checkout`. Each drives real
sessions through the real API, including cross-tenant and self-scope refusals. They share one
harness whose "today" is the tenant's rather than UTC's: between 00:00 and 05:30 IST, every
date-dependent check had been looking at the wrong day.

---

## Not included, and still open

- **The storage round trip is unverified in CI.** The `CI_S3_*` secrets are not set, so
  `verify:files` reports NOT RUN. It is never counted as a pass.
- **Point-in-time recovery** is documented but has not been exercised on a real server. What does
  run in CI is a dump-and-restore drill.
- **Nobody has clicked through the app in a browser** as part of this work; that needs a signed-in
  session.
- **Open product decisions:** whether unresolved holiday conflicts should block payroll; whether pay
  for a worked holiday exists at all, which it does not today and which is a payroll policy
  decision; and whether a future shift assignment should be withdrawable rather than only endable.
- **Automatic close is off for every organization** until someone turns it on, and an organization
  with no default attendance approval policy has nowhere to send a closed day — the sweep logs that
  and moves on rather than closing it silently.
- **Nothing is merged.** Both remotes have the branch at `dfebb80`; GitLab's `main` and `dev` are
  untouched and no merge request was opened.

---

Compiled from `git diff 4c5b980..dfebb80` on 16 September 2026. The counts are the diff's own; test
results are from that day's run, and the CI run for `dfebb80` passed all seven jobs.
