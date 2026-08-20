import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');
const positiveInt = z.coerce.number().int().positive();

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: positiveInt.default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_ORG_URL: z.string().url().default('http://localhost:3000'),
  WEB_ADMIN_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
  DATABASE_URL: z.string().min(1),
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
  FEDERATION_WEBHOOK_RETRY_WINDOW_SECONDS: positiveInt.default(259_200),
  OTEL_SERVICE_NAME: z.string().default('smarteam-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional().or(z.literal('')),
  PROMETHEUS_ENABLED: booleanFromEnv.default(true),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
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
