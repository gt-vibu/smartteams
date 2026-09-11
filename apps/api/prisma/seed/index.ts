import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { Pool } from 'pg';

loadEnv({ path: resolve(__dirname, '../../../.env') });

const DEFAULT_PLATFORM_ROLE = {
  code: 'SUPER_ADMIN',
  name: 'Super Admin',
  description: 'Platform administrator with access to federation management',
};

const PLATFORM_ADMIN_PERMISSION = {
  key: 'platform.admin',
  description: 'Manage platform and federation integrations',
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required to seed the platform administrator`);
  return value;
}

function validateEmail(email: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPERADMIN_EMAIL must be a valid email address');
  }
  return email.toLowerCase();
}

function validatePassword(password: string): string {
  if (password.length < 12) {
    throw new Error('SUPERADMIN_PASSWORD must contain at least 12 characters');
  }
  return password;
}

async function main() {
  const email = validateEmail(requiredEnv('SUPERADMIN_EMAIL'));
  const password = validatePassword(requiredEnv('SUPERADMIN_PASSWORD'));
  const databaseUrl =
    process.env.DATABASE_PLATFORM_URL ||
    process.env.DATABASE_SYSTEM_URL ||
    process.env.DATABASE_URL;

  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed the platform administrator');

  const passwordHash = await argon2.hash(password, {
    memoryCost: Number.parseInt(process.env.PASSWORD_HASH_MEMORY_COST ?? '19456', 10),
    type: argon2.argon2id,
  });
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.platformRole.upsert({
        where: { code: DEFAULT_PLATFORM_ROLE.code },
        create: DEFAULT_PLATFORM_ROLE,
        update: {
          name: DEFAULT_PLATFORM_ROLE.name,
          description: DEFAULT_PLATFORM_ROLE.description,
        },
      });
      const permission = await tx.platformPermission.upsert({
        where: { key: PLATFORM_ADMIN_PERMISSION.key },
        create: PLATFORM_ADMIN_PERMISSION,
        update: { description: PLATFORM_ADMIN_PERMISSION.description },
      });
      await tx.platformRolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });

      const existingUser = await tx.user.findUnique({ where: { emailNormalized: email } });
      if (existingUser) {
        const activeMembership = await tx.userOrganization.findFirst({
          where: { userId: existingUser.id, status: 'ACTIVE' },
        });
        if (activeMembership) {
          throw new Error(
            'The configured superadmin email belongs to an active organization member. Use a separate platform-admin identity.',
          );
        }
      }

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              displayName: 'Platform Super Admin',
              passwordHash,
              identityType: 'NATIVE',
              isActive: true,
              deactivatedAt: null,
              tokenVersion: { increment: 1 },
            },
          })
        : await tx.user.create({
            data: {
              email,
              emailNormalized: email,
              displayName: 'Platform Super Admin',
              passwordHash,
              identityType: 'NATIVE',
            },
          });

      await tx.userPlatformRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        create: { userId: user.id, roleId: role.id },
        update: { revokedAt: null },
      });
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(`Platform administrator seeded for ${email}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Platform administrator seed failed');
  process.exitCode = 1;
});
