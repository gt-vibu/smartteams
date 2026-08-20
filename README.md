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

Requirements: Node.js `24.11.1`, npm `11.6.2`, PostgreSQL, and Redis.

```bash
npm install
cp .env.example .env
# Replace every invalid placeholder before starting the API.
npm run db:generate
npm run dev
```

The applications run at:

- Organization workspace: <http://localhost:3000>
- Admin console: <http://localhost:3001>
- API: <http://localhost:4000>
- Swagger: <http://localhost:4000/docs>

Set the database, Redis, S3, and federation values in `.env` before starting the API. Never commit `.env` or real credentials.

The committed `.env.example` intentionally contains invalid placeholder values. It documents the required variable names and shapes only; it must not be used as a working runtime configuration.

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Prisma commands are available through the root scripts: `npm run db:generate`, `npm run db:migrate`, and `npm run db:studio`.

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
