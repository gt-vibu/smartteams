# Smarteam Environment Contract

The root `.env.example` is the canonical environment contract and contains intentionally invalid placeholder values. Copy it to `.env`, replace every placeholder for the target environment, and let `@smarteam/config` validate runtime configuration before the API starts. Production and staging values must come from the deployment secret manager, not committed files.

## Ownership

| Area | Variables | Consumer | Required in production |
|---|---|---|---|
| Runtime | `NODE_ENV`, `LOG_LEVEL`, `API_*`, `WEB_*`, `CORS_ORIGINS`, `TRUST_PROXY_HOPS` | API and deployment | Yes |
| PostgreSQL | `DATABASE_URL` | API, Prisma CLI | Yes |
| Redis | `REDIS_*` | API, BullMQ workers | Yes |
| Object storage | `AWS_REGION`, `AWS_S3_BUCKET`, optional endpoint and KMS key | API and storage workers | Yes |
| Native auth | `JWT_*`, `SESSION_*`, password-hash cost | API | Yes |
| Federation security | `FEDERATION_*` | Federation module and webhook workers | Yes |
| Observability | `OTEL_*`, `PROMETHEUS_ENABLED`, `SENTRY_DSN` | API and deployment | Metrics and health yes; exporters optional |
| Browser-safe config | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_ENV` | Both Next.js applications | Yes |

## Rules

- Only variables prefixed `NEXT_PUBLIC_` may be read by browser bundles.
- Database, Redis, S3, JWT, federation, and observability secrets must never be exposed to either frontend application.
- Client secrets are hashed before persistence. Signing private keys and bootstrap secrets come from the secret manager.
- S3 buckets remain private. The API creates short-lived presigned URLs after authorization and stores file ownership metadata in PostgreSQL.
- Local development may use `.env` copied from `.env.example`; `.env` is ignored by Git.
- Staging and production must set `SESSION_COOKIE_SECURE=true`, use HTTPS URLs, configure mTLS material at the proxy, and use managed PostgreSQL, Redis, S3, and secrets.
- `FEDERATION_BOOTSTRAP_SECRET` exists only to initialize or rotate the first platform client. It is not a permanent integration credential.
