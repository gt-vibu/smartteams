import { createCipheriv, createDecipheriv, randomBytes, createHmac, hkdfSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

let warned = false;

/**
 * The key Aadhaar and PAN are encrypted with. `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (32+
 * characters) should be set. It was read here but documented nowhere, so environments ran without
 * it and every save of an Aadhaar or PAN failed. Without it, a key is derived from `JWT_SECRET`
 * so the feature works, and a warning says the dedicated key should be set: rotating `JWT_SECRET`
 * would otherwise make stored numbers unreadable.
 */
function employeeDataKey(config: ConfigService): string {
  const configured =
    config.get<string>('app.credentialsEncryptionKey') ??
    config.get<string>('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY');
  if (configured && configured.length >= 32) return configured;
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) throw new Error('Employee sensitive-data encryption key is not configured.');
  if (!warned) {
    warned = true;
    console.warn(
      'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY is not set; employee Aadhaar/PAN are encrypted with a key derived from JWT_SECRET. Set a dedicated 32+ character key.',
    );
  }
  return Buffer.from(hkdfSync('sha256', secret, 'smarteam-employee-data', 'aes-256-gcm', 32))
    .toString('base64url')
    .slice(0, 32);
}

export function encryptEmployeeSecret(config: ConfigService, value: string) {
  const key = employeeDataKey(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptEmployeeSecret(config: ConfigService, value: string | null) {
  if (!value) return null;
  const key = employeeDataKey(config);
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

/**
 * A keyed fingerprint of a secret, for uniqueness without storing it readably. Encryption is
 * randomised (a new IV each time), so two encryptions of one Aadhaar never match; this does.
 */
export function fingerprintEmployeeSecret(config: ConfigService, value: string) {
  const key = employeeDataKey(config);
  return createHmac('sha256', key).update(`aadhaar:${value}`).digest('hex');
}

// Verhoeff tables, as UIDAI uses for the Aadhaar check digit.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Digits only, spaces allowed as typed on the card: `2341 2341 2346` → `234123412346`. */
export function normalizeAadhaar(value: string) {
  return value.replace(/[\s-]/g, '');
}

/**
 * A number UIDAI could have issued: 12 digits, not starting with 0 or 1, with a valid Verhoeff
 * check digit. It catches typos; it cannot tell whether the number belongs to this person.
 */
export function isValidAadhaar(value: string) {
  const digits = normalizeAadhaar(value);
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let check = 0;
  [...digits].reverse().forEach((digit, index) => {
    check = VERHOEFF_D[check]![VERHOEFF_P[index % 8]![Number(digit)]!]!;
  });
  return check === 0;
}
