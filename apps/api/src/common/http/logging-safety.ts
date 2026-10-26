import type { ServerResponse } from 'node:http';

type RequestWithRoute = {
  baseUrl?: string;
  id?: string;
  method?: string;
  route?: { path?: string };
  socket?: { remoteAddress?: string | null };
  url?: string;
};

type ResponseWithHeaders = ServerResponse & {
  statusCode?: number;
};

const certificateBlockPattern = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gi;
const bearerTokenPattern = /\bBearer\s+[^\s,;}]+/gi;
const sensitiveAssignmentPattern =
  /((?:["']?(?:authorization|cookie|set-cookie|x-api-key|x-client-cert|x-client-key|x-client-certificate|x-client-certificate-fingerprint|proxy-authorization|ssl-client-cert|ssl-client-key|access-token|accessToken|refresh-token|refreshToken|password|secret|secretKey|clientCertificate|clientKey|private-key|privateKey|mtlsCertPem|mtlsKeyPem|signingKey)["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi;

/**
 * Keep request logs useful for operations without serializing transport
 * credentials. In particular, the federation mTLS certificate is required
 * on the wire but is never required in an application log.
 */
export function serializeHttpRequest(request: RequestWithRoute) {
  const routePath = request.route?.path
    ? `${request.baseUrl ?? ''}${request.route.path}`
    : safeRequestPath(request.url);

  return {
    id: request.id,
    method: request.method,
    url: routePath,
    remoteAddress: request.socket?.remoteAddress,
  };
}

export function serializeHttpResponse(response: ResponseWithHeaders) {
  return { statusCode: response.statusCode };
}

export function serializeHttpError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name,
      message: redactSensitiveText(error.message),
      stack: error.stack ? redactSensitiveText(error.stack) : undefined,
      ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
    };
  }

  return { message: redactSensitiveText(String(error)) };
}

export function safeRequestPath(value: string | undefined) {
  if (!value) return '/';
  try {
    return new URL(value, 'http://localhost').pathname || '/';
  } catch {
    return value.split('?')[0] || '/';
  }
}

export function redactSensitiveText(value: string) {
  return value
    .replace(certificateBlockPattern, '[REDACTED_CERTIFICATE]')
    .replace(bearerTokenPattern, 'Bearer [REDACTED]')
    .replace(sensitiveAssignmentPattern, '$1[REDACTED]');
}

// These paths protect against future code that logs a raw request object or
// request body in addition to the allowlisted serializers above.
export const sensitiveLogPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-client-cert"]',
  'req.headers["x-client-key"]',
  'req.headers["x-client-certificate"]',
  'req.headers["x-client-certificate-fingerprint"]',
  'req.headers["proxy-authorization"]',
  'req.headers["ssl-client-cert"]',
  'req.headers["ssl-client-key"]',
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'req.body.authorization',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.clientCertificate',
  'req.body.clientKey',
  'req.body.privateKey',
  'req.body.mtlsCertPem',
  'req.body.mtlsKeyPem',
  'req.body.signingKey',
  'res.headers["set-cookie"]',
];
