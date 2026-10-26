import type { ConfigService } from '@nestjs/config';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { ConflictError } from '../../common/errors/domain-error';

/**
 * WebAuthn payload parsing and the shared challenge expiry window.
 *
 * Pure: no database, no configuration beyond the TTL, so both halves of the ceremony can use it
 * without depending on each other.
 */

export type WebauthnResponse = RegistrationResponseJSON | AuthenticationResponseJSON;
const supportedTransports = new Set(['ble', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

export function isTransport(value: string): value is AuthenticatorTransportFuture {
  return supportedTransports.has(value);
}

export function parseWebauthnResponse(value: string): WebauthnResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new ConflictError('WebAuthn response is not valid JSON');
  }
  if (!isWebauthnResponse(parsed))
    throw new ConflictError('WebAuthn response has an invalid shape');
  return parsed;
}

export function isWebauthnResponse(value: unknown): value is WebauthnResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as {
    id?: unknown;
    rawId?: unknown;
    response?: unknown;
    clientExtensionResults?: unknown;
    type?: unknown;
  };
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.rawId !== 'string' ||
    typeof candidate.type !== 'string' ||
    !candidate.response ||
    typeof candidate.response !== 'object' ||
    !candidate.clientExtensionResults ||
    typeof candidate.clientExtensionResults !== 'object'
  )
    return false;
  const response = candidate.response as {
    clientDataJSON?: unknown;
    attestationObject?: unknown;
    authenticatorData?: unknown;
    signature?: unknown;
  };
  return (
    typeof response.clientDataJSON === 'string' &&
    (typeof response.attestationObject === 'string' ||
      (typeof response.authenticatorData === 'string' && typeof response.signature === 'string'))
  );
}

/** When a freshly issued challenge stops being accepted. */
export function expiry(config: ConfigService) {
  return new Date(Date.now() + config.get<number>('WEBAUTHN_CHALLENGE_TTL_SECONDS', 300) * 1000);
}
