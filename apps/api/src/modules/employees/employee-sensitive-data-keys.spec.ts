import type { ConfigService } from '@nestjs/config';
import {
  decryptEmployeeSecret,
  encryptEmployeeSecret,
  fingerprintEmployeeSecret,
  fingerprintsOfEmployeeSecret,
} from './employee-sensitive-data';

/** A config holding only what the key logic reads. */
function config(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const before = config({ JWT_SECRET: 'a-jwt-secret-used-before-the-dedicated-key' });
const after = config({
  JWT_SECRET: 'a-jwt-secret-used-before-the-dedicated-key',
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY: 'k'.repeat(40),
});

describe('setting the dedicated encryption key', () => {
  beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('keeps numbers stored before it readable', () => {
    const stored = encryptEmployeeSecret(before, '234123412346');
    expect(decryptEmployeeSecret(after, stored)).toBe('234123412346');
  });

  it('protects new numbers with the dedicated key', () => {
    const stored = encryptEmployeeSecret(after, 'ABCDE1234F');
    expect(decryptEmployeeSecret(after, stored)).toBe('ABCDE1234F');
    expect(() => decryptEmployeeSecret(config({ JWT_SECRET: 'something else' }), stored)).toThrow();
  });

  it('still finds an Aadhaar fingerprinted under the old key', () => {
    const old = fingerprintEmployeeSecret(before, '234123412346');
    expect(fingerprintsOfEmployeeSecret(after, '234123412346')).toContain(old);
    expect(fingerprintEmployeeSecret(after, '234123412346')).not.toBe(old);
  });
});
