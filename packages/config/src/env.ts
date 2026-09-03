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
    SHADOW_DATABASE_URL: z.string().min(1).optional().or(z.literal('')),
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
    JWT_ISSUER: z.string().min(1).default('smarteam-api'),
    JWT_AUDIENCE: z.string().min(1).default('smarteam-app'),
    JWT_SECRET: z.string().min(32),
    JWT_ACCESS_TOKEN_TTL_SECONDS: positiveInt.default(900),
    JWT_REFRESH_TOKEN_TTL_SECONDS: positiveInt.default(2_592_000),
    SESSION_COOKIE_NAME: z.string().min(1).default('smarteam_session'),
    SESSION_COOKIE_DOMAIN: z.string().optional().or(z.literal('')),
    SESSION_COOKIE_SECURE: booleanFromEnv.default(false),
    SESSION_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
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
    // Baseline ceilings for the native application API, per identity per minute. See
    // `RequestRateLimitInterceptor` for why the tiers differ rather than one figure applying.
    RATE_LIMIT_READ_PER_MINUTE: positiveInt.default(600),
    RATE_LIMIT_MUTATION_PER_MINUTE: positiveInt.default(120),
    // 20/min blocked a platform operator onboarding tenants in a loop, which is a legitimate
    // burst rather than abuse. 60 still bounds a whole-tenant payroll calculation.
    RATE_LIMIT_EXPENSIVE_PER_MINUTE: positiveInt.default(60),
    FILE_DELETION_RETENTION_DAYS: positiveInt.default(30),
    WEBAUTHN_RP_ID: z.string().min(1).default('invalid.smarteam.example'),
    WEBAUTHN_ORIGIN: z.string().url().default('https://invalid.smarteam.example'),
    WEBAUTHN_CHALLENGE_TTL_SECONDS: positiveInt.default(300),
    /*
     * Observability.
     *
     * `METRICS_TOKEN` is the only entry here that anything reads: `MetricsGuard` requires it as a
     * bearer token on /metrics, and the check further down makes it mandatory outside development.
     *
     * OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, PROMETHEUS_ENABLED and SENTRY_DSN used to
     * sit here too. Nothing in the codebase read any of them, so setting an OTLP endpoint or a
     * Sentry DSN configured precisely nothing while looking like it had — the worst kind of
     * missing feature, because it hides itself. They are gone rather than left as a promise; when
     * tracing or error reporting is actually wired up, they come back with the code that uses
     * them.
     */
    METRICS_TOKEN: z.string().min(32).optional().or(z.literal('')),
    SWAGGER_ENABLED: booleanFromEnv.default(true),
  })
  .superRefine((env, context) => {
    if (env.SESSION_COOKIE_SAME_SITE === 'none' && !env.SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        message: 'SESSION_COOKIE_SAME_SITE=none requires SESSION_COOKIE_SECURE=true',
      });
    }

    const isProductionLike = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
    if (!isProductionLike) return;

    const requiredSecrets: Array<[keyof typeof env, string]> = [
      ['FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM', 'FEDERATION_WEBHOOK_SIGNING_PRIVATE_KEY_PEM'],
      ['FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM', 'FEDERATION_WEBHOOK_SIGNING_PUBLIC_KEY_PEM'],
      ['METRICS_TOKEN', 'METRICS_TOKEN'],
      ['FEDERATION_IDEMPOTENCY_ENCRYPTION_KEY', 'FEDERATION_IDEMPOTENCY_ENCRYPTION_KEY'],
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
    if (env.CORS_ORIGINS.split(',').some((origin) => origin.trim().startsWith('http://'))) {
      context.addIssue({
        code: 'custom',
        message: 'CORS_ORIGINS must not contain plaintext http origins outside development',
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
  /**
   * Base name of the authentication cookies. The browser never reads the access or refresh
   * cookie (both are HttpOnly); it only needs this to locate the readable CSRF cookie, so the
   * value must match the API's SESSION_COOKIE_NAME.
   */
  NEXT_PUBLIC_SESSION_COOKIE_NAME: z.string().min(1).default('smarteam_session'),
  NEXT_PUBLIC_APP_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function parseWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  return webEnvSchema.parse(source);
}
