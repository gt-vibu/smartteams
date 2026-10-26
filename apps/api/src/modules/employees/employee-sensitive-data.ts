import { createCipheriv, createDecipheriv, randomBytes, createHmac, hkdfSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';

let warned = false;

/**
 * The keys Aadhaar, PAN and account numbers are protected with, newest first.
 *
 * `INTEGRATION_CREDENTIALS_ENCRYPTION_KEY` (32+ characters) is the dedicated key. Environments
 * that ran without it used one derived from `JWT_SECRET`, and everything they stored is under that
 * key. Both are kept: new values use the first, and reading tries each in turn. Without this,
 * setting the dedicated key made every number already stored unreadable, and let an Aadhaar
 * already on file be recorded a second time because its fingerprint no longer matched.
 */
function employeeDataKeys(config: ConfigService): string[] {
  const keys: string[] = [];
  const configured =
    config.get<string>('app.credentialsEncryptionKey') ??
    config.get<string>('INTEGRATION_CREDENTIALS_ENCRYPTION_KEY');
  if (configured && configured.length >= 32) keys.push(configured);
  const secret = config.get<string>('JWT_SECRET');
  if (secret)
    keys.push(
      Buffer.from(hkdfSync('sha256', secret, 'smarteam-employee-data', 'aes-256-gcm', 32))
        .toString('base64url')
        .slice(0, 32),
    );
  if (!keys.length) throw new Error('Employee sensitive-data encryption key is not configured.');
  if (keys.length === 1 && !configured && !warned) {
    warned = true;
    console.warn(
      'INTEGRATION_CREDENTIALS_ENCRYPTION_KEY is not set; employee Aadhaar/PAN are encrypted with a key derived from JWT_SECRET. Set a dedicated 32+ character key; values already stored stay readable.',
    );
  }
  return [...new Set(keys)];
}

export function encryptEmployeeSecret(config: ConfigService, value: string) {
  const key = employeeDataKeys(config)[0]!;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptEmployeeSecret(config: ConfigService, value: string | null) {
  if (!value) return null;
  const [version, ivText, tagText, encryptedText] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText)
    throw new Error('Employee sensitive data is invalid.');
  let failure: unknown;
  // Each key in turn: a value stored before the dedicated key was set is under the older one.
  for (const key of employeeDataKeys(config)) {
    try {
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
    } catch (error) {
      failure = error;
    }
  }
  throw failure instanceof Error ? failure : new Error('Employee sensitive data is unreadable.');
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
 * This is the fingerprint stored with a new value.
 */
export function fingerprintEmployeeSecret(config: ConfigService, value: string) {
  return fingerprintsOfEmployeeSecret(config, value)[0]!;
}

/** The value's fingerprint under every key in use, to find it however long ago it was stored. */
export function fingerprintsOfEmployeeSecret(config: ConfigService, value: string) {
  return employeeDataKeys(config).map((key) =>
    createHmac('sha256', key).update(`aadhaar:${value}`).digest('hex'),
  );
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
