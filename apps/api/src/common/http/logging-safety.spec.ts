import { redactSensitiveText, serializeHttpRequest } from './logging-safety';

describe('HTTP logging safety', () => {
  it('serializes request-shaped objects without requiring a socket', () => {
    expect(serializeHttpRequest({ method: 'GET', url: '/health/live' })).toEqual({
      id: undefined,
      method: 'GET',
      url: '/health/live',
      remoteAddress: undefined,
    });
  });

  it('redacts transport credentials and certificate blocks', () => {
    expect(redactSensitiveText('Bearer secret-token')).toBe('Bearer [REDACTED]');
    expect(
      redactSensitiveText('cert=-----BEGIN CERTIFICATE-----abc-----END CERTIFICATE-----'),
    ).toBe('cert=[REDACTED_CERTIFICATE]');
  });
});
