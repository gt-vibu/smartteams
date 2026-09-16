# Deployment and rollback

One deployment model: **direct process deployment on managed servers, run by PM2** —
`docs/chore/TECHSTACK.v1.md` ("No containerization"). There is no Docker image, no Dockerfile and
no compose file; the services are Node processes started from a per-commit release directory.

## The artifact and the pipeline

`.gitlab-ci.yml` builds each service (`api`, `web-org`, `web-admin`) and ships it by `rsync` to
`$DEPLOY_ROOT/incoming/<commit>/<service>/` on the server. `scripts/ci/activate-dev-release.sh`
then, for that service:

1. moves it into **`$DEPLOY_ROOT/releases/<commit>/<service>`** — one immutable directory per
   commit, which is what makes rollback possible;
2. for the API, writes `$DEPLOY_ROOT/shared/.env` (mode 600) from **AWS Secrets Manager** — secrets
   never live in the repository or a release directory;
3. for the API, runs **`prisma migrate deploy`** before anything new starts;
4. starts the release under PM2 and waits up to 30 s for its health URL. If it never answers,
   the new release is removed and **the last healthy release is started again** — recorded in
   `$DEPLOY_ROOT/<service>.active` after every successful activation. A failed deploy used to leave
   the service down; `scripts/ci/activate-dev-release.test.sh` (run in CI) pins that it does not.

The old process is stopped before the new one starts, so each activation has a short gap in
service for that component; it is not a zero-downtime rollout.

The script in the repository targets the development environment (`smarteam-*-dev` PM2 names,
ports 3010–3012). A production activation with its own names, ports and secret id is an
infrastructure deliverable; until it exists, production deployment is an external release
condition.

GitHub Actions (`.github/workflows/ci.yml`) is the verification gate; it deploys nothing.

## Migration safety

Migrations run as a **separate step before** the new release starts, never from application
start-up: several instances starting at once would race, and a failed migration inside a starting
process is a crash loop rather than a clear failure.

Because migrations run first, **every migration must be backward compatible with the currently
deployed version** — the old code runs against the new schema for the length of the rollout, and
again if you roll back. In practice:

- add columns nullable or with a default; never `NOT NULL` without one in the same release
- add a column in one release, backfill in a second, enforce in a third
- never rename or drop in the same release that stops using the thing being dropped
- index creation on a large table should be `CONCURRENTLY`, which means its own migration

This is why rollback is starting the previous release and **not** a database rollback.
Down-migrations on payroll data are not part of this procedure; recovering from a bad migration is
`docs/operations/backup-and-recovery.md`, using PITR to just before it ran.

## Deploy

1. **Pre-flight.** Confirm a backup newer than the deploy exists, and that CI is green on the
   commit being deployed.
2. **Migrate** — the activation script does this for the API. Stop if it fails; nothing new has
   started.
3. **Release** to one server.
4. **Verify** before proceeding:
   ```bash
   curl -fsS https://<host>/health/ready     # 200 with database and redis "up"
   ```
   `/health/live` is liveness — the process is running. `/health/ready` is readiness — its
   dependencies answer, and it returns 503 when they do not. There is no bare `/health` route.
5. **Smoke test** the released service: sign in, open a payroll run, confirm a released run still
   shows the net totals it had. Readiness proves the process is up, not that the application is
   correct.
6. **Roll forward** the remaining servers.

Configuration is validated at boot by `packages/config/src/env.ts`. Outside development the process
**refuses to start** with insecure settings — `SESSION_COOKIE_SECURE=false`, plaintext `http://`
CORS origins, Swagger enabled, a missing `METRICS_TOKEN`, or elevated database roles that are not
distinct from the runtime role. A process that exits immediately after a configuration change is
reporting one of these; the reason is in `pm2 logs`.

## Rollback

Rollback is starting the previous release directory. It is fast because it does not touch the
database.

1. Identify the previous good commit in `$DEPLOY_ROOT/releases/`. A release that failed its health
   check has already been rolled back automatically.
2. Start that release's `start.sh` under the service's PM2 name (`pm2 delete <name>`, then
   `pm2 start <release>/<service>/start.sh --name <name> --kill-timeout 130000` for the API), run
   `pm2 save`, and write that `start.sh` path to `$DEPLOY_ROOT/<service>.active`.
3. Verify `/health/ready` and re-run the smoke test.
4. Leave the schema alone. The backward-compatibility rule above is what makes this safe.

**When rollback is not enough** — the schema is damaged, or a migration destroyed data — stop and
follow the restore runbook. Starting an older release does not undo a migration.

## Deploying during payroll

A payroll calculation is a single transaction. If the process is stopped mid-calculation the
transaction rolls back: the run stays in its previous state with no partial line items, and it can
simply be calculated again. Nothing is half-paid. Prefer to deploy when no run is calculating —
`smarteam_payroll_calculation_duration_seconds_count` rising tells you one is.

## Graceful shutdown

`main.ts` calls `enableShutdownHooks()`, and `PrismaService.onModuleDestroy` disconnects all three
clients and ends all three pools. On `SIGINT`/`SIGTERM` the process stops accepting new work,
finishes in-flight requests, and releases its connections.

PM2 waits `kill_timeout` after `SIGINT` before `SIGKILL`; its default is 1.6 seconds. The activation
script starts the API with **`--kill-timeout 130000`** — longer than `PAYROLL_TRANSACTION_TIMEOUT_MS`
(120 s) — so a restart lets an in-flight calculation (about 22 s at 10,000 employees) finish. The web
apps get 10 s.

## Environment

`.env.example` is the complete list; `packages/config/src/env.ts` is the authority on what is
required and what is refused. Secrets come from AWS Secrets Manager into the server's
`shared/.env`, never from a committed file — CI scans history for them.
