# SmartTeams Workforce Federation Integration

## Executive Summary

This document provides a comprehensive technical reference for the **SmartTeams Workforce Federation Integration** within the **BlizBooks** platform.

SmartTeams provides workforce management capabilities—including HR, Attendance, Leave Management, Payroll, Shifts, and WebAuthn Biometric Device Verification—to BlizBooks outlets while retaining BlizBooks as the primary system of record for employee identity, entitlements, and financial accounting.

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
1. **Identity Ownership**: **BlizBooks owns the employee identity**. When an employee is created or updated in BlizBooks, BlizBooks provisions a **shadow identity** in SmartTeams (`PUT /v1/federation/employees/{id}`).
2. **Asynchronous Projection Engine**: Data fetched from SmartTeams (attendance logs, leave applications, payroll runs) is cached into BlizBooks local PostgreSQL tables (`WorkforceProjectionRecord`), allowing BlizBooks UI to render instantly without waiting for external API network roundtrips.
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
| `GET` | `/v1/federation/capabilities` | **Capabilities Discovery**: Queries enabled features (`employees`, `attendance`, `leave`, `payroll`, `shifts`). |
| `PUT` | `/v1/federation/tenants/{orgId}` | **Tenant Sync**: Syncs Organization details (Name, Timezone, Currency Code). |
| `PUT` | `/v1/federation/tenants/{orgId}/branches/{branchId}` | **Branch Sync**: Syncs Branch/Outlet metadata (Name, Address, City). |
| `POST` | `/v1/federation/webhook-subscriptions` | **Webhook Register**: Registers BlizBooks webhook callback URL (`/api/webhooks/smartteams`). |
| `GET` | `/v1/federation/webhook-signing-keys` | **Public Keys**: Fetches RSA public keys for verifying inbound webhook signatures. |

### 3.2 Employee Identity & Access Control Sync

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `PUT` | `/v1/federation/employees/{employeeId}` | **Shadow Identity**: Syncs employee profile facts (Name, Status: Active/Inactive). |
| `PUT` | `/v1/federation/employees/{id}/branches/{branchId}` | **Branch Assignment**: Assigns an employee to primary or secondary outlets. |
| `PUT` | `/v1/federation/employees/{id}/access` | **Permission Sync**: Pushes granted RBAC permission keys and versioning to SmartTeams. |
| `POST` | `/v1/federation/employees/{id}/sessions/revoke` | **Session Revocation**: Immediately revokes active SmartTeams sessions when an employee is deactivated. |

### 3.3 Attendance & Time Tracking

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/attendance` | **Attendance Logs**: Queries attendance records filtered by branch, employee, date range, or cursor. |
| `GET` | `/v1/federation/attendance/policies` | **Attendance Policies**: Fetches branch rules (grace periods, late penalties, overtimes). |
| `GET` | `/v1/federation/attendance/shifts` | **Shift Definitions**: Fetches branch shift schedules. |
| `PUT` | `/v1/federation/attendance/preferences` | **Geofence & Rules**: Configures outlet check-in preferences and geofence coordinates. |
| `POST` | `/v1/federation/attendance/check-ins` | **Clock-In**: Records employee check-in (supports location verification, device info, idempotency key). |
| `POST` | `/v1/federation/attendance/check-outs` | **Clock-Out**: Records employee check-out. |
| `POST` | `/v1/federation/attendance/{id}/corrections` | **Correction Request**: Submits a request to fix a missed/incorrect clock-in or clock-out. |
| `POST` | `/v1/federation/attendance/{id}/decision` | **Correction Approval**: Approves or rejects an attendance correction request. |

### 3.4 Biometric & WebAuthn Verification

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `POST` | `/v1/federation/employees/{id}/webauthn/enrollments/begin` | **Enrollment Begin**: Initiates WebAuthn/Biometric registration challenge for mobile device. |
| `POST` | `/v1/federation/employees/{id}/webauthn/enrollments/complete` | **Enrollment Complete**: Saves WebAuthn public key credential. |
| `POST` | `/v1/federation/attendance/assertions/begin` | **Assertion Begin**: Generates a biometric clock-in verification challenge. |
| `POST` | `/v1/federation/attendance/assertions/complete` | **Assertion Complete**: Verifies the biometric signature response from the device. |

### 3.5 Leave Management

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/leave/types` | **Leave Types**: Lists leave categories (Casual, Sick, Earned, Unpaid, etc.). |
| `PUT` | `/v1/federation/leave/types/{code}` | **Policy Config**: Creates/updates accrual rules per leave type code. |
| `GET` | `/v1/federation/leave/balances` | **Balance Lookup**: Retrieves employee leave balances. |
| `GET` | `/v1/federation/leave/requests` | **Leave Requests List**: Lists leave applications filtered by branch, employee, or status. |
| `POST` | `/v1/federation/leave/requests` | **Apply for Leave**: Submits a new leave request. |
| `POST` | `/v1/federation/leave/requests/{id}/decision` | **Approve/Reject Leave**: Approves or rejects a leave application. |
| `POST` | `/v1/federation/leave/requests/{id}/cancel` | **Cancel Leave**: Withdraws an active leave request. |
| `POST` | `/v1/federation/leave/balances/adjustments` | **Balance Override**: Manually adjusts an employee's leave balance. |

### 3.6 Payroll Processing & Financial Accounting

| Method | Endpoint | Role & Purpose |
| :--- | :--- | :--- |
| `GET` | `/v1/federation/payroll/components` | **Salary Components**: Lists basic pay, allowances, and deduction definitions. |
| `GET` | `/v1/federation/payroll/calendars` | **Payroll Calendar**: Retrieves monthly processing calendars. |
| `PUT` | `/v1/federation/payroll/calendars/{year}/{month}` | **Calendar Config**: Updates monthly cut-off and processing rules. |
| `GET` | `/v1/federation/payroll/runs` | **Payroll Runs List**: Lists monthly payroll calculations. |
| `POST` | `/v1/federation/payroll/runs` | **Initiate Run**: Starts a new payroll calculation cycle. |
| `POST` | `/v1/federation/payroll/runs/{id}/{action}` | **Advance State**: Advances payroll run through (`calculate`, `approve`, `release`, `lock`). |
| `POST` | `/v1/federation/payroll/adjustments` | **Payroll Adjustments**: Adds one-off bonuses, penalties, or advance recoveries to a run. |
| `GET` | `/v1/federation/payroll/ledger` | **Financial Ledger**: Fetches finalized payroll payouts to log expenses into BlizBooks accounting. |

### 3.7 Webhooks & Replay

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
