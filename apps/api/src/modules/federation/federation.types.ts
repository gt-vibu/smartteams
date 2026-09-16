import type { Request } from 'express';

export type FederationRequestUser = {
  clientInternalId: string;
  clientId: string;
  tokenVersion: number;
};

export type FederationRequest = Request<Record<string, string>, unknown, unknown> & {
  federation?: FederationRequestUser;
};

export const mtlsFingerprintHeader = 'x-client-certificate-fingerprint';
