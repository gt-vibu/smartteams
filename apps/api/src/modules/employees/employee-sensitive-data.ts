import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

export function encryptEmployeeSecret(config: ConfigService, value: string) {
  const key =
    config.get<string>('app.credentialsEncryptionKey') ??
    config.get<string>('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY');
  if (!key || key.length < 32)
    throw new Error('Employee sensitive-data encryption key is not configured.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptEmployeeSecret(config: ConfigService, value: string | null) {
  if (!value) return null;
  const key =
    config.get<string>('app.credentialsEncryptionKey') ??
    config.get<string>('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY');
  if (!key || key.length < 32)
    throw new Error('Employee sensitive-data encryption key is not configured.');
  const [version, ivText, tagText, encryptedText] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText)
    throw new Error('Employee sensitive data is invalid.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key.slice(0, 32)),
    Buffer.from(ivText, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskEmployeeSecret(value: string | null) {
  if (!value) return null;
  return value.length <= 4
    ? '****'
    : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}
