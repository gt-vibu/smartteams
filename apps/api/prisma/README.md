# Prisma database layout

The API uses Prisma ORM 7 with a multi-file schema:

```text
prisma/
├── schema.prisma       # generator and PostgreSQL provider only
├── models/              # domain models and enums, split by responsibility
├── migrations/          # reviewed, version-controlled migrations
└── prisma.config.ts     # repository-level Prisma configuration is one directory up
```

`prisma.config.ts` points Prisma at the `prisma/` directory. Prisma combines every `.prisma` file under `models/` when it validates, generates the client, or runs migrations. Relations can therefore cross model files without imports.

The initial migration contains PostgreSQL-specific SQL that Prisma cannot represent completely: extensions, RLS policies, partial indexes, exclusion constraints, append-only triggers, and locked-payroll protections. Keep those safeguards in reviewed migrations when the model changes; do not move them into application startup code.

Migration history is append-only. Never edit a migration that has been applied to any shared, staging, or production database. If the schema needs to change, update the Prisma models and create a new migration. If an applied migration was changed accidentally, restore its original contents or repair the migration history with a reviewed forward migration; do not use `prisma migrate reset` on a database that contains data.

The `20260820160000_schema_review_fixes` migration contains the forward-only changes that reconcile the reviewed Prisma models with the originally deployed baseline. Keep it in place; future changes must use additional migrations.

## Commands

Run these from the repository root with pnpm:

```bash
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm db:migrate       # local development: create/apply a named migration
pnpm db:deploy        # CI/staging/production: apply checked-in migrations only
pnpm db:status
pnpm db:studio
```

`DATABASE_URL` must point to the target PostgreSQL database. Use a direct PostgreSQL connection for Prisma migration commands; use the pooled application connection only when the hosting setup explicitly supports migration traffic.

In this monorepo, the local environment file is the repository-root `.env`. `prisma.config.ts` loads that file explicitly because filtered `pnpm` commands execute with `apps/api` as their working directory.
