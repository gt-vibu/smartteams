import { defineConfig } from 'prisma/config';

export default defineConfig({
  migrations: { path: 'prisma/migrations' },
  schema: 'prisma/schema.prisma',
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://invalid_user:invalid_password@invalid-postgres.invalid:5432/invalid_database?schema=public',
  },
});
