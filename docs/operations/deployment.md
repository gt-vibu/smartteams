# Deployment and rollback

One deployment path: **container images built from the repository's `Dockerfile`**. There is
deliberately no second mechanism — a service that can be deployed two ways is a service where
nobody is certain what is running.

## The artifact

`Dockerfile` has three targets sharing one workspace install:

```bash
docker build --target api       -t smarteam/api:$VERSION .
docker build --target web-org   -t smarteam/web-org:$VERSION .
docker build --target web-admin -t smarteam/web-admin:$VERSION .
```

CI builds the API image on every push (job `images`) and boots it, so a change that breaks the
production image fails the build rather than the deploy.

**Tag with an immutable version — the commit SHA.** Never deploy `:latest`: rollback needs a tag
that still means what it meant yesterday.

Each image runs as `USER node`, exposes its port, and carries a `HEALTHCHECK` against
`/health/ready` (API) or `/` (web).

## Migration safety

Migrations run as a **separate step before** the new image is released, never from application
start-up: several instances starting at once would race, and a failed migration inside a starting
container is a crash loop rather than a clear failure.

```bash
docker run --rm -e DATABASE_URL="$DATABASE_URL" smarteam/api:$VERSION pnpm db:deploy
```

Because migrations run first, **every migration must be backward compatible with the currently
deployed version** — the old code runs against the new schema for the length of the rollout, and
again if you roll back. In practice:

- add columns nullable or with a default; never `NOT NULL` without one in the same release
- add a column in one release, backfill in a second, enforce in a third
- never rename or drop in the same release that stops using the thing being dropped
- index creation on a large table should be `CONCURRENTLY`, which means its own migration

This is why rollback is an image-tag change and **not** a database rollback. Down-migrations on
payroll data are not part of this procedure; recovering from a bad migration is
`docs/operations/backup-and-recovery.md`, using PITR to just before it ran.

## Deploy

1. **Pre-flight.** Confirm a backup newer than the deploy exists, and that CI is green on the
   commit being deployed.
2. **Migrate** as above. Stop here if it fails; nothing has been released yet.
3. **Release** the new image to one instance.
4. **Verify** before proceeding:
   ```bash
   curl -fsS https://<host>/health/ready     # 200 with database and redis "up"
   ```
   `/health/live` is liveness — the process is running. `/health/ready` is readiness — its
   dependencies answer, and it returns 503 when they do not. An orchestrator should gate traffic on
   readiness and restart on liveness. There is no bare `/health` route: pointing a probe at it
   returns 404, which an orchestrator reads as a failing container.
5. **Smoke test** against the released instance: sign in, open a payroll run, confirm a released
   run still shows the net totals it had. Readiness proves the process is up, not that the
   application is correct.
6. **Roll forward** the remaining instances.

Configuration is validated at boot by `packages/config/src/env.ts`. Outside development the process
**refuses to start** with insecure settings — `SESSION_COOKIE_SECURE=false`, plaintext `http://`
CORS origins, Swagger enabled, a missing `METRICS_TOKEN`, or elevated database roles that are not
distinct from the runtime role. A container that exits immediately after a config change is
reporting one of these; the reason is on stderr.

## Rollback

Rollback is redeploying the previous image tag. It is fast because it does not touch the database.

1. Identify the previous good tag (the commit SHA deployed before this one).
2. Release it to all instances.
3. Verify `/health/ready` and re-run the smoke test.
4. Leave the schema alone. The backward-compatibility rule above is what makes this safe.

**When rollback is not enough** — the schema is damaged, or a migration destroyed data — stop and
follow the restore runbook. Rolling the image back does not undo a migration.

## Deploying during payroll

A payroll calculation is a single transaction. If the container is stopped mid-calculation the
transaction rolls back: the run stays in its previous state with no partial line items, and it can
simply be calculated again. Nothing is half-paid.

What is lost is the work, not the integrity. `enableShutdownHooks()` plus explicit pool teardown
means an orderly stop waits for in-flight work; a `SIGKILL` does not. Prefer to deploy when no run
is calculating — `smarteam_payroll_calculation_duration_seconds_count` rising tells you one is.

## Graceful shutdown

`main.ts` calls `enableShutdownHooks()`, and `PrismaService.onModuleDestroy` disconnects all three
clients and ends all three pools. On `SIGTERM` the process stops accepting new work, finishes
in-flight requests, and releases its connections. Give the orchestrator a termination grace period
longer than the slowest expected request — `PAYROLL_TRANSACTION_TIMEOUT_MS` is the upper bound.

## Environment

`.env.example` is the complete list; `packages/config/src/env.ts` is the authority on what is
required and what is refused. Secrets come from the platform's secret manager, never from an image
layer or a committed file — CI scans history for both.
