# Diagnosing a production incident

Start here. Each section is a question an operator actually asks, and the signal that answers it.

## What you have

| Surface | Where | Notes |
|---|---|---|
| Liveness | `GET /health/live` | The process is running. There is no bare `/health` route. |
| Readiness | `GET /health/ready` | Dependencies answer; reports `database` and `redis` with latency. |
| Metrics | `GET /metrics` | Prometheus text. Requires `Authorization: Bearer $METRICS_TOKEN` outside development. |
| Logs | stdout, JSON (pino) | Carries request and correlation ids. Credentials are removed, not masked. |
| Audit trail | `audit_events` table | Who changed what, with reason. Survives restore. |

Every metric is labelled with bounded values only. **No metric is dimensioned by tenant**, by
employee, or by run id — that would grow one time series per tenant. To attribute an incident to a
tenant, use the logs, which carry the organisation id per request.

## Is the API healthy?

```bash
curl -fsS https://<host>/health/live     # process
curl -fsS https://<host>/health/ready    # process + dependencies
```

Readiness returns the failing dependency by name. If liveness passes and readiness fails, the
process is fine and something it depends on is not — go to the relevant section below.

## Are requests failing, and which endpoint?

```promql
sum by (route, status) (rate(smarteam_http_requests_total{status="5xx"}[5m]))
```

`route` is the registered path template, so it names the handler directly. For latency:

```promql
histogram_quantile(0.95, sum by (route, le) (rate(smarteam_http_request_duration_seconds_bucket[5m])))
```

Then find the requests in the logs by that route and read the error classification. A `4xx` rise
without a `5xx` rise is usually a client or a rate limit, not an outage.

## Is PostgreSQL healthy?

Readiness reports it first. Then:

```promql
smarteam_db_pool_connections{state="waiting"}          # callers queued for a connection
rate(smarteam_db_pool_exhaustion_total[5m])            # how often that happens
histogram_quantile(0.95, rate(smarteam_db_statement_duration_seconds_bucket[5m]))
rate(smarteam_db_statements_total[5m])                 # by operation
```

- **`waiting` persistently above zero** — the pool is too small for the load. Raise
  `DATABASE_POOL_MAX` *only* within the budget in `database-pooling.md`, or add PgBouncer.
- **Statement duration climbing with a flat statement rate** — the database is slow, not the
  application. Check locks and autovacuum on the server.
- **Statement *rate* spiking on one route** — something started issuing many queries per request.
  Correlate with `smarteam_http_requests_total` for that route.

`DATABASE_STATEMENT_TIMEOUT_MS` bounds any single statement, so a runaway query releases its
connection rather than holding it. A rise in errors mentioning `statement timeout` means that
ceiling is being hit — find the query, do not simply raise the ceiling.

## Is Redis healthy?

Readiness reports it with latency. Redis backs rate limiting and short-lived tokens; if it is down
readiness fails and the instance should be pulled from rotation rather than serve with those
protections degraded.

## Is payroll slow, or failing?

```promql
histogram_quantile(0.95, rate(smarteam_payroll_calculation_duration_seconds_bucket[30m]))
rate(smarteam_payroll_runs_total{outcome="failed"}[30m])
rate(smarteam_payroll_runs_total{outcome="timed_out"}[30m])
histogram_quantile(0.95, rate(smarteam_payroll_lines_per_run_bucket[30m]))
```

`outcome="timed_out"` is separated deliberately: it means a run exceeded
`PAYROLL_TRANSACTION_TIMEOUT_MS` and is the signal that a tenant has outgrown the current bound —
a different problem from a run that failed on its inputs.

Duration scales with headcount, which `smarteam_payroll_lines_per_run` reports. Measured reference,
on one developer machine with 20 attendance days per employee: 1,000 employees ≈ 1.0s;
5,000 ≈ 4.0s; 10,000 ≈ 7.8s. Materially worse than that for a comparable headcount means look at
the database, not the calculation.

A failed calculation leaves no partial state — it is one transaction. The run stays as it was and
can be calculated again.

## Are background jobs stuck?

```promql
rate(smarteam_background_jobs_total{outcome="failed"}[15m])
```

Outbox delivery is the Federation dispatcher's concern and is out of scope for this runbook.

## Are files failing?

```promql
rate(smarteam_storage_operations_total{outcome="failed"}[5m])
```

Object storage is not on the readiness path — the API stays up when S3 is unavailable and file
operations fail individually. That is intentional: an outage of the storage provider should
degrade uploads, not take payroll offline.

## Are authentication failures increasing?

```promql
sum by (reason) (rate(smarteam_auth_failures_total[5m]))
sum(rate(smarteam_http_requests_total{route=~".*auth.*",status="4xx"}[5m]))
```

A rise concentrated on one account is credential stuffing meeting the rate limiter working as
intended. A rise spread across many accounts right after a deploy is more likely a configuration
change — check cookie settings and `CORS_ORIGINS` first.

## What happens when a dependency dies

| Failure | Behaviour |
|---|---|
| PostgreSQL unavailable | Readiness fails; requests error. No data loss — in-flight transactions roll back. |
| Redis unavailable | Readiness fails. Pull from rotation rather than serve without rate limiting. |
| Object storage unavailable | API stays up; file operations fail individually and are counted. |
| API crashes mid-payroll | Transaction rolls back. The run is unchanged and can be recalculated. |
| API crashes mid-approval | Same — one transaction, no partial state. |
| Duplicate simultaneous requests | Guarded by optimistic `version` columns and state-machine rules; see `idempotency.md`. |
| Deploy during payroll | The run rolls back and must be recalculated. Nothing is half-paid. |

## Escalation

Data loss or suspected corruption goes to `backup-and-recovery.md` immediately — do not attempt
repair in place on the live database. A tenant isolation concern is a P0: capture the request and
correlation ids from the logs before anything else, because those are what make it reconstructable.
