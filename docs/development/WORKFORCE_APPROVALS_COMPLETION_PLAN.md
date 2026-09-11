# Workforce approval routing and approval inbox plan

## 1. Goal

Build one approval flow in SmartTeams that works for SmartTeams standalone customers and for BlizBooks federation.

The first BlizBooks release covers only:

- Leave requests.
- Attendance correction requests.

SmartTeams keeps its broader approval domains for standalone use, including timesheets and payroll. BlizBooks must not expose finance or payslip reviewer workflows in this phase.

The system must support all of these approver choices for every supported workflow:

1. Reporting manager of the requesting employee.
2. A specific employee selected by an administrator.
3. A dynamic workforce approval role or group.

No workflow may assume that the reporting manager is always the approver.

## 2. Access boundary

SmartTeams has two separate concepts:

### Employee access

Employee access allows a person to use workforce self-service features:

- Their attendance.
- Their leave balances and requests.
- Their payroll statements when enabled.
- Approval tasks assigned to them when they have approval authority.

An employee does not need BlizBooks Team access to approve a workforce request.

### Team access

Team access controls BlizBooks business operations such as stock, products, issuing, restocking, sales, and operational reports.

Team access does not automatically grant leave or attendance approval authority.

### Approval authority

Approval authority is a separate SmartTeams assignment attached to an employee identity. It is scoped by organization or branch, domain, and effective dates. A person may have employee access plus approval authority without having Team access. A person may also have both approval authority and Team access.

The same approval task may appear in both the Employee Workspace and the Team Workspace when the person has both access paths. Both surfaces must call the same SmartTeams decision API and must never create duplicate approval records.

## 3. Current gaps to close

- Approval policies are stored at organization level, while request routing needs branch-aware resolution.
- Leave requests select only the active default leave policy. There is no explicit recipient or task created for the first step.
- The current list view exposes branch requests to users with a broad approval permission instead of returning only tasks assigned to the current approver.
- If a workflow has no resolvable approver, the request can remain pending without a useful recipient or configuration error.
- The current UI uses fixed approver-type options and a free-text role code. It must load eligible workforce roles from SmartTeams.
- Direct employee approval exists in the API contract but the BlizBooks UI requires a searchable employee selector instead of a manually entered external ID.
- Reporting manager resolution needs an explicit missing-manager path and must not silently fall through to unrestricted approval.
- Approval history is recorded when a decision is made, but the current step and next recipient are not clearly presented to the requester.
- The stored `required` step flag must be enforced consistently.
- Employee Workspace has no dedicated approval inbox for employees who do not have Team access.
- Team Workspace needs a `My approvals` view separate from the broader workforce request view.
- Rejection and cancellation must release reserved leave days exactly once. Approval must convert the reservation to usage only when the final required step approves.
- BlizBooks must expose only leave and attendance approval in this phase. Payroll approval remains a SmartTeams standalone capability and must not add finance or payslip-review date fields to BlizBooks payroll screens.

## 4. Canonical approval model

SmartTeams remains the system of record.

### Policy

An approval policy contains:

- Domain: leave, attendance correction, timesheet, or payroll.
- Organization and optional branch scope.
- Code and name.
- Ordered steps.
- Active/default status.
- Optional conditions for future use, such as leave type or correction age.

### Step

Each step contains:

- Step number.
- Approver type: `MANAGER`, `EMPLOYEE`, or `ROLE`.
- Selected employee for `EMPLOYEE`.
- Selected workforce role/group for `ROLE`.
- Required flag.
- Optional due period and escalation rule for standalone use.

The API must reject a step whose selected target does not match its approver type. It must also reject an approver role with no active eligible members in the request scope.

### Approval task

When a request is submitted, SmartTeams resolves the policy and creates a task for the first actionable step. The task contains:

- Request and domain.
- Requesting employee.
- Branch.
- Current step.
- Resolved approver type.
- Resolved employee or role/group.
- Status: pending, approved, rejected, cancelled, delegated, or expired.
- Created, due, decided, and delegated timestamps.
- Decision comment and actor.

For a role/group step, any one eligible active member may claim and decide the task. The decision transaction must prevent a second member from deciding the same step after it is closed.

### Recipient resolution

- `MANAGER`: use the active reporting manager attached to the requesting employee.
- `EMPLOYEE`: use the explicitly selected active employee and linked user account.
- `ROLE`: find active approval-authority members with the selected role and matching organization/branch scope.

If resolution returns no recipient, submission must fail with a clear message such as `No active approver is configured for Leave at JP Nagar`. The system must not silently assign the request to an arbitrary administrator.

## 5. Approval behavior

### Leave submission

1. Validate employee, leave type, assignment, dates, attachments, and available balance.
2. Resolve the applicable leave policy and first step.
3. Create the request and reserve the requested days in one transaction.
4. Create the first approval task.
5. Publish an outbox event for notification and federation sync.
6. Return the request with `pendingWith`, `currentStep`, and an approval timeline.

### Approval

1. Verify the task is pending and belongs to the current organization and branch scope.
2. Verify the current actor is the resolved manager, selected employee, role member, or active delegate.
3. Require a comment for rejection. Approval comments remain optional unless a policy requires them.
4. Record an immutable approval decision.
5. If another required step remains, create or activate the next task and keep the request pending.
6. If all required steps approve, mark the request approved and convert the leave reservation into usage.

### Rejection

1. Mark the current task and request rejected.
2. Release the reserved balance once.
3. Write a compensating leave ledger entry.
4. Notify the requester.

### Cancellation

1. Allow the requester to cancel while pending.
2. Close open tasks.
3. Release the reservation once.
4. Do not release already-used balance after final approval. A post-approval cancellation must use a separate cancellation workflow in the standalone model.

### Attendance correction

Use the same task and decision rules. The request must show the original attendance record, requested correction, reason, employee, branch, and current approval step. BlizBooks supports only attendance correction approval in this phase.

## 6. SmartTeams interfaces

The implementation uses native and federation-safe APIs for:

- Listing eligible workforce approval roles. Role candidates are database-backed and filtered to
  roles that carry the relevant leave or attendance decision permission; operational Team roles
  without that permission are not offered as approvers.
- Listing active employees for direct assignment through the existing workforce employee feed.
- Listing the current actor's pending leave and attendance correction approvals.
- Returning the current approval step with each inbox item.
- Approving, rejecting, and cancelling requests with tenant and branch checks.

All endpoints enforce tenant and branch boundaries, validate external employee identifiers at the
federation edge, and keep internal user IDs inside SmartTeams. BlizBooks receives only external
employee identifiers and stable approval DTOs.

The existing native SmartTeams role management remains available for standalone customers. Workforce approval roles must be distinguishable from BlizBooks business-operation roles so a stock role does not accidentally become a workforce approver.

## 7. BlizBooks interfaces

### HR settings

Keep the existing Leave and Attendance settings in the HR workspace. Add:

- Approval policy scope.
- Dynamic workforce role selector.
- Searchable direct employee selector.
- Reporting manager option.
- Branch-aware role filtering and active-employee selection.
- Clear empty states when no eligible role or employee is available.

Do not add payroll approval configuration to BlizBooks in this phase.

### Employee Workspace

The employee and workforce screens show approval tasks only when the signed-in employee has
matching approval authority. They show:

- Requester name.
- Request type.
- Leave type or attendance date.
- Dates and requested days.
- Branch.
- Reason.
- Attachments when allowed.
- Current step and remaining steps.
- Submission time.
- Approve and reject actions with a required decision comment.

The employee's own requests remain in `My requests`, with a visible timeline such as `Pending with Rahul Shetty` or `Pending with Leave Approvers`.

### Team Workspace

Add a focused `My approvals` filter or tab to the workforce area. Keep `All requests` for authorized HR users, but do not show decision buttons unless the backend confirms that the current employee can decide the current task.

The `/employees` route remains the Team and access area. Approval authority does not depend on
business-operation access: a workforce-only role can carry leave or attendance approval permission
without stock, product, issue, or restock permissions. The employee-facing inbox is resolved from
the signed-in workforce identity, not from Team membership.

## 8. Default policies for BlizBooks

BlizBooks should ship with no forced single approver type. A customer chooses the policy for each workflow.

Recommended starting templates:

- Leave: reporting manager, with optional HR Leave Approver second step.
- Attendance correction: reporting manager, with optional HR Attendance Approver second step.

Direct employee and role/group steps must be available in both templates. A customer may create a one-step direct approver workflow or a multi-step workflow.

## 9. Verification requirements

Test all combinations below in native SmartTeams and federated BlizBooks flows:

- Reporting manager approval.
- Direct employee approval.
- Role/group approval.
- Employee approver with no Team access.
- Team user who is not an approver.
- Multiple eligible role members competing for one task.
- Missing manager.
- Inactive direct approver.
- Empty role/group.
- Cross-branch approver rejection.
- Cross-tenant request rejection.
- Multi-step approval.
- Rejection releases balance once.
- Cancellation releases balance once.
- Final approval consumes reserved balance.
- Duplicate decision is rejected safely.
- Self-approval is rejected for manager, direct employee, and role-based steps.
- Policy deactivation does not break existing request history.
- BlizBooks exposes only leave and attendance approval.

Acceptance means the requester's screen, approver's inbox, SmartTeams database, BlizBooks BFF, and federation response all show the same status and current recipient.

## 10. Implementation status

Completed in this phase:

- Leave and attendance corrections require a configured default approval policy before submission,
  preventing requests from becoming permanently pending with no recipient.
- Leave rejection and cancellation release the reserved balance once; final approval converts the
  reservation into usage. Duplicate or out-of-order decisions are rejected.
- Approval policy steps support reporting manager, a selected direct employee, or an eligible
  database-backed workforce role. BlizBooks exposes only Leave and Attendance correction policy
  configuration and does not expose payroll approval reviewers.
- BlizBooks settings now use live SmartTeams role and employee data instead of free-text approver
  values.
- Direct employee approver lists use the SmartTeams workforce feed without requiring the BlizBooks
  Team/business-operations workspace entitlement.
- Employee-only BlizBooks sessions can load and decide their assigned approval tasks. SmartTeams
  still performs the final approver, tenant, branch, and workflow-step authorization.
- Submission now fails before reserving leave or creating an attendance correction when any
  configured manager, direct employee, or workforce-role step has no active recipient in scope.
- SmartTeams rejects self-approval and rechecks that direct and manager approvers still have an
  active employee identity when the decision is made.
- Approval policy role selection is branch-aware and restricted to SmartTeams roles carrying the
  matching leave or attendance decision permission.
- Leave and attendance approval inboxes resolve the current signed-in employee and show only tasks
  that employee can approve. Decision buttons are not shown merely because the user can view the
  outlet's requests.
- The current attendance decision route uses the correction identifier returned by SmartTeams,
  avoiding the previous attendance-record/correction identifier mismatch.
