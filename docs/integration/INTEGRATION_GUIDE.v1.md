# SmartTeams Workforce Federation Integration

## Executive Summary

This document provides a comprehensive technical reference for the **SmartTeams Workforce Federation Integration** within the **BlizBooks** platform.

SmartTeams provides workforce management capabilities—including HR, Attendance, Leave Management, Payroll, Shifts, Timesheets, statutory compliance, and WebAuthn Biometric Device Verification—to BlizBooks outlets. SmartTeams is the authoritative system of record for employee and workforce data. BlizBooks owns the authenticated application experience, accounting records, tenant mapping, and read-only workforce projections.

---

## 1. System Architecture & Core Design Principles

```mermaid
graph TD
    subgraph BlizBooks Core Platform
        UI[BlizBooks UI / Hotel & Admin Portals]
        DB[(BlizBooks PostgreSQL DB)]
        Projection[Workforce Projection Engine]
        Worker[Federation Reconciliation Worker]
        WebhookController[Federation Webhook Controller]
    end

    subgraph SmartTeams Provider Platform
        ST_Auth[OAuth2 / mTLS Auth Engine]
        ST_APIs[SmartTeams Federation APIs]
        ST_Webhooks[SmartTeams Webhook Service]
    end

    UI --> Projection
    Projection --> DB
    Worker --> ST_APIs
    ST_APIs --> ST_Auth
    WebhookController <-- Real-time Webhooks -- ST_Webhooks
    ST_APIs <-- Rest API Calls -- Projection
```

### Core Principles
1. **Workforce Ownership**: **SmartTeams owns the employee and workforce records**. BlizBooks creates, edits, deactivates, and reads employees only through the federation API. The BlizBooks employee row is an authenticated access/projection record, not a second HR source of truth.
2. **Read-Only Projections**: Data fetched from SmartTeams (employee records, attendance, leave, timesheets, payroll, and compliance) may be cached in BlizBooks `WorkforceProjectionRecord` rows for UI performance, reconciliation, and outage visibility. Projections cannot authorize conflicting workforce mutations.
3. **Resilience & Replay**: If webhooks fail or experience network latency, the background `FederationWorker` uses SmartTeams' **Replay API** (`GET /v1/federation/events`) to perform cursor-based catch-up reconciliations.

---

## 2. Authentication, Security & Transport

| Layer | Protocol / Specification | Description |
| :--- | :--- | :--- |
| **Transport Layer** | Mutual TLS (mTLS) | Encrypted TLS 1.3 channel verified via client certificates (`mtlsCertPem`, `mtlsKeyPem`, `mtlsCaPem`). |
| **Authorization** | OAuth 2.0 Client Credentials | Exchanged via `POST /v1/oauth/token` using `clientId` & `clientSecret` for short-lived Bearer tokens. |
| **Webhook Signatures** | RSA-SHA256 Public Key Cryptography | Inbound webhooks are verified using RSA public keys fetched from `GET /v1/federation/webhook-signing-keys`. |

---

## 3. Complete API Endpoint Reference

### 3.1 Infrastructure, Health & Tenant Provisioning

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/oauth/token` | **OAuth Token**: Exchanges `clientId` & `clientSecret` for a short-lived Bearer access token. |
| `GET` | `/v1/federation/health/ready` | **Health Ping**: Checks if the SmartTeams provider engine is online and operational. |
| `GET` | `/v1/federation/capabilities` | **Capabilities Discovery**: Queries enabled features (`employees`, `attendance`, `leave`, `payroll`, `shifts`, `timesheets`, `compliance`). |
| `PUT` | `/v1/federation/tenants/{orgId}` | **Tenant Sync**: Syncs Organization details (Name, Timezone, Currency Code). |
| `PUT` | `/v1/federation/tenants/{orgId}/branches/{branchId}` | **Branch Sync**: Syncs Branch/Outlet metadata (Name, Address, City). |
| `POST` | `/v1/federation/webhook-subscriptions` | **Webhook Register**: Registers BlizBooks webhook callback URL (`/api/webhooks/smartteams`). |
| `GET` | `/v1/federation/webhook-signing-keys` | **Public Keys**: Fetches RSA public keys for verifying inbound webhook signatures. |

### 3.2 Employee Identity & Access Control Sync

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/employees` | **Employee List**: Lists SmartTeams employee records with search, status, branch, bounded result filters, and opaque cursor pagination (`items`, `nextCursor`). |
| `GET` | `/v1/federation/employees/{employeeId}` | **Employee Detail**: Returns the authoritative employee profile and related workforce records. |
| `PUT` | `/v1/federation/employees/{employeeId}` | **Employee Upsert**: Creates or updates the federated employee using the stable BlizBooks external identifier. |
| `PATCH` | `/v1/federation/employees/{employeeId}` | **Employee Patch**: Updates provider-owned profile and lifecycle fields, including `ACTIVE`, `INACTIVE`, and `TERMINATED` status with an optional leaving date. |
| `POST` | `/v1/federation/employees/{employeeId}/deactivate` | **Employee Deactivation**: Audited, session-revoking lifecycle operation; operational history is retained. |
| `PUT` | `/v1/federation/employees/{id}/branches/{branchId}` | **Branch Assignment**: Assigns an employee to primary or secondary outlets. |
| `DELETE` | `/v1/federation/employees/{id}/branches/{branchId}` | **Branch Removal**: Ends an employee's branch assignment with a required reason. |
| `GET/POST` | `/v1/federation/employees/{id}/emergency-contacts` | **Emergency Contacts**: Reads and adds employee emergency contacts. |
| `GET/POST` | `/v1/federation/employees/{id}/employment-records` | **Employment History**: Reads and adds effective-dated employment records. |
| `GET/POST` | `/v1/federation/employees/{id}/compensation` | **Compensation History**: Reads and adds effective-dated compensation records. |
| `PUT` | `/v1/federation/employees/{id}/manager` | **Manager Assignment**: Assigns a valid active manager within the same organization. |
| `PUT` | `/v1/federation/employees/{id}/access` | **Permission Sync**: Pushes granted RBAC permission keys and versioning to SmartTeams. |
| `POST` | `/v1/federation/employees/{id}/sessions/revoke` | **Session Revocation**: Immediately revokes active SmartTeams sessions when an employee is deactivated. |

### 3.3 Attendance & Time Tracking

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/attendance` | **Attendance Logs**: Queries attendance records filtered by branch, employee, date range, or cursor. |
| `GET` | `/v1/federation/attendance/policies` | **Attendance Policies**: Fetches branch rules (grace periods, late penalties, overtimes). |
| `GET` | `/v1/federation/attendance/shifts` | **Shift Definitions**: Fetches branch shift schedules. |
| `PUT` | `/v1/federation/attendance/preferences` | **Geofence & Rules**: Configures outlet check-in preferences and geofence coordinates. |
| `POST` | `/v1/federation/attendance/check-ins` | **Clock-In**: Records employee check-in (supports location verification, device info, day status, and idempotency key). |
| `POST` | `/v1/federation/attendance/check-outs` | **Clock-Out**: Records employee check-out. |
| `POST` | `/v1/federation/attendance/{id}/corrections` | **Correction Request**: Submits a request to fix a missed/incorrect clock-in or clock-out. |
| `POST` | `/v1/federation/attendance/{id}/decision` | **Correction Approval**: Approves or rejects an attendance correction request. |

### 3.4 Shifts & Timesheets

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/shifts` | **Shift Definitions**: Lists active organization/branch shifts; branch scope is enforced from the grant and branch header. |
| `POST` | `/v1/federation/shifts` | **Create Shift**: Creates a branch-scoped shift definition. |
| `PATCH` | `/v1/federation/shifts/{shiftId}` | **Update Shift**: Updates a branch-scoped shift definition. |
| `POST` | `/v1/federation/shifts/{shiftId}/deactivate` | **Deactivate Shift**: Ends a shift and current assignments with an audit reason. |
| `POST` | `/v1/federation/shifts/employees/{employeeId}/assignments` | **Employee Shift Assignment**: Assigns a valid shift to an employee for an effective date range. |
| `GET` | `/v1/federation/timesheets` | **Timesheet History**: Lists employee/period timesheets within the authorized branch. |
| `POST` | `/v1/federation/timesheets/periods` | **Create Period**: Opens an organization payroll input period. |
| `POST` | `/v1/federation/timesheets/periods/{periodId}/derive` | **Derive Timesheets**: Builds timesheets from SmartTeams attendance within the authorized branch. |
| `POST` | `/v1/federation/timesheets/{timesheetId}/entries` | **Manual Entry**: Adds an audited manual timesheet entry. |
| `POST` | `/v1/federation/timesheets/{timesheetId}/submit` | **Submit Timesheet**: Submits a draft for approval. |
| `POST` | `/v1/federation/timesheets/{timesheetId}/decision` | **Timesheet Decision**: Approves or rejects a submitted timesheet. |

### 3.5 Biometric & WebAuthn Verification

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/federation/employees/{id}/webauthn/enrollments/begin` | **Enrollment Begin**: Initiates WebAuthn/Biometric registration challenge for mobile device. |
| `POST` | `/v1/federation/employees/{id}/webauthn/enrollments/complete` | **Enrollment Complete**: Saves WebAuthn public key credential. |
| `POST` | `/v1/federation/attendance/assertions/begin` | **Assertion Begin**: Generates a biometric clock-in verification challenge. |
| `POST` | `/v1/federation/attendance/assertions/complete` | **Assertion Complete**: Verifies the biometric signature response from the device. |

### 3.6 Leave Management

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/leave/types` | **Leave Types**: Lists leave categories (Casual, Sick, Earned, Unpaid, etc.). |
| `PUT` | `/v1/federation/leave/types/{code}` | **Policy Config**: Creates/updates accrual rules per leave type code. |
| `GET` | `/v1/federation/leave/balances` | **Balance Lookup**: Retrieves employee leave balances. |
| `GET` | `/v1/federation/leave/requests` | **Leave Requests List**: Lists leave applications filtered by branch, employee, or status. |
| `POST` | `/v1/federation/leave/requests` | **Apply for Leave**: Submits a new leave request. |
| `POST` | `/v1/federation/files/leave-attachments` | **Begin Leave Attachment**: Validates a PDF/JPG/PNG file and returns a presigned upload URL scoped to the employee. |
| `POST` | `/v1/federation/files/{fileId}/complete` | **Complete Leave Attachment**: Verifies the uploaded object and makes it available for a leave request. |
| `POST` | `/v1/federation/files/{fileId}/delete` | **Discard Leave Attachment**: Employee-scoped, audited cleanup for an abandoned upload; requires a reason. |
| `POST` | `/v1/federation/leave/requests/{id}/decision` | **Approve/Reject Leave**: Approves or rejects a leave application. |
| `POST` | `/v1/federation/leave/requests/{id}/cancel` | **Cancel Leave**: Withdraws an active leave request. |
| `POST` | `/v1/federation/leave/balances/adjustments` | **Balance Override**: Manually adjusts an employee's leave balance. |

### 3.7 Approval Policies

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/approval-policies` | **Policy List**: Lists active organization approval policies and their ordered steps. |
| `POST` | `/v1/federation/approval-policies` | **Policy Create**: Creates an approval policy using a role, employee, or manager step. |
| `PATCH` | `/v1/federation/approval-policies/{policyId}` | **Policy Update**: Updates an unused policy or its default flag; workflow history prevents unsafe step replacement. |
| `POST` | `/v1/federation/approval-policies/{policyId}/deactivate` | **Policy Deactivate**: Deactivates a policy with an audited reason. |

Federated approval decisions must include `decidedByExternalEmployeeId` alongside the decision status and comment. SmartTeams resolves that employee within the authenticated organization and branch to an active user account, then applies the configured approval policy. Missing, inactive, cross-tenant, or unauthorized approvers are rejected; the federation client is not treated as a substitute for a human approver.

### 3.8 Payroll Processing & Financial Accounting

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/payroll/components` | **Salary Components**: Lists basic pay, allowances, and deduction definitions. |
| `POST` | `/v1/federation/payroll/components` | **Create Salary Component**: Creates an organization-owned earning, deduction, or employer-contribution component. |
| `GET` | `/v1/federation/payroll/calendars` | **Payroll Calendar**: Retrieves monthly processing calendars. |
| `PUT` | `/v1/federation/payroll/calendars/{year}/{month}` | **Calendar Config**: Updates monthly cut-off and processing rules. |
| `GET` | `/v1/federation/payroll/runs` | **Payroll Runs List**: Lists monthly payroll calculations. |
| `GET` | `/v1/federation/payroll/payslips` | **Payslips**: Returns employee payslips with totals and salary-component breakdowns. |
| `GET` | `/v1/federation/payroll/employee-components` | **Employee Salary Components**: Reads effective-dated employee component assignments. |
| `POST` | `/v1/federation/payroll/employee-components` | **Assign Salary Component**: Adds an effective-dated employee component assignment. |
| `POST` | `/v1/federation/payroll/runs` | **Initiate Run**: Starts a new payroll calculation cycle. |
| `POST` | `/v1/federation/payroll/runs/{id}/{action}` | **Advance State**: Advances payroll run through (`calculate`, `approve`, `release`, `lock`). |
| `POST` | `/v1/federation/payroll/adjustments` | **Payroll Adjustments**: Adds one-off bonuses, penalties, or advance recoveries to a run. |
| `GET` | `/v1/federation/payroll/ledger` | **Financial Ledger**: Fetches finalized payroll payouts to log expenses into BlizBooks accounting. |
| `GET` | `/v1/federation/payroll/policy` | **Salary Policy**: Reads the effective-dated gross salary, 30-day basis, HRA, toggle defaults, jurisdiction, and rounding policy. |
| `PUT` | `/v1/federation/payroll/policy` | **Salary Policy Config**: Saves the canonical payroll policy. SmartTeams remains the source of truth. |
| `GET` | `/v1/federation/payroll/statutory-rules` | **Statutory Rules**: Reads jurisdiction-specific EPF, ESIC, and professional-tax rule snapshots. |
| `POST` | `/v1/federation/payroll/statutory-rules` | **Statutory Rule Config**: Saves an effective-dated rule; values must be reviewed for the organization's jurisdiction. |
| `GET` | `/v1/federation/payroll/profile` | **Employee Salary Profile**: Reads gross salary, employee payroll toggles, structure preview, and assigned components. |
| `POST` | `/v1/federation/payroll/profile` | **Employee Salary Profile Config**: Saves gross salary and employee-level payroll/statutory toggles. |
| `POST` | `/v1/federation/payroll/preview` | **Payroll Preview**: Calculates the original salary structure, 30-day proration, statutory deductions, and net estimate without a local BlizBooks calculation. |
| `GET` | `/v1/federation/payroll/advances` | **Salary Advances**: Lists requested, approved, and recovered advances. |
| `POST` | `/v1/federation/payroll/advances` | **Request Advance**: Creates an approval-gated employee advance request. |
| `POST` | `/v1/federation/payroll/advances/{advanceId}/decision` | **Decide Advance**: Approves, rejects, or cancels an advance with a reason. |
| `GET` | `/v1/federation/payroll/payments` | **Employee Payments**: Lists per-line payment state and paid timestamps. |
| `POST` | `/v1/federation/payroll/payments/{lineItemId}/paid` | **Mark Paid**: Records an individual payroll payment method, reference, and timestamp. |

Payroll preview and calculation are gross-based. SmartTeams calculates `Base = min(Gross, max(Gross × base%, minimum base))`, caps HRA at the remaining gross, and treats the remainder as other allowance. Attendance and unpaid leave prorate the original monthly structure over the configured day basis; they never rebuild the structure from a reduced gross. Statutory values are stored as effective-dated jurisdiction rule snapshots and are not hard-coded in BlizBooks.

### 3.9 Statutory Compliance

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/payroll/compliance/profiles/{employeeId}` | **Statutory Profile**: Reads effective-dated employee statutory scheme registrations and rates. |
| `GET` | `/v1/federation/payroll/compliance/schemes` | **Scheme Catalog**: Lists the configured statutory reference schemes and their jurisdiction notes. This is not a calculation result. |
| `POST` | `/v1/federation/payroll/compliance/profiles/{employeeId}` | **Statutory Profile Upsert**: Stores configurable employee statutory profile data. |
| `GET` | `/v1/federation/payroll/compliance/records` | **Compliance Records**: Lists versioned statutory period records with employee and period filters. |
| `POST` | `/v1/federation/payroll/compliance/records/{employeeId}` | **Compliance Record Upsert**: Stores an audited, reason-required statutory period record. |

The compliance API is jurisdiction-neutral until the organization's jurisdiction, registration requirements, official rule versions, retention policy, and filing responsibility are configured. BlizBooks does not calculate statutory amounts locally.

Compliance records follow a controlled lifecycle: `DRAFT` → `READY` → `SUBMITTED` → `ACCEPTED`, with `REJECTED` records returning to `DRAFT` or `READY`. Submitted and accepted records require a filing reference and submission timestamp; accepted records are immutable.

### 3.10 Webhooks & Replay

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/webhooks/smartteams` | **Inbound Webhook**: Real-time webhook listener in BlizBooks for push notifications. |
| `GET` | `/v1/federation/events` | **Event Replay**: Cursor-based replay API to catch up on missed events if webhooks were delayed. |

The OAuth token request uses the standard JSON fields `grant_type`, `client_id`, and
`client_secret`; SmartTeams does not require a client-supplied `scope` field. The
capabilities response includes the enabled tenant capabilities and the additive
`grantableCapabilities` list. BlizBooks uses that list to expose only permission keys
that SmartTeams can accept through employee access synchronization.

---

## 4. Configuration & Environment Variables Reference

| Environment Variable | Type | Description |
| :--- | :--- | :--- |
| `INTEGRATION_SMARTTEAMS_BASE_URL` | String (URL) | Base URL for SmartTeams federation gateway. |
| `INTEGRATION_SMARTTEAMS_FEDERATION_CLIENT_ID` | String | OAuth2 Client ID. |
| `INTEGRATION_SMARTTEAMS_FEDERATION_CLIENT_SECRET` | String | OAuth2 Client Secret. |
| `INTEGRATION_SMARTTEAMS_SECURITY_MODE` | String (`mtls` / `oauth_only_uat`) | Transport security mode. |
| `INTEGRATION_SMARTTEAMS_FEDERATION_MTLS_CERT_PEM` | String (PEM) | Client mTLS public certificate. |
| `INTEGRATION_SMARTTEAMS_FEDERATION_MTLS_KEY_PEM` | String (PEM) | Client mTLS private key. |
| `INTEGRATION_SMARTTEAMS_FEDERATION_MTLS_CA_PEM` | String (PEM) | CA bundle for mTLS verification. |
| `INTEGRATION_SMARTTEAMS_WEBHOOK_CALLBACK_URL` | String (URL) | Public URL for inbound SmartTeams webhooks. |
| `INTEGRATION_SMARTTEAMS_TIME_ZONE` | String | Business calendar timezone (e.g. `Asia/Kolkata`). |
| `INTEGRATION_SMARTTEAMS_REQUEST_TIMEOUT_MS` | Number (ms) | HTTP request timeout limit (default: `35000`). |
| `INTEGRATION_SMARTTEAMS_RECONCILIATION_INTERVAL_MS`| Number (ms) | Cron polling frequency for catch-up worker (default: `300000`). |
