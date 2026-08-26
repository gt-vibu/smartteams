# EMS BACKEND — RBAC, MULTI-TENANCY & RESOURCE AUTHORIZATION AUDIT REPORT

**Audit Date:** August 25, 2026  
**Target Codebase:** `smarteam` / `apps/api`  
**Scope:** Multi-tenancy, RBAC, Resource Ownership, Approval Workflows, IDOR/Isolation Verification, Team & Project Cardinality  

---

## A. Executive Summary

The Smarteam EMS backend implements a **Hybrid Multi-Tenant, Role-Based & Policy-Driven Access Control (RBAC + ABAC + Relationship-Based Approval Engine)**.

### Key Architectural Findings:
1. **Multi-Tenancy:** Hardened multi-tenancy is enforced at both the database layer (via **PostgreSQL Row-Level Security session variables** `app.organization_id` set per transaction in [`tenant-database.service.ts`](file:///c:/Users/VIBUDARSHAN/.gemini/antigravity-ide/scratch/smarteam/apps/api/src/infrastructure/database/tenant-database.service.ts)) and the application layer (`where: { organizationId: context.organizationId }`).
2. **RBAC Engine:** Granular permission system. Permissions are string keys (e.g. `employees.read`, `timesheets.submit`, `projects.write`). Roles are dynamically defined per organization (or system-wide) and assigned to users via `UserRole` mappings with optional branch scoping (`branchId`) and validity dates (`startsAt`, `endsAt`).
3. **Multi-Project & Multi-Team:** The backend schema **fully supports many-to-many relationships** for both Teams and Projects. An employee can belong to multiple teams (`TeamMember[]`) and multiple projects simultaneously (`ProjectMember[]`) with distinct roles and allocation percentages.
4. **Approval Engine:** Multi-step approval workflows (`ApprovalPolicy` + `ApprovalPolicyStep`) supporting 3 distinct approver types: `MANAGER` (dynamic hierarchical manager), `USER` (direct assigned employee), and `ROLE` (role-based approver). Self-approvals are strictly blocked at the service level.

---

## B. Tenant Model & Multi-Tenancy Isolation

### 1. Representation & Associations
* **Tenant Entity:** `Organization` (`organizations` table in `tenant.prisma`). Identified by UUID `id`.
* **User vs Employee:**
  * `User` (`users` table in `identity.prisma`): Authentication identity (email, password hash, external identity). Can have memberships in **multiple organizations** via `UserOrganization` (`user_organizations` join table).
  * `Employee` (`employees` table in `workforce.prisma`): Workforce identity belonging to **exactly one organization** (`organizationId`). Links to a `User` via `userId` (1:1 per organization).
* **Branches:** Sub-divisions within an organization (`Branch`), supporting primary and secondary branch assignments (`EmployeeBranchAssignment`).

### 2. Tenant Isolation Enforcement Layers
Isolation is verified across **all 5 layers**:
```text
1. Authentication: NativeJwtGuard validates JWT token and user account active status.
      ↓
2. Middleware / Context Factory: DomainContextFactory.native(userId, organizationId, branchId)
   loads permissions exclusively for that (userId, organizationId, branchId).
      ↓
3. Controller: Routes are scoped under /v1/organizations/:organizationId/...
      ↓
4. Service Layer: Services require specific permissions and assert context.organizationId.
      ↓
5. Database Layer: TenantDatabaseService.run() executes:
   SELECT set_config('app.organization_id', context.organizationId, true);
   PostgreSQL Row-Level Security (RLS) policies block any row from other organizations.
```

---

## C. Roles Inventory

| Role Category | Definition Location | Storage Table | Scope | Assignment Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Platform Roles** (e.g. `SUPER_ADMIN`) | `identity.prisma` | `platform_roles` | Platform / Global | Assigned in `user_platform_roles` (only for system/federation operators). |
| **Organization Roles** (e.g. `TENANT_ADMIN`, `HR_MANAGER`, `EMPLOYEE`, custom roles) | `rbac.prisma` | `roles` | `ORGANIZATION` or `BRANCH` | Assigned in `user_roles` (`userId`, `organizationId`, `roleId`, `branchId?`, `startsAt`, `endsAt`). |

* **Dynamic Role Creation:** Any user with `rbac.write` can create custom roles with arbitrary sets of permissions per tenant via `POST /v1/organizations/:organizationId/roles`.
* **Multiple Roles:** Users can have **multiple active roles** simultaneously in the same organization. Permissions are merged as a union `Set<string>`.

---

## D. Permissions Inventory

| Permission Key | Resource Domain | Action | Enforcement Location |
| :--- | :--- | :--- | :--- |
| `rbac.read` | Roles & Permissions | View organization roles | `RbacAdminService.listRoles` |
| `rbac.write` | Roles & Permissions | Create/assign roles | `RbacAdminService.createRole`, `RbacAdminService.assign` |
| `employees.read` | Employees | Read employee profile / list | `EmployeesService.get`, `EmployeesService.list` |
| `employees.write` | Employees | Create/update employees | `EmployeesService.createNative`, `EmployeesService.updateNative` |
| `employees.branches.write`| Employee Branches | Assign branches | `EmployeesService.assignBranch` |
| `employees.access.write` | Employee Access | Manage employee identity | `EmployeesService.setAccessMode` |
| `employees.sessions.revoke`| Employee Auth | Revoke sessions | `EmployeesService.revokeSessions` |
| `employees.compensation.write`| Compensation | Add pay/compensation | `EmployeeRecordsService.addCompensation` |
| `attendance.read` | Attendance Records | View attendance & punches | `AttendanceService.listRecords`, `AttendanceService.getSummary` |
| `attendance.write` | Attendance Punches | Record punches | `AttendanceService.recordPunch` |
| `attendance.corrections.write`| Attendance Corrections| Request attendance fix | `AttendanceService.requestCorrection` |
| `attendance.corrections.decide`| Attendance Approvals | Approve/reject corrections | `AttendanceService.decideCorrection` |
| `attendance.preferences.read` | Attendance Settings | View geofence/mode | `AttendanceService.getPreferences` |
| `attendance.preferences.write`| Attendance Settings | Update geofence/mode | `AttendanceService.setPreferences` |
| `attendance.webauthn.enroll` | Biometrics / WebAuthn | Register passkeys | `WebauthnService.startEnrollment` |
| `attendance.webauthn.assert` | Biometrics / WebAuthn | Authenticate punch | `WebauthnService.verifyAssertion` |
| `attendance.webauthn.revoke` | Biometrics / WebAuthn | Revoke passkey | `WebauthnService.revokeCredential` |
| `timesheets.read` | Timesheets | View timesheets | `TimesheetsService.list` |
| `timesheets.read.all` | Timesheets | View all org timesheets | `TimesheetsService.list` (bypass self-filter) |
| `timesheets.write` | Timesheets | Periods / manual entries | `TimesheetsService.createPeriod`, `TimesheetsService.addManualEntry` |
| `timesheets.submit` | Timesheets | Submit timesheet | `TimesheetsService.submit` |
| `timesheets.decide` | Timesheets | Approve/reject timesheet | `TimesheetsService.decide` |
| `leave.types.read` | Leave Policies | View leave types | `LeaveService.listTypes` |
| `leave.types.write` | Leave Policies | Create/update leave types | `LeaveService.createType`, `LeaveService.updateType` |
| `leave.balances.read` | Leave Balances | View balances | `LeaveService.listBalances` |
| `leave.balances.adjust` | Leave Balances | Manual balance adjustments | `LeaveService.adjustBalance` |
| `leave.requests.read` | Leave Requests | View leave applications | `LeaveService.listRequests`, `LeaveService.listPendingApprovals` |
| `leave.requests.write` | Leave Requests | Apply/cancel leave | `LeaveService.submitRequest`, `LeaveService.cancelRequest` |
| `leave.requests.decide` | Leave Approvals | Approve/reject leave | `LeaveService.decideRequest` |
| `shifts.read` | Shifts | View shifts | `ShiftsService.listShifts`, `ShiftsService.getShift` |
| `shifts.write` | Shifts | Create/assign shifts | `ShiftsService.createShift`, `ShiftsService.assignShift` |
| `teams.read` | Teams | View teams and members | `TeamsProjectsService.listTeams` |
| `teams.write` | Teams | Create/update/archive teams | `TeamsProjectsService.createTeam`, `TeamsProjectsService.addTeamMember` |
| `projects.read` | Projects | View projects & members | `TeamsProjectsService.listProjects` |
| `projects.write` | Projects | Create/update/archive projects| `TeamsProjectsService.createProject`, `TeamsProjectsService.addProjectMember` |
| `organizations.read` | Organization Details | View org metadata | `OrganizationsService.get` |
| `organizations.update` | Organization Details | Update org metadata | `OrganizationsService.update` |
| `branches.read` | Branches | View branches | `OrganizationsService.listBranches` |
| `branches.write` | Branches | Create/update branches | `OrganizationsService.createBranch` |
| `payroll.policy.read` | Payroll Settings | View payroll policies | `PayrollPolicyService.getPolicy` |
| `payroll.policy.write` | Payroll Settings | Update payroll policies | `PayrollPolicyService.setPolicy` |
| `payroll.runs.read` | Payroll Runs | View payroll runs | `PayrollService.listRuns` |
| `payroll.runs.write` | Payroll Runs | Create/modify payroll run | `PayrollService.createRun` |
| `payroll.runs.approve` | Payroll Approvals | Approve payroll run | `PayrollService.approveRun` |
| `payroll.payslips.read` | Payslips | View employee payslips | `PayrollService.getPayslip` |

---

## E. Role → Permission Matrix

| Resource / Action | Tenant Admin (`*` or Admin Role) | Reporting Manager | Employee / Team Member | Non-Member / Unassigned |
| :--- | :---: | :---: | :---: | :---: |
| **View own profile** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Edit own profile** | ✅ Allowed | ✅ Allowed | ✅ Allowed (non-locked fields) | ❌ Denied |
| **View all employees** | ✅ Allowed (`employees.read`) | ✅ If assigned `employees.read` | ❌ Only self unless assigned role | ❌ Denied |
| **Manage employee / records**| ✅ Allowed (`employees.write`) | ❌ Unless HR role | ❌ Denied | ❌ Denied |
| **Clock in / out (punches)** | ✅ Allowed | ✅ Allowed | ✅ Allowed (`attendance.write`) | ❌ Denied |
| **View own attendance** | ✅ Allowed | ✅ Allowed | ✅ Allowed (`attendance.read`) | ❌ Denied |
| **View reportee attendance**| ✅ Allowed | ✅ If holding read role | ❌ Denied | ❌ Denied |
| **Request attendance fix** | ✅ Allowed | ✅ Allowed | ✅ Allowed for own records | ❌ Denied |
| **Approve attendance fix** | ✅ If role-based step | ✅ If designated manager step | ❌ Denied (no self-approval) | ❌ Denied |
| **View own timesheet** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Denied |
| **Submit own timesheet** | ✅ Allowed | ✅ Allowed | ✅ Allowed (`timesheets.submit`) | ❌ Denied |
| **Approve timesheet** | ✅ If policy matches role | ✅ If manager step in policy | ❌ Denied (no self-approval) | ❌ Denied |
| **View assigned projects** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Filtered |
| **Create / manage projects** | ✅ Allowed (`projects.write`) | ❌ Unless granted write | ❌ Denied | ❌ Denied |
| **View assigned teams** | ✅ Allowed | ✅ Allowed (Lead view) | ✅ Allowed (Member view) | ❌ Filtered |
| **Create / manage teams** | ✅ Allowed (`teams.write`) | ❌ Unless granted write | ❌ Denied | ❌ Denied |
| **Apply for leave** | ✅ Allowed | ✅ Allowed | ✅ Allowed (`leave.requests.write`) | ❌ Denied |
| **Approve leave request** | ✅ If policy matches role | ✅ If manager step in policy | ❌ Denied (no self-approval) | ❌ Denied |
| **View own payslips** | ✅ Allowed | ✅ Allowed | ✅ Allowed (`payroll.payslips.read`) | ❌ Denied |

---

## F. Resource Ownership Matrix

| Entity | Primary Owner Key | Tenant-Scoped | User-Scoped | Manager-Scoped | Project-Scoped | Team-Scoped |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `Employee` | `organizationId` + `userId` | ✅ Yes | ✅ Yes (`userId`) | ✅ `managerEmployeeId` | ❌ No | ❌ No |
| `AttendanceRecord` | `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ✅ Via Manager | ❌ No | ❌ No |
| `AttendancePunch` | `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ❌ No | ❌ No | ❌ No |
| `AttendanceCorrection`| `organizationId` + `requestedByUserId`| ✅ Yes | ✅ Yes | ✅ Approver | ❌ No | ❌ No |
| `Timesheet` | `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ✅ Approver | ❌ No | ❌ No |
| `TimesheetEntry` | `organizationId` + `timesheetId` | ✅ Yes | ✅ Via Timesheet | ❌ No | ❌ (Decoupled) | ❌ No |
| `LeaveRequest` | `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ✅ Approver | ❌ No | ❌ No |
| `LeaveBalance` | `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ❌ No | ❌ No | ❌ No |
| `Team` | `organizationId` | ✅ Yes | ❌ No | ✅ `teamLeadEmployeeId` | ❌ No | ✅ Entity Root |
| `TeamMember` | `organizationId` + `teamId` + `employeeId` | ✅ Yes | ✅ Via Employee | ❌ No | ❌ No | ✅ Yes |
| `Project` | `organizationId` | ✅ Yes | ❌ No | ❌ No | ✅ Entity Root | ❌ No |
| `ProjectMember` | `organizationId` + `projectId` + `employeeId`| ✅ Yes | ✅ Via Employee | ❌ No | ✅ Yes | ❌ No |
| `Shift` | `organizationId` | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| `EmployeeShiftAssignment`| `organizationId` + `employeeId` | ✅ Yes | ✅ Via Employee | ❌ No | ❌ No | ❌ No |

---

## G. Employee Access (Self-Scope)

* **Own Records:** An employee authenticated as a user can view their own profile, punches, attendance records, leave balances, leave applications, timesheets, and payslips.
* **Strict Self-Enforcement in Timesheets:** `TimesheetsService.list` line 30 verifies that if the user lacks `timesheets.read.all` or `*`, `employeeId` is strictly locked to the caller's own employee ID.

---

## H. Manager Access

* **Reporting Manager Definition:** Defined by `Employee.managerEmployeeId` referencing another `Employee`.
* **Approvals Scope:**
  - When an approval policy step specifies `ApproverType.MANAGER`, the backend dynamically resolves the employee's `managerEmployeeId -> Employee.userId`.
  - Only the exact manager user matching `expectedUserId === userId` is authorized (`canApprove` in `approval-authorization.ts`).
  - Direct report approvals are supported for Leave, Timesheets, and Attendance Corrections.

---

## I. Tenant Admin Access

* Users holding the wildcard permission `*` or domain-specific write permissions (`employees.write`, `timesheets.write`, `projects.write`, `teams.write`, `leave.types.write`, `payroll.runs.approve`) operate with full administrative control across the organization.
* Tenant Admin actions are automatically recorded to the audit log (`AuditService.record`) with before/after state snapshots.

---

## J. Team Model (Multi-Team Membership)

### [VERIFIED] Can an employee belong to multiple teams?
**YES, 100% verified in database schema and services.**
* **Join Model:** `TeamMember` (`team_members` table in `workforce.prisma`).
* **Cardinality:** **Many-to-Many**.
* An employee can have multiple `TeamMember` rows pointing to different `teamId` values.
* Attributes on `TeamMember`:
  - `joinedAt` (Date)
  - `leftAt` (Date? -> if `null`, active membership; if populated, historical)
* Attributes on `Team`:
  - `name` (unique per org)
  - `description`
  - `teamLeadEmployeeId` (Team Lead reference)
  - `branchId` (optional Branch reference)
  - `status` (`ACTIVE`, `ARCHIVED`)

---

## K. Project Model (Multi-Project Membership)

### [VERIFIED] Can an employee belong to multiple projects simultaneously?
**YES, 100% verified in database schema and services.**
* **Join Model:** `ProjectMember` (`project_members` table in `workforce.prisma`).
* **Cardinality:** **Many-to-Many**.
* An employee can be assigned to multiple projects at the same time:
  ```text
  Employee
    ├── ProjectMember → Project Alpha (Role: Tech Lead, Allocation: 50%)
    ├── ProjectMember → Project Beta  (Role: Backend Lead, Allocation: 30%)
    └── ProjectMember → Project Gamma (Role: Advisor, Allocation: 20%)
  ```
* Attributes on `ProjectMember`:
  - `projectRole` (`String?`, e.g. "Tech Lead", "Developer", "QA Lead")
  - `allocationPercentage` (`Decimal(5,2)`, validated between 0 and 100 in `teams-projects.service.ts`)
  - `startsOn` (Date)
  - `endsOn` (Date? -> if `null`, active ongoing assignment)
  - **Overlap Validation:** The service prevents duplicate overlapping assignment periods for the same employee in the same project (`teams-projects.service.ts:280`).

---

## L. Project Visibility

| Case | Condition | Backend Route Status | Frontend Requirement |
| :--- | :--- | :---: | :--- |
| **Case A** | Employee is a `ProjectMember` | `projects.read` required | ✅ Should be visible in "My Projects" |
| **Case B** | Employee is Project Lead / Manager | `projects.read` required | ✅ Visible with Lead badge |
| **Case C** | Employee reports to Project Lead | `projects.read` required | ❌ Hidden from employee unless assigned |
| **Case D** | Employee in same Team as Lead | `projects.read` required | ❌ Hidden from employee unless assigned |
| **Case E** | Tenant Admin | `*` / `projects.read` | ✅ Can see and manage all organization projects |
| **Case F** | Non-assigned Employee | `projects.read` | ❌ Should be filtered out in personal view |

---

## M. Reporting Hierarchy

* **Direct Hierarchy:** `Employee.managerEmployeeId` points to another `Employee` within the same organization.
* **Cycle Prevention / Self-Reference:** The approval authorization engine strictly enforces that `managerUserId !== requesterUserId`.

---

## N. Approval Authority

The approval engine in `approval-authorization.ts` and `approvals.service.ts` governs:

1. **Attendance Corrections:**
   - Requester: Employee (`attendance.corrections.write`)
   - Approver: Resolved manager or assigned role step (`attendance.corrections.decide`)
2. **Timesheet Approvals:**
   - Requester: Employee (`timesheets.submit`)
   - Approver: Step-based approver (`timesheets.decide` + `assertApprover`)
3. **Leave Requests:**
   - Requester: Employee (`leave.requests.write`)
   - Approver: Step-based approver (`leave.requests.decide` + `assertApprover`)
4. **Payroll Runs:**
   - Approver: Role holding `payroll.runs.approve`

---

## O. Status-Based Permissions

| Domain | Status | Who can Edit | Who can Submit | Who can Decide |
| :--- | :--- | :---: | :---: | :---: |
| **Timesheet** | `DRAFT` | Employee / Creator | Employee (`submit`) | ❌ Not yet |
| **Timesheet** | `SUBMITTED` | ❌ Locked | ❌ Already submitted | Authorized Approver (`decide`) |
| **Timesheet** | `APPROVED` | ❌ Locked | ❌ Locked | ❌ Completed |
| **Leave** | `DRAFT` / `PENDING` | Employee (`cancel`) | Employee (`submit`) | Authorized Approver (`decide`) |
| **Leave** | `APPROVED` / `REJECTED` | ❌ Locked | ❌ Locked | ❌ Completed |
| **Project** | `PLANNED` / `ACTIVE` | Admin (`projects.write`) | N/A | N/A |
| **Project** | `ARCHIVED` | ❌ Archived | N/A | N/A |

---

## P. Tenant Isolation Audit

* **[VERIFIED] Protection Status: HIGHLY SECURE.**
* Every transaction in `TenantDatabaseService` executes `set_config('app.organization_id', ...)` setting session variables for Postgres Row-Level Security.
* Even if an application query were to omit `organizationId`, Postgres RLS blocks cross-tenant row leakage.

---

## Q. IDOR / Horizontal Access Audit

1. **Timesheets (`GET /timesheets`):**
   - **Status:** **PROTECTED**. Service explicitly checks caller identity and blocks non-admin callers from viewing other employees' timesheets.
2. **Attendance (`GET /attendance?employeeId=...`):**
   - **Status:** **ROLE-DEPENDENT**. The endpoint currently relies on `attendance.read` permission. If an ordinary employee is assigned `attendance.read`, the endpoint does not restrict `filters.employeeId` to their own ID at the service query level.
3. **Leave Requests (`GET /leave-requests?employeeId=...`):**
   - **Status:** **ROLE-DEPENDENT**. Relies on `leave.requests.read`.
4. **Teams & Projects (`GET /teams`, `GET /projects`):**
   - **Status:** Coarse read permissions (`teams.read`, `projects.read`) return organization-wide active lists. Row-level filtering by assigned employee is currently performed at the frontend / client presentation layer.

---

## R. Endpoint Authorization Matrix

| Endpoint | Method | Required Permission | Approver / Relationship Check |
| :--- | :---: | :--- | :--- |
| `/v1/organizations/:orgId/employees` | `GET` | `employees.read` | Tenant-scoped |
| `/v1/organizations/:orgId/employees/:empId` | `GET` | `employees.read` | Tenant-scoped |
| `/v1/organizations/:orgId/attendance` | `GET` | `attendance.read` | Tenant-scoped |
| `/v1/organizations/:orgId/attendance/punches` | `POST` | `attendance.write` | Tenant + Device verify |
| `/v1/organizations/:orgId/attendance/:id/corrections`| `POST`| `attendance.corrections.write` | Requester reason required |
| `/v1/organizations/:orgId/attendance/:id/corrections/decision`| `POST`| `attendance.corrections.decide` | `assertApprover` (Manager/Role) |
| `/v1/organizations/:orgId/timesheets` | `GET` | `timesheets.read` | Self-enforced unless `timesheets.read.all` |
| `/v1/organizations/:orgId/timesheets/:id/submit` | `POST` | `timesheets.submit` | Draft status required |
| `/v1/organizations/:orgId/timesheets/:id/decision` | `POST` | `timesheets.decide` | `assertApprover` (Manager/Role) |
| `/v1/organizations/:orgId/projects` | `GET` | `projects.read` | Tenant-scoped |
| `/v1/organizations/:orgId/projects` | `POST` | `projects.write` | Unique code + timeline check |
| `/v1/organizations/:orgId/projects/:id/members` | `POST` | `projects.write` | Overlap check + allocation % |
| `/v1/organizations/:orgId/teams` | `GET` | `teams.read` | Tenant-scoped |
| `/v1/organizations/:orgId/teams` | `POST` | `teams.write` | Unique name check |
| `/v1/organizations/:orgId/leave/requests` | `GET` | `leave.requests.read` | Tenant-scoped |
| `/v1/organizations/:orgId/leave/requests/:id/decision`| `POST`| `leave.requests.decide` | `assertApprover` (Manager/Role) |

---

## S. Frontend Authorization Implications

Based on the actual backend architecture, the frontend should structure user views as follows:

1. **Employee Perspective ("My Space"):**
   - **Attendance:** Display only personal punches, times, and day status.
   - **Timesheets:** Display only personal timesheet periods and allow submitting draft entries.
   - **Leave:** Display only personal balances and personal applications.
   - **Projects:** Filter project list to display **only projects where `project.members` contains current employee**.
   - **Teams:** Filter team list to display **only teams where `team.members` contains current employee or where employee is Team Lead**.
2. **Manager Perspective ("Team / Manager Space"):**
   - Display pending approvals tab querying `leave.requests` / `attendance.corrections` / `timesheets` where current user is the designated manager.
   - Restrict approve/reject buttons to requests from direct reportees.
3. **Tenant Admin Perspective ("Organization Settings"):**
   - Provide full administrative dashboards for creating/archiving projects, creating/archiving teams, creating roles, assigning permissions, and managing shifts/policies.

---

## T. Security Findings

### Confirmed Correct Controls [VERIFIED]
1. **Multi-Tenancy Hardening:** Postgres Row-Level Security session variables (`app.organization_id`) guarantee database-level tenant isolation.
2. **Self-Approval Prohibition:** `assertApprover` explicitly rejects any approval where `approverUserId === requesterUserId`.
3. **Timesheet Scope Enforcement:** `TimesheetsService.list` restricts non-admin callers to their own employee ID.
4. **Project Overlap Prevention:** `addProjectMember` checks database to prevent overlapping assignment date ranges for the same member.

### Potential Issues / Observations [NOT ENFORCED / NOTED]
1. **Attendance/Leave List Endpoint Granularity:** `GET /attendance` and `GET /leave/requests` filter by `employeeId` parameter when supplied, but if called without parameters by a standard user with read permission, they return all organization records unless filtered by the caller/frontend.
2. **Timesheet to Project Linking:** In the database schema (`operations.prisma`), `TimesheetEntry` links to `AttendanceRecord` or manual timesheet, but does not have a foreign key to `Project`. Project tracking and timesheet logging are currently decoupled in the backend schema.

---

## U. Unknowns
* None identified in core RBAC, multi-tenancy, or team/project cardinality. All models and service logic were directly verified from source code and SQL migrations.

---

## V. Recommendations (Non-Modifying / Architectural Advice)
1. **Add `my-projects` and `my-teams` Query Scopes:** Consider adding query-level self-scoping on `GET /projects` and `GET /teams` (e.g. `GET /projects?assignedOnly=true` or automatically filtering when user lacks administrative role) to enforce assignment-based visibility on the API layer as well as the UI layer.
2. **Link Timesheet Entries to Projects (Optional Feature):** If project-based time billing or project timesheet tracking is desired in the future, add `projectId String? @db.Uuid` to `TimesheetEntry` in `operations.prisma`.
3. **Dedicated Self-Service Attendance Route:** Add a dedicated `/v1/organizations/:organizationId/me/attendance` endpoint to mirror the self-protection present in `/timesheets`.
