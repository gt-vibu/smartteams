# Smarteam

Smarteam is the backend-first HR and workforce platform rewrite. It is maintained as a separate repository so the existing BlizBooks federation contract can remain stable while the new platform is built.

## Workspace

- `apps/api` — NestJS API, Prisma data layer, Redis/BullMQ infrastructure, S3 storage, health, metrics, and Swagger.
- `apps/web-org` — organization workspace shell.
- `apps/web-admin` — platform administration shell.
- `packages/contracts` — shared request, response, federation, and event schemas.
- `packages/config` — typed server and browser environment contracts.
- `packages/ui` — shared UI primitives and scaffold welcome screen.

## Local setup

Requirements: Node.js `24.11.1`, pnpm `10.24.0`, PostgreSQL, and Redis.

```bash
pnpm install
cp .env.example .env
# Replace every invalid placeholder before starting the API.
pnpm run db:generate
pnpm run dev
```

The applications run at:

- Organization workspace: <http://localhost:3000>
- Admin console: <http://localhost:3001>
- API: <http://localhost:4000>
- Swagger: <http://localhost:4000/docs>

During frontend development, `@smarteam/ui` is resolved from its source files, so edits to shared UI components hot-reload without rebuilding the package. Restart the dev server after changing package manifests or dependencies. Use `pnpm run build` for production-build validation, not for normal source edits.

Set the database, Redis, S3, and federation values in `.env` before starting the API. Never commit `.env` or real credentials.

The committed `.env.example` intentionally contains invalid placeholder values. It documents the required variable names and shapes only; it must not be used as a working runtime configuration.

## Quality checks

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

Prisma commands are available through the root scripts: `pnpm run db:generate`, `pnpm run db:migrate`, and `pnpm run db:studio`.

## Git workflow

The pre-commit hook runs staged formatting, ESLint, and the repository type-check. The commit-message hook enforces Conventional Commits. Use a supported type followed by a colon and a non-empty summary:

```text
feat: add employee provisioning
fix: reject replayed federation requests
refactor: separate leave domain services
chore: update dependencies
```

Other supported types are `build`, `ci`, `docs`, `perf`, `revert`, and `test`.

## Scope of this scaffold

The repository establishes the production boundaries and infrastructure needed to begin Phase 1 backend development. Feature modules, migrations, row-level security policies, federation endpoints, workers, and integration tests are intentionally the next implementation phase; the current API exposes foundational health and metrics endpoints only.
