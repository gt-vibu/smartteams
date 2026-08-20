import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveInt = z.coerce.number().int().positive();

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APP_VERSION: z.string().min(1).default('0.1.0'),
    API_HOST: z.string().default('0.0.0.0'),
    API_PORT: positiveInt.default(4000),
    API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
    WEB_ORG_URL: z.string().url().default('http://localhost:3000'),
    WEB_ADMIN_URL: z.string().url().default('http://localhost:3001'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
    TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
    DATABASE_URL: z.string().min(1),
    // DATABASE_URL is the least-privileged application role. The elevated URLs
    // are intentionally separate so a tenant request can never reuse a role
    // that is allowed to bypass RLS.
    DATABASE_SYSTEM_URL: z.string().min(1).optional().or(z.literal('')),
    DATABASE_PLATFORM_URL: z.string().min(1).optional().or(z.literal('')),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    REDIS_TLS: booleanFromEnv.default(false),
    REDIS_KEY_PREFIX: z.string().default('smarteam:'),
    AWS_REGION: z.string().min(1).default('ap-south-1'),
    AWS_S3_BUCKET: z.string().min(1),
    AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal('')),
    AWS_S3_FORCE_PATH_STYLE: booleanFromEnv.default(false),
    AWS_ACCESS_KEY_ID: z.string().optional().or(z.literal('')),
    AWS_SECRET_ACCESS_KEY: z.string().optional().or(z.literal('')),
    AWS_S3_KMS_KEY_ID: z.string().optional().or(z.literal('')),
    JWT_ISSUER: z.string().min(1).default('smarteam-api'),
    JWT_AUDIENCE: z.string().min(1).default('smarteam-app'),
    JWT_SECRET: z.string().min(32).optional().or(z.literal('')),
    JWT_ACCESS_TOKEN_TTL_SECONDS: positiveInt.default(900),
    JWT_REFRESH_TOKEN_TTL_SECONDS: positiveInt.default(2_592_000),
    SESSION_COOKIE_NAME: z.string().min(1).default('smarteam_session'),
    SESSION_COOKIE_DOMAIN: z.string().optional().or(z.literal('')),
    SESSION_COOKIE_SECURE: booleanFromEnv.default(false),
    PASSWORD_HASH_MEMORY_COST: positiveInt.default(19_456),
    FEDERATION_TOKEN_TTL_SECONDS: positiveInt.default(900),
    FEDERATION_REQUEST_CLOCK_SKEW_SECONDS: positiveInt.default(300),
    FEDERATION_NONCE_TTL_SECONDS: positiveInt.default(300),
    FEDERATION_BOOTSTRAP_SECRET: z.string().min(16),
    FEDERATION_WEBHOOK_SIGNING_KEY_ID: z.string().min(1).default('local-v1'),
    FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM: z.string().optional().or(z.literal('')),
    FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM: z.string().optional().or(z.literal('')),
    FEDERATION_WEBHOOK_RETRY_WINDOW_SECONDS: positiveInt.default(259_200),
    FEDERATION_IDEMPOTENCY_ENCRYPTION_KEY: z.string().min(32).optional().or(z.literal('')),
    FEDERATION_RATE_LIMIT_PER_MINUTE: positiveInt.default(600),
    FEDERATION_TOKEN_RATE_LIMIT_PER_MINUTE: positiveInt.default(60),
    FEDERATION_WEBHOOK_ALLOWED_HOSTS: z.string().default('invalid-blizbooks.invalid'),
    AUTH_RATE_LIMIT_PER_MINUTE: positiveInt.default(30),
    FILE_DELETION_RETENTION_DAYS: positiveInt.default(30),
    WEBAUTHN_RP_ID: z.string().min(1).default('invalid.smarteam.example'),
    WEBAUTHN_ORIGIN: z.string().url().default('https://invalid.smarteam.example'),
    WEBAUTHN_CHALLENGE_TTL_SECONDS: positiveInt.default(300),
    OTEL_SERVICE_NAME: z.string().default('smarteam-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
    PROMETHEUS_ENABLED: booleanFromEnv.default(true),
    METRICS_TOKEN: z.string().min(32).optional().or(z.literal('')),
    SWAGGER_ENABLED: booleanFromEnv.default(true),
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  })
  .superRefine((env, context) => {
    const isProductionLike = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    if (!isProductionLike) return;

    const requiredSecrets: Array<[keyof typeof env, string]> = [
      ['JWT_SECRET', 'JWT_SECRET'],
      ['FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM', 'FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM'],
      ['FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM', 'FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM'],
      ['METRICS_TOKEN', 'METRICS_TOKEN'],
    ];
    for (const [key, label] of requiredSecrets) {
      if (!env[key])
        context.addIssue({ code: 'custom', message: `${label} is required outside development` });
    }

    if (!env.DATABASE_SYSTEM_URL || env.DATABASE_SYSTEM_URL === env.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_SYSTEM_URL must be a distinct privileged database role',
      });
    }
    if (!env.DATABASE_PLATFORM_URL || env.DATABASE_PLATFORM_URL === env.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_PLATFORM_URL must be a distinct privileged database role',
      });
    }
    if (!env.SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'SESSION_COOKIE_SECURE must be true outside development',
      });
    }
    if (env.SWAGGER_ENABLED) {
      context.addIssue({
        code: 'custom',
        message: 'SWAGGER_ENABLED must be false outside development',
      });
    }
    if (env.FEDERATION_WEBHOOK_ALLOWED_HOSTS.trim().length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'FEDERATION_WEBHOOK_ALLOWED_HOSTS must not be empty',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  NEXT_PUBLIC_APP_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(source);
}
