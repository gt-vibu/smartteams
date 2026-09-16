import { assertSafeWebhookUrl } from './url-safety';

describe('assertSafeWebhookUrl', () => {
  it('rejects credentials in callback URLs before any network lookup', async () => {
    await expect(
      assertSafeWebhookUrl('https://user:password@invalid-blizbooks.invalid/callback', [
        'invalid-blizbooks.invalid',
      ]),
    ).rejects.toThrow('without credentials');
  });

  it('rejects callback hosts outside the configured allowlist', async () => {
    await expect(
      assertSafeWebhookUrl('https://other.invalid/callback', ['invalid-blizbooks.invalid']),
    ).rejects.toThrow('not allowlisted');
  });

  it('rejects private addresses even when the hostname is allowlisted', async () => {
    await expect(assertSafeWebhookUrl('https://127.0.0.1/callback', ['127.0.0.1'])).rejects.toThrow(
      'private or reserved',
    );
  });
});
