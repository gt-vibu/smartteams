import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  schema: 'prisma',
  datasource: {
    // The schema owner, when it is not the runtime role. `DATABASE_URL` is meant to be a
    // least-privilege role that cannot bypass RLS — and cannot create tables either — so a setup
    // that follows that (see scripts/provision-runtime-role.mjs) names the owner here. Unset, it
    // is `DATABASE_URL`, as before.
    url: process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
