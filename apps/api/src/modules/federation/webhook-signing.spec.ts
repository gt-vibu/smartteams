import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signWebhookPayload } from './webhook.service';

describe('RSA webhook signing', () => {
  it('signs the timestamp-bound raw payload with RSA-SHA256', () => {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'pem', type: 'spki' },
    });
    const body = JSON.stringify({ eventId: 'event-1', payload: { value: 42 } });
    const timestamp = '1787222400';
    const signature = signWebhookPayload(keys.privateKey, body, timestamp);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${timestamp}.${body}`);
    verifier.end();
    expect(verifier.verify(keys.publicKey, signature, 'base64')).toBe(true);
  });
});
