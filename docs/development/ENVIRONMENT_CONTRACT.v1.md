# Smarteam Environment Contract

The root `.env.example` is the canonical environment contract and contains intentionally invalid placeholder values. Copy it to `.env`, replace every placeholder for the target environment, and let `@smarteam/config` validate runtime configuration before the API starts. Production and staging values must come from the deployment secret manager, not committed files.

## Ownership

| Area | Variables | Consumer | Required in production |
|---|---|---|---|
| Runtime | `NODE_ENV`, `LOG_LEVEL`, `API_*`, `WEB_*`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS` | API and deployment | Yes |
| PostgreSQL | `DATABASE_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_PLATFORM_URL` | API runtime, system workers, platform operations, Prisma CLI | Yes; all three must be distinct outside development |
| Redis | `REDIS_*` | API, BullMQ workers | Yes |
| Object storage | `AWS_REGION`, `AWS_S3_BUCKET`, optional endpoint, `FILE_DELETION_RETENTION_DAYS` | API and storage workers | Yes |
| Native auth | `JWT_*`, `SESSION_*`, password-hash cost | API | Yes |
| Federation security | `FEDERATION_*` (including `FEDERATION_RATE_LIMIT_PER_MINUTE`, `FEDERATION_TOKEN_RATE_LIMIT_PER_MINUTE`, `FEDERATION_WEBHOOK_ALLOWED_HOSTS`) | Federation module and webhook workers | Yes |
| Observability | `OTEL_*`, `PROMETHEUS_ENABLED`, `SENTRY_DSN` | API and deployment | Metrics and health yes; exporters optional |
| Browser-safe config | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_ENV` | Both Next.js applications | Yes |

## Rules

- Only variables prefixed `NEXT_PUBLIC_` may be read by browser bundles.
- Database, Redis, S3, JWT, federation, and observability secrets must never be exposed to either frontend application.
- Client secrets are hashed before persistence. Signing private keys and bootstrap secrets come from the secret manager.
- S3 buckets remain private. The API creates short-lived presigned URLs after authorization and stores file ownership metadata in PostgreSQL.
- Local development may use `.env` copied from `.env.example`; `.env` is ignored by Git.
- Staging and production must set `SESSION_COOKIE_SECURE=true`, use HTTPS URLs, configure mTLS material at the proxy, and use managed PostgreSQL, Redis, S3, and secrets.
- `DATABASE_URL` must use a least-privilege runtime role that cannot bypass RLS. `DATABASE_SYSTEM_URL` is reserved for audited system workers, and `DATABASE_PLATFORM_URL` is reserved for platform operators; deployment must provision these roles separately and must not reuse the runtime URL. RLS does not trust `app.platform_bypass`; elevated access comes only from the PostgreSQL role privileges on the system/platform connections.
- The reverse proxy must terminate and verify TLS client certificates, strip any incoming client-certificate fingerprint header, inject the verified fingerprint, and keep the API private from direct federation traffic. The API trusts this header only from the configured proxy hop count.
- Federation webhook callback hosts are restricted by `FEDERATION_WEBHOOK_ALLOWED_HOSTS`; use exact partner hostnames or explicit subdomain patterns. The API rejects credentials, non-HTTPS URLs, private addresses, and non-443 ports.
- `FEDERATION_BOOTSTRAP_SECRET` exists only to initialize or rotate the first platform client. It is not a permanent integration credential.
