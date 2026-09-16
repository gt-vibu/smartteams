# Duplicate requests

A retry, a double-clicked button and a proxy replay are indistinguishable at the API: two requests,
no ordering, no shared client state. This records what protects each high-value mutation, and why
no idempotency-key infrastructure was added.

Every claim here is asserted by `pnpm verify:concurrency`, which fires four simultaneous copies of
each request and checks both the HTTP outcomes and the resulting rows.

## The protections in use

| Mechanism | Where | What it stops |
|---|---|---|
| Row lock (`SELECT … FOR UPDATE`) | payroll calculate, payroll transitions, advance decisions, timesheet submit, file completion | Two callers reading the same pre-state and both passing the guard |
| State machine | every workflow transition | A second request from a state that no longer allows it |
| Unique constraint | `[payrollRunId, approverUserId]`, `[leaveRequestId, stepNumber]`, `[timesheetId, approverUserId]` | A duplicate decision row, even if a guard were bypassed |
| Optimistic locking (`version`) | employee updates and every versioned entity | A lost update — the loser is told to re-read |
| Transaction | all of the above | Partial application of any single attempt |

## Per mutation

| Mutation | Protection | Duplicate behaviour |
|---|---|---|
| Calculate payroll | Row lock + state machine | One `201`, the rest `409`. One line item and one payment per employee. |
| Approve/release payroll | Row lock + state machine + unique approval | One `201`, the rest `409`. One approval row. |
| Approve advance | Row lock + status guard | One `201`, the rest `409`. Approved once. |
| Decide leave | Status guard + unique per step | One `201`, the rest `409`. One approval row. |
| Submit timesheet | Row lock + status guard | One `201`, the rest `409`. Submitted once. |
| Decide timesheet | Status guard + unique per approver | One `201`, the rest `409`. One approval row. |
| Update employee | Optimistic `version` via `if-match-version` | One `200`, the rest `409`. Version advances once. |

## Why the row locks were needed

The guards were all present already, and all of them read state and then acted on it. Between
those two steps another transaction can commit. Before the locks, four concurrent calculations of
one payroll run produced **two** accepted calculations and a `500` — both callers saw `DRAFT`, both
passed the guard, and they then raced deleting and re-inserting the same line items. The lock does
not add a rule; it makes the existing rule true under concurrency.

The pattern was already in the codebase — `FilesUploadService.complete` locks the file row before
reading its status — so the fix is the established idiom rather than a new mechanism.

## Why no idempotency keys

An idempotency key stores a request fingerprint and replays the first response. It is the right
tool when a duplicate would otherwise be **accepted twice and both succeed** — typically a `create`
with no natural uniqueness, such as charging a card.

Nothing in this list has that shape. Every mutation above either transitions a resource out of the
state a duplicate would need, or is protected by a unique constraint on the row it would create. A
duplicate is refused with `409`, which is a correct and honest answer: the work was already done.

Adding keys would mean a new table, a retention policy, and a fingerprinting rule on every
endpoint, to convert those `409`s into replayed `201`s. That is a better client experience only if
clients cannot treat `409` as success-already-happened — and it is a change to the API contract,
not a correctness fix. Federation has its own idempotency mechanism for the same reason in reverse:
partner systems retry blindly and cannot re-read state. Native clients can.

**If this changes** — a client that genuinely cannot distinguish "already done" from "failed", or a
mutation that creates a row with no natural key — revisit it then, for that endpoint.

## Caveat

The locks serialise callers within one database. They do not make an operation resumable: a
calculation interrupted half way rolls back entirely and must be re-run. See the deploy-during-
payroll note in `deployment.md`.
