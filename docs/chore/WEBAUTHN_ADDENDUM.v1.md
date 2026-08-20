# Smarteam V2 — Addendum: WebAuthn / Biometric Attendance Verification

**Status:** Approved addition to PRD and Schema — required before/alongside federation attendance implementation
**Reason for addendum:** The BlizBooks integration guide (§3.4) specifies four federation endpoints for WebAuthn/biometric verification that were not covered in the original PRD or schema. This document closes that gap so development is not blocked.

---

## 1. Purpose

Smarteam must support biometric verification of attendance check-in/check-out as an additional or alternative verification method to GPS geofencing, using the **WebAuthn standard** (public-key credential enrollment on a device, challenge/assertion verification at clock-in time). This applies to both native and federated (BlizBooks) employees, since the integration guide exposes this as a federation capability BlizBooks can invoke on behalf of its employees.

This is a distinct domain from attendance itself: attendance already exists (punches, geofencing, corrections); WebAuthn is a **verification method** that attendance can optionally require or accept, not a replacement for the attendance domain.

---

## 2. Functional Requirements

- **FR-60**: The system shall support enrolling a WebAuthn credential (public key) for an employee's device, via a two-step challenge/response flow: an enrollment challenge is issued, the device signs it with a newly generated key pair, and the resulting public key credential is verified and stored.
- **FR-61**: The system shall support multiple enrolled credentials per employee (e.g., more than one device), each independently identifiable and independently revocable.
- **FR-62**: The system shall support a biometric assertion flow at clock-in/clock-out time: an assertion challenge is issued, the device signs it using a previously enrolled private key, and the system verifies the signature against the stored public key before accepting the attendance punch as biometrically verified.
- **FR-63**: The system shall record whether a given attendance punch was biometrically verified, and if so, which enrolled credential was used — this is metadata on the punch, not a separate attendance record.
- **FR-64**: The system shall allow an organization to configure whether biometric verification is required, optional, or unused for attendance, independently of the existing GPS geofencing configuration — the two verification methods (location and biometric) are independent and may both apply, either apply alone, or neither apply, per organization/branch policy.
- **FR-65**: The system shall allow an HR Admin or Platform Super Admin to revoke a specific enrolled credential (e.g., lost/replaced device) without affecting the employee's other enrolled credentials or their account status.
- **FR-66**: The system shall reject an assertion if the signature counter returned by the device does not strictly increase relative to the last recorded counter for that credential, as a standard WebAuthn clone-detection measure — and shall flag the credential for review rather than silently accepting a suspicious assertion.
- **FR-67**: Every enrollment and assertion challenge shall be single-use and time-bounded; an expired or already-consumed challenge shall be rejected.

## 3. Non-Functional Requirements

- **NFR-26**: Enrollment and assertion flows shall follow the WebAuthn/FIDO2 specification's standard verification steps (origin/RP ID validation, challenge matching, signature verification, counter check) — this is not a custom-designed challenge/response scheme.
- **NFR-27**: Public key credential material shall be stored as public key data only; no private key material ever exists server-side, consistent with the WebAuthn model.
- **NFR-28**: A challenge value shall never be reused across requests and shall be invalidated immediately upon successful consumption, independent of its expiry time.
- **NFR-29**: Biometric verification shall be implemented as its own domain service (e.g., a credential/assertion service), called by the attendance domain service as an optional verification step — attendance business logic must not embed WebAuthn cryptographic verification inline within itself, matching the existing architecture principle of single-responsibility domain services.

---

## 4. Database Schema Addition

Two new tables, both tenant-scoped and consistent with the conventions already established in the schema document (UUID primary keys, `timestamptz` in UTC, `organization_id` on every tenant-owned row, RLS applies).

### 4.1 `webauthn_credentials`

One enrolled device credential per row.

| Column | Type | Null | Default | Definition |
|---|---:|---:|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key. |
| `organization_id` | `uuid` | No | | Tenant key. |
| `employee_id` | `uuid` | No | | FK `employees.id`. |
| `credential_id` | `text` | No | | Base64url-encoded WebAuthn credential ID, as returned by the authenticator. |
| `public_key` | `bytea` | No | | COSE-encoded public key. |
| `sign_count` | `bigint` | No | `0` | Last recorded signature counter, for clone detection (FR-66). |
| `device_label` | `text` | Yes | | Optional human-readable label (e.g., "John's iPhone"). |
| `transports` | `text[]` | No | `{}` | Reported transport methods (e.g., `internal`, `usb`, `nfc`). |
| `attestation_format` | `text` | Yes | | Attestation statement format, if captured at enrollment. |
| `status` | `credential_status` | No | `ACTIVE` | Reuses the existing `credential_status` enum (`ACTIVE`, `REVOKED`, `EXPIRED`). |
| `enrolled_at` | `timestamptz` | No | `now()` | Enrollment completion time. |
| `last_used_at` | `timestamptz` | Yes | | Last successful assertion time. |
| `revoked_at` | `timestamptz` | Yes | | Revocation time (FR-65). |
| `revoked_by_user_id` | `uuid` | Yes | | FK `users.id`; who revoked it. |
| `created_at` | `timestamptz` | No | `now()` | Creation time. |
| `updated_at` | `timestamptz` | No | `now()` | Last update time. |

**Constraints/indexes:** Unique on `credential_id`. Index `(organization_id, employee_id, status)`.

### 4.2 `webauthn_challenges`

One single-use challenge per enrollment or assertion attempt. Short-lived; may be purged after expiry via a background job, consistent with the treatment of other short-lived records elsewhere in the schema.

| Column | Type | Null | Default | Definition |
|---|---:|---:|---|---|
| `id` | `uuid` | No | `gen_random_uuid()` | Primary key. |
| `organization_id` | `uuid` | No | | Tenant key. |
| `employee_id` | `uuid` | No | | FK `employees.id`. |
| `purpose` | `text` | No | | `ENROLLMENT` or `ASSERTION` (enum recommended: `webauthn_challenge_purpose`). |
| `challenge` | `text` | No | | Base64url-encoded random challenge value. |
| `related_credential_id` | `uuid` | Yes | | FK `webauthn_credentials.id`; set for assertion challenges once a credential is targeted, null for enrollment. |
| `related_attendance_punch_id` | `uuid` | Yes | | FK `attendance_punches.id`; links an assertion challenge to the punch it's verifying, once known. |
| `status` | `text` | No | `PENDING` | `PENDING`, `CONSUMED`, `EXPIRED` (enum recommended: `webauthn_challenge_status`). |
| `expires_at` | `timestamptz` | No | | Expiry time — short window (e.g., minutes, not hours). |
| `consumed_at` | `timestamptz` | Yes | | Consumption time (FR-67). |
| `created_at` | `timestamptz` | No | `now()` | Creation time. |

**Constraints/indexes:** Index `(organization_id, employee_id, purpose, status)`. Index `(expires_at)` to support the expiry cleanup job.

### 4.3 Modification to existing `attendance_punches` table

Add two columns to the already-defined `attendance_punches` table (FR-63):

| Column | Type | Null | Default | Definition |
|---|---:|---:|---|---|
| `biometric_verified` | `boolean` | No | `false` | Whether this punch was biometrically verified. |
| `webauthn_credential_id` | `uuid` | Yes | | FK `webauthn_credentials.id`; which credential verified this punch, if any. |

### 4.4 Modification to organization/branch attendance configuration

Wherever geofence enforcement configuration lives (per the earlier geofencing addition — organization- or branch-level settings), add:

- A parallel, independent flag: `biometric_verification_mode` (`DISABLED`, `OPTIONAL`, `REQUIRED`), per FR-64. This is independent of the geofence enforcement flag, not a shared enum, since the two verification methods can be combined in any combination.
- Ownership provenance for **both** the geofence configuration and the new `biometric_verification_mode` flag, consistent with the generalized model in Section 7 below: an `owner_source` (`NATIVE` / `FEDERATED`) and nullable `owner_client_id` (FK `federation_clients.id`) per setting, defaulting to `NATIVE` for every organization regardless of whether it has any federation client at all. These are two independent settings with independent ownership — one being federated does not imply the other is.

---

## 5. Federation Endpoint Mapping

These map directly to the four endpoints already named in the integration guide (§3.4):

| Endpoint | Domain operation |
|---|---|
| `POST /v1/federation/employees/{id}/webauthn/enrollments/begin` | Create a `webauthn_challenges` row with `purpose = ENROLLMENT`, return the challenge. |
| `POST /v1/federation/employees/{id}/webauthn/enrollments/complete` | Verify the response against the pending enrollment challenge, create the `webauthn_credentials` row, mark the challenge `CONSUMED`. |
| `POST /v1/federation/attendance/assertions/begin` | Create a `webauthn_challenges` row with `purpose = ASSERTION`, targeting the employee's enrolled credential(s), return the challenge. |
| `POST /v1/federation/attendance/assertions/complete` | Verify the signed assertion against the stored public key and current `sign_count`, update `sign_count`/`last_used_at`, mark the challenge `CONSUMED`, and — if invoked as part of a check-in/check-out flow — set `biometric_verified = true` and `webauthn_credential_id` on the resulting `attendance_punches` row. |

As with the rest of the federation layer, these are thin adapters — the actual WebAuthn verification logic (FR-60–FR-67, NFR-26–NFR-29) lives in a dedicated domain service, called identically whether triggered natively or via federation.

---

## 6. Ownership Resolution — No Longer Open

Both settings introduced in this addendum use the generalized ownership model defined in Section 7: `owner_source` (`NATIVE` / `FEDERATED`) plus `owner_client_id`, defaulting to `NATIVE` for every organization. Neither setting is hardcoded to BlizBooks specifically, and neither is left as an unresolved design question:

- **Geofence configuration**: defaults to `NATIVE`-owned for every organization. Ownership transfers to a specific federation client only through an explicit grant (Section 7), which should be considered for BlizBooks specifically once confirmed, since `PUT /v1/federation/attendance/preferences` in the integration guide (§3.3) signals they may want to push this.
- **`biometric_verification_mode`**: defaults to `NATIVE`-owned for every organization. No signal in the integration guide suggests BlizBooks intends to control this, so no grant should be created for BlizBooks by default — this can be revisited if that changes.

Nothing here blocks development. Build both settings with the ownership columns from the start; whether any specific federation client is ever granted ownership of either is a per-organization operational decision made later through the grant mechanism, not a code change.

## 7. Required Generalization: Ownership Model Beyond BlizBooks

This is a correction to the schema document, surfaced by this addendum but not limited to it. It should be applied consistently, not just to the two settings above.

**The issue:** `employee_field_ownership.owner_source` is currently defined as an enum with exactly two values: `NATIVE` and `BLIZBOOKS`. This hardcodes a specific federation client's name into a core enum. It works today because BlizBooks is the only federation client, but it directly contradicts the architecture principle — already established elsewhere in this project — that domain logic and schema must not special-case a specific partner, so that onboarding a future integration never requires a code or schema change.

**The fix:** Generalize `owner_source` to `NATIVE` / `FEDERATED` everywhere it appears (including the existing `employee_field_ownership` table, and the two new settings introduced in Section 4.4 of this addendum). Wherever `owner_source = FEDERATED`, the accompanying `owner_client_id` (already present as a nullable FK to `federation_clients.id` in `employee_field_ownership`) identifies *which* federation client owns it. This is not a new mechanism — `owner_client_id` already exists for exactly this purpose; only the enum needs to stop naming a specific partner.

**Why this matters for standalone and future integrations:**
- A standalone organization with no federation client at all trivially has every field/setting `NATIVE`-owned by default — there is no client to grant ownership to, so nothing needs special-casing.
- Onboarding a second federation client in the future means creating grants for that client, exactly as you would for BlizBooks — no enum change, no new code path, no schema migration required at that point.
- Ownership is decided per organization, per field/setting, per client — never inferred from a fixed assumption like "this org is a BlizBooks org, so BlizBooks owns everything."

**Action:** Apply this correction to the schema document's `owner_source` enum definition and to `employee_field_ownership` before development proceeds on any ownership-sensitive field — including the geofence and biometric settings in this addendum, which should be built with the generalized model from the start rather than needing a follow-up fix.