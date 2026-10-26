import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ConflictError } from '../errors/domain-error';

export async function assertSafeWebhookUrl(rawUrl: string, allowedHosts: string[]) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConflictError('Webhook callback URL is invalid');
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new ConflictError('Webhook callbacks must use HTTPS without credentials or custom ports');

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!matchesAllowedHost(host, allowedHosts))
    throw new ConflictError('Webhook callback host is not allowlisted');

  const addresses = await lookup(host, { all: true, verbatim: true }).catch(() => {
    throw new ConflictError('Webhook callback host cannot be resolved');
  });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address)))
    throw new ConflictError('Webhook callback host resolves to a private or reserved address');

  return url.toString();
}

function matchesAllowedHost(host: string, allowedHosts: string[]) {
  return allowedHosts.some((entry) => {
    const allowed = entry.trim().toLowerCase().replace(/\.$/, '');
    if (!allowed) return false;
    if (allowed.startsWith('*.')) return host.endsWith(`.${allowed.slice(2)}`);
    return host === allowed;
  });
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    const [first = 0, second = 0] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && second >= 18 && second <= 19) ||
      (first === 198 && second === 51 && octets[2] === 100) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      first >= 224
    );
  }

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  );
}
