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
    url: process.env.DATABASE_URL ?? '',
  },
});
