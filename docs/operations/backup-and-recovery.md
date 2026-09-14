# Backup and recovery

`docs/chore/TECHSTACK.v1.md` requires scheduled dumps plus WAL archiving and point-in-time
recovery, because the data is payroll. This document is how that requirement is met, what is
implemented in the repository, and the one part that is server configuration rather than code.

## What is implemented here

| Piece | Where | Runs |
|---|---|---|
| Scheduled logical backup | `scripts/backup-database.mjs` | `pnpm db:backup` |
| Artifact integrity | SHA-256 written beside each dump | part of the above |
| Retention pruning | `BACKUP_RETENTION_DAYS` | part of the above |
| Restore drill | `scripts/verify-restore.mjs` | `pnpm db:verify-restore` |
| Automated drill | `.github/workflows/ci.yml`, job `backup-restore` | every push |

Both scripts accept the Prisma-style `DATABASE_URL` from `.env.example` (`?schema=public`): Prisma's
own parameters are removed before the URL reaches `pg_dump`/`pg_restore`, and libpq parameters such
as `sslmode` are kept. A failed dump removes its partial file rather than leaving it as the newest
artifact.

The drill restores into a scratch database and asserts the migration ledger, row-level security
(tables *and* policies), and per-table row counts. It drops the scratch database afterwards, including
on failure.

## What is not, and cannot be, implemented here

**Continuous WAL archiving and PITR is PostgreSQL server configuration.** It depends on which
PostgreSQL the deployment runs and where archives are stored, and neither is recorded anywhere in
this repository. Guessing a cloud vendor would produce configuration that looks authoritative and
is wrong.

**External dependency — cannot responsibly implement without the production PostgreSQL host and
an archive storage location.** Two supported shapes, both satisfying the requirement:

### Option A — managed PostgreSQL (recommended)

RDS, Cloud SQL and Azure Database all provide continuous archiving and PITR as a setting. Enable
it and record, in your infrastructure repository:

- automated backups enabled, retention ≥ 14 days
- PITR enabled (`BackupRetentionPeriod` > 0 on RDS; `pointInTimeRecoveryEnabled` on Cloud SQL)
- backups encrypted at rest, in a different failure domain from the primary

The scripts here remain useful alongside it: a logical dump is portable between hosts and versions,
which a managed snapshot is not, and the CI drill keeps the restore path exercised.

### Option B — self-managed PostgreSQL

Set on the server (values are the template; the archive command is site-specific):

```conf
# postgresql.conf
wal_level = replica
archive_mode = on
archive_timeout = 300              # bounds RPO at five minutes even when write volume is low
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'   # replace with your object store
max_wal_senders = 3
```

Take a periodic base backup with `pg_basebackup`, retain it alongside the WAL segments, and
recover by restoring the base backup and setting `recovery_target_time`.

**Do not use `archive_command = 'cp ...'` to a local disk in production.** The archive must live
somewhere that survives the loss of the database host.

## Objectives

| | Target | Determined by |
|---|---|---|
| **RPO** | ≤ 5 minutes | `archive_timeout`; without WAL archiving the RPO degrades to the dump interval |
| **RTO** | ≤ 60 minutes for a full restore | measured 2026-09-15: a 66 MiB dump (65k employees, 1.28M attendance rows) took 24s to write and 34s to restore locally; the RTO allowance is for provisioning, credentials and verification, not the restore itself |

These are targets the configuration must be set to meet, not guarantees. Re-measure after the
database grows an order of magnitude.

## Storage

- Backups must not live on the database host.
- Backups must not live in the repository — `backups/` is git-ignored.
- Encrypt at rest, restrict read access to the operators who run recovery.
- Credentials for the archive destination belong in the secret manager, never in `archive_command`
  in plain text if it can be avoided.

## Failure detection

A backup job that stops running looks exactly like one with nothing to do, so alert on both:

1. **Non-zero exit** from `pnpm db:backup`. The script exits 1 on dump failure and on a zero-byte
   artifact; it never reports success for an empty file.
2. **Absence of a fresh artifact.** Alert when the newest object in the backup location is older
   than the schedule interval plus one period.
3. **Drill failure.** The `backup-restore` CI job failing means the restore path is broken; treat
   it with the same seriousness as a failing test, because it is one.

## Runbook: restore

1. **Stop writes.** Take the API out of rotation. A restore into a database still receiving writes
   produces a database nobody can reason about.
2. **Choose the target.** For corruption or a bad migration, PITR to just before the event. For
   total loss, the most recent base backup plus WAL replay, or the newest logical dump.
3. **Verify the artifact** before depending on it:
   ```bash
   sha256sum -c smarteam-<stamp>.dump.sha256
   ```
4. **Restore into a new database, never over the live one.** Keeping the damaged database intact
   preserves the evidence and leaves a way back.
   ```bash
   createdb smarteam_restored
   pg_restore --dbname "$RESTORED_URL" --no-owner --no-privileges --jobs=4 smarteam-<stamp>.dump
   ```
5. **Verify before cutting over:**
   ```bash
   DATABASE_URL="$RESTORED_URL" pnpm db:verify-restore smarteam-<stamp>.dump
   ```
   Then check application-level truth: a known tenant's employee count, and that its most recent
   `RELEASED` payroll run has the line items and net totals it had before.
6. **Cut over** by pointing `DATABASE_URL` at the restored database and returning the API to
   rotation. Do not rename databases underneath a running application.
7. **Re-run migrations** only after confirming the ledger is clean (`pnpm db:deploy` is a no-op on
   a correctly restored database — if it wants to apply something, stop and find out why).

## Runbook: drill

Run quarterly, and after any change to the schema or these scripts:

```bash
pnpm db:backup
pnpm db:verify-restore
```

Record how long the restore took. That number is the input to the RTO above; if it grows past the
target, the recovery plan needs to change before an incident proves it.
