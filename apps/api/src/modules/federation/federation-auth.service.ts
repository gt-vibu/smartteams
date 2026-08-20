import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UnauthorizedDomainError } from '../../common/errors/domain-error';
import { CredentialStatus, FederationClientStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { mtlsFingerprintHeader } from './federation.types';
import type { Prisma } from '../../generated/prisma/client';

export type FederationToken = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
};

@Injectable()
export class FederationAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issueToken(input: {
    clientId: string;
    clientSecret: string;
    mtlsFingerprint?: string;
  }): Promise<FederationToken> {
    const client = await this.prisma.system.federationClient.findUnique({
      where: { clientId: input.clientId },
      include: { credentials: true },
    });
    if (
      !client ||
      client.status !== FederationClientStatus.ACTIVE ||
      (client.expiresAt && client.expiresAt <= new Date())
    )
      throw new UnauthorizedDomainError('Federation client is invalid or expired');
    this.verifyMtls(client.allowedCertificateFingerprints, input.mtlsFingerprint);
    const now = new Date();
    const credential = client.credentials.find(
      (candidate) =>
        candidate.status === CredentialStatus.ACTIVE &&
        candidate.validFrom <= now &&
        (!candidate.validUntil || candidate.validUntil > now),
    );
    if (!credential || !(await argon2.verify(credential.secretHash, input.clientSecret)))
      throw new UnauthorizedDomainError('Federation client is invalid or expired');
    await this.prisma.system.federationClientCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: now },
    });
    const token = await this.jwt.signAsync(
      { sub: client.id, clientId: client.clientId, tv: client.tokenVersion },
      { expiresIn: this.config.get<number>('FEDERATION_TOKEN_TTL_SECONDS', 900) },
    );
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.config.get<number>('FEDERATION_TOKEN_TTL_SECONDS', 900),
    };
  }

  async validateAccessToken(
    payload: { sub: string; clientId: string; tv: number },
    mtlsFingerprint?: string,
  ) {
    const client = await this.prisma.system.federationClient.findUnique({
      where: { id: payload.sub },
    });
    if (
      !client ||
      client.clientId !== payload.clientId ||
      client.tokenVersion !== payload.tv ||
      client.status !== FederationClientStatus.ACTIVE ||
      (client.expiresAt && client.expiresAt <= new Date())
    )
      throw new UnauthorizedDomainError('Federation token is invalid or revoked');
    this.verifyMtls(client.allowedCertificateFingerprints, mtlsFingerprint);
    return {
      clientInternalId: client.id,
      clientId: client.clientId,
      tokenVersion: client.tokenVersion,
    };
  }

  async createCredential(
    clientInternalId: string,
    createdByUserId: string | undefined,
    validUntil?: Date,
    tx: Prisma.TransactionClient = this.prisma.system,
  ) {
    const secret = randomBytes(32).toString('base64url');
    const keyId = randomBytes(8).toString('hex');
    const credential = await tx.federationClientCredential.create({
      data: {
        clientId: clientInternalId,
        secretHash: await argon2.hash(secret, { type: argon2.argon2id }),
        keyId,
        status: CredentialStatus.ACTIVE,
        validFrom: new Date(),
        validUntil,
        createdByUserId,
      },
    });
    return { id: credential.id, keyId, clientSecret: secret };
  }

  private verifyMtls(allowed: string[], fingerprint?: string) {
    const normalizedFingerprint = fingerprint ? normalizeFingerprint(fingerprint) : undefined;
    const normalizedAllowed = allowed.map(normalizeFingerprint);
    if (!normalizedFingerprint || !normalizedAllowed.includes(normalizedFingerprint)) {
      throw new UnauthorizedDomainError(
        `A verified client certificate fingerprint is required in ${mtlsFingerprintHeader}`,
      );
    }
  }
}

function normalizeFingerprint(value: string) {
  return value.replaceAll(':', '').trim().toLowerCase();
}
