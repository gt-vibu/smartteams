# Connection pooling

## Why this needs a budget

The API opens **three** pools per process, not one:

| Pool | Role | Purpose |
|---|---|---|
| `runtime` | `DATABASE_URL` | Least-privileged. Every tenant request. Row-level security applies. |
| `system` | `DATABASE_SYSTEM_URL` | Elevated. Cross-tenant reads that must work before a tenant context exists (sign-in, account activation). |
| `platform` | `DATABASE_PLATFORM_URL` | Elevated. Audited platform-operator bypass. |

They are separate roles deliberately, so a tenant request can never reuse a connection permitted
to bypass RLS. The consequence for capacity is that **each process holds up to three times
`DATABASE_POOL_MAX` connections**:

```
peak connections = 3 × DATABASE_POOL_MAX × instances
```

That must fit inside the server's `max_connections` with headroom for migrations, `psql`, backups
and monitoring. Reserve roughly 20 connections for those.

```
3 × DATABASE_POOL_MAX × instances  ≤  max_connections − 20
```

## Worked sizing

| `max_connections` | Instances | Safe `DATABASE_POOL_MAX` |
|---:|---:|---:|
| 100 | 1 | 26 (default 10 is comfortable) |
| 100 | 2 | 13 |
| 100 | 4 | 6 |
| 200 | 4 | 15 |
| 500 | 8 | 20 |

The default of 10 mirrors node-postgres' own and suits one or two instances against a stock
PostgreSQL. **Beyond about three instances, lower it or put PgBouncer in front** — the arithmetic
above stops being satisfiable before the application stops being able to use the connections.

A larger pool is not faster. Past the point where PostgreSQL can execute concurrently — roughly
`(2 × cores) + effective_spindle_count` — extra connections add context switching and lock
contention, not throughput.

## Settings

| Variable | Default | What it does |
|---|---:|---|
| `DATABASE_POOL_MAX` | 10 | Connections per pool. Multiply by three, then by instances. |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` | 10000 | Idle connections are returned to the server rather than held. |
| `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | 5000 | How long a caller waits for a connection before failing. Fails fast rather than queueing forever. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 30000 | Server-side ceiling per statement, so a runaway query releases its connection. |

`DATABASE_STATEMENT_TIMEOUT_MS` applies to individual statements, not to a transaction. Payroll's
transaction is bounded separately by `PAYROLL_TRANSACTION_TIMEOUT_MS`; its individual statements
are set-based and comfortably inside the statement ceiling.

## If you use PgBouncer

Use **transaction** pooling. The application sets `app.organization_id` and friends with
`set_config(..., true)` — the third argument makes them transaction-scoped, which is exactly what
transaction pooling preserves. Session pooling would work but gives up most of the benefit;
statement pooling would break the tenant context and must not be used.

## Watching it

```promql
smarteam_db_pool_connections{pool="runtime",state="waiting"}
rate(smarteam_db_pool_exhaustion_total[5m])
```

`waiting` persistently above zero means callers are queueing for a connection. Raise
`DATABASE_POOL_MAX` only within the budget above; if the budget is already spent, the answer is
PgBouncer or fewer, larger instances — not a bigger number.
