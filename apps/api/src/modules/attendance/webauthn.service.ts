import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
} from '../../common/errors/domain-error';
import {
  CredentialStatus,
  WebauthnChallengePurpose,
  WebauthnChallengeStatus,
} from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

type WebauthnResponse = RegistrationResponseJSON | AuthenticationResponseJSON;
const supportedTransports = new Set(['ble', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

function isTransport(value: string): value is AuthenticatorTransportFuture {
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

function isWebauthnResponse(value: unknown): value is WebauthnResponse {
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

@Injectable()
export class WebauthnService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async beginEnrollment(context: DomainContext, employeeId: string, deviceLabel?: string) {
    requirePermission(context, 'attendance.webauthn.enroll');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          OR: [{ id: employeeId }, { externalId: employeeId }],
        },
        include: {
          webauthnCredentials: {
            where: { status: CredentialStatus.ACTIVE },
            select: { credentialId: true, transports: true },
          },
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      const options = await generateRegistrationOptions({
        rpName: 'Smarteam',
        rpID: this.config.getOrThrow<string>('WEBAUTHN_RP_ID'),
        userName: employee.workEmail ?? employee.employeeNumber,
        userID: new TextEncoder().encode(employee.id),
        attestationType: 'none',
        excludeCredentials: employee.webauthnCredentials.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports.filter(isTransport),
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      });
      const challenge = await tx.webauthnChallenge.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          purpose: WebauthnChallengePurpose.ENROLLMENT,
          challenge: options.challenge,
          expiresAt: this.expiry(),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'WEBAUTHN_CHALLENGE',
          entityId: challenge.id,
          action: 'WEBAUTHN_ENROLLMENT_STARTED',
          afterState: jsonSnapshot({
            challengeId: challenge.id,
            employeeId: employee.id,
            deviceLabel,
          }),
        },
        tx,
      );
      return { challengeId: challenge.id, options };
    });
  }

  async completeEnrollment(
    context: DomainContext,
    employeeId: string,
    challengeId: string,
    rawResponse: WebauthnResponse,
    deviceLabel?: string,
  ) {
    requirePermission(context, 'attendance.webauthn.enroll');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          OR: [{ id: employeeId }, { externalId: employeeId }],
        },
        select: { id: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      const challenge = await tx.webauthnChallenge.findFirst({
        where: {
          id: challengeId,
          organizationId: context.organizationId,
          employeeId: employee.id,
          purpose: WebauthnChallengePurpose.ENROLLMENT,
          status: WebauthnChallengeStatus.PENDING,
        },
      });
      if (!challenge || challenge.expiresAt <= new Date())
        throw new ConflictError('WebAuthn enrollment challenge is expired or already consumed');
      const verification = await verifyRegistrationResponse({
        response: rawResponse as RegistrationResponseJSON,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.getOrThrow<string>('WEBAUTHN_ORIGIN'),
        expectedRPID: this.config.getOrThrow<string>('WEBAUTHN_RP_ID'),
        requireUserVerification: true,
      });
      if (!verification.verified)
        throw new ForbiddenDomainError('WebAuthn enrollment verification failed');
      const credential = verification.registrationInfo.credential;
      const consumed = await tx.webauthnChallenge.updateMany({
        where: {
          id: challenge.id,
          status: WebauthnChallengeStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: { status: WebauthnChallengeStatus.CONSUMED, consumedAt: new Date() },
      });
      if (consumed.count !== 1)
        throw new ConflictError('WebAuthn enrollment challenge was already consumed');
      const created = await tx.webauthnCredential.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          signCount: BigInt(credential.counter),
          transports: credential.transports ?? [],
          deviceLabel,
          attestationFormat: verification.registrationInfo.fmt,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'WEBAUTHN_CREDENTIAL',
          entityId: created.id,
          action: 'WEBAUTHN_CREDENTIAL_ENROLLED',
          afterState: jsonSnapshot({
            id: created.id,
            employeeId: employee.id,
            credentialId: created.credentialId,
          }),
        },
        tx,
      );
      return { id: created.id, credentialId: created.credentialId, enrolledAt: created.enrolledAt };
    });
  }

  async beginAssertion(
    context: DomainContext,
    employeeId: string,
    credentialId?: string,
    attendancePunchId?: string,
  ) {
    requirePermission(context, 'attendance.webauthn.assert');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          OR: [{ id: employeeId }, { externalId: employeeId }],
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!employee) throw new NotFoundError('Active employee');
      if (
        attendancePunchId &&
        !(await tx.attendancePunch.findFirst({
          where: {
            id: attendancePunchId,
            organizationId: context.organizationId,
            employeeId: employee.id,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundError('Attendance punch');
      const credentials = await tx.webauthnCredential.findMany({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          status: CredentialStatus.ACTIVE,
          ...(credentialId ? { credentialId } : {}),
        },
        select: { id: true, credentialId: true, transports: true },
      });
      if (!credentials.length) throw new NotFoundError('Active WebAuthn credential');
      const options = await generateAuthenticationOptions({
        rpID: this.config.getOrThrow<string>('WEBAUTHN_RP_ID'),
        userVerification: 'required',
        allowCredentials: credentials.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports.filter(isTransport),
        })),
      });
      const singleCredential = credentials.length === 1 ? credentials[0] : undefined;
      const challenge = await tx.webauthnChallenge.create({
        data: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          purpose: WebauthnChallengePurpose.ASSERTION,
          challenge: options.challenge,
          relatedCredentialId: singleCredential?.id,
          relatedAttendancePunchId: attendancePunchId,
          expiresAt: this.expiry(),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'WEBAUTHN_CHALLENGE',
          entityId: challenge.id,
          action: 'WEBAUTHN_ASSERTION_STARTED',
          afterState: jsonSnapshot({
            challengeId: challenge.id,
            employeeId: employee.id,
            attendancePunchId,
          }),
        },
        tx,
      );
      return { challengeId: challenge.id, options };
    });
  }

  async completeAssertion(
    context: DomainContext,
    challengeId: string,
    rawResponse: WebauthnResponse,
    attendancePunchId?: string,
  ) {
    requirePermission(context, 'attendance.webauthn.assert');
    return this.database.run(context, async (tx) => {
      const challenge = await tx.webauthnChallenge.findFirst({
        where: {
          id: challengeId,
          organizationId: context.organizationId,
          purpose: WebauthnChallengePurpose.ASSERTION,
          status: WebauthnChallengeStatus.PENDING,
        },
        include: { relatedCredential: true },
      });
      if (!challenge || challenge.expiresAt <= new Date())
        throw new ConflictError('WebAuthn assertion challenge is expired or already consumed');
      const response = rawResponse as AuthenticationResponseJSON;
      const credential =
        challenge.relatedCredential ??
        (await tx.webauthnCredential.findFirst({
          where: {
            organizationId: context.organizationId,
            employeeId: challenge.employeeId,
            credentialId: response.id,
            status: CredentialStatus.ACTIVE,
          },
        }));
      if (!credential) throw new NotFoundError('WebAuthn credential');
      const targetPunchId = attendancePunchId ?? challenge.relatedAttendancePunchId;
      if (
        targetPunchId &&
        !(await tx.attendancePunch.findFirst({
          where: {
            id: targetPunchId,
            organizationId: context.organizationId,
            employeeId: challenge.employeeId,
          },
          select: { id: true },
        }))
      )
        throw new NotFoundError('Attendance punch');
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.getOrThrow<string>('WEBAUTHN_ORIGIN'),
        expectedRPID: this.config.getOrThrow<string>('WEBAUTHN_RP_ID'),
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.signCount),
          transports: credential.transports.filter(isTransport),
        },
      });
      const authenticationInfo = verification.authenticationInfo;
      const storedCounter = Number(credential.signCount);
      if (
        !verification.verified ||
        (storedCounter > 0 && authenticationInfo.newCounter <= storedCounter)
      ) {
        await tx.webauthnCredential.update({
          where: { id: credential.id },
          data: { reviewRequired: true },
        });
        throw new ForbiddenDomainError(
          'WebAuthn assertion failed clone-detection checks and was flagged for review',
        );
      }
      const consumed = await tx.webauthnChallenge.updateMany({
        where: {
          id: challenge.id,
          status: WebauthnChallengeStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        data: {
          status: WebauthnChallengeStatus.CONSUMED,
          consumedAt: new Date(),
          relatedAttendancePunchId: targetPunchId,
        },
      });
      if (consumed.count !== 1)
        throw new ConflictError('WebAuthn assertion challenge was already consumed');
      await tx.webauthnCredential.update({
        where: { id: credential.id },
        data: { signCount: BigInt(authenticationInfo.newCounter), lastUsedAt: new Date() },
      });
      if (targetPunchId)
        await tx.attendancePunch.update({
          where: { id: targetPunchId },
          data: { biometricVerified: true, webauthnCredentialId: credential.id },
        });
      await this.audit.record(
        context,
        {
          entityType: 'WEBAUTHN_CHALLENGE',
          entityId: challenge.id,
          action: 'WEBAUTHN_ASSERTION_COMPLETED',
          afterState: jsonSnapshot({
            challengeId: challenge.id,
            employeeId: challenge.employeeId,
            credentialId: credential.id,
            attendancePunchId: targetPunchId,
          }),
        },
        tx,
      );
      return {
        verified: true,
        credentialId: credential.credentialId,
        attendancePunchId: targetPunchId,
      };
    });
  }

  async revoke(context: DomainContext, credentialId: string, reason: string) {
    requirePermission(context, 'attendance.webauthn.revoke');
    if (!reason.trim()) throw new ConflictError('Credential revocation requires a reason');
    return this.database.run(context, async (tx) => {
      const credential = await tx.webauthnCredential.findFirst({
        where: { id: credentialId, organizationId: context.organizationId },
      });
      if (!credential) throw new NotFoundError('WebAuthn credential');
      const revoked = await tx.webauthnCredential.update({
        where: { id: credential.id },
        data: {
          status: CredentialStatus.REVOKED,
          revokedAt: new Date(),
          revokedByUserId: context.actor.userId,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'WEBAUTHN_CREDENTIAL',
          entityId: credential.id,
          action: 'WEBAUTHN_CREDENTIAL_REVOKED',
          beforeState: jsonSnapshot(credential),
          afterState: jsonSnapshot(revoked),
          reason,
        },
        tx,
      );
      return { id: revoked.id, status: revoked.status, revokedAt: revoked.revokedAt };
    });
  }

  async expireChallenges() {
    return this.database.runSystem(undefined, (tx) =>
      tx.webauthnChallenge.updateMany({
        where: { status: WebauthnChallengeStatus.PENDING, expiresAt: { lte: new Date() } },
        data: { status: WebauthnChallengeStatus.EXPIRED },
      }),
    );
  }

  private expiry() {
    return new Date(
      Date.now() + this.config.get<number>('WEBAUTHN_CHALLENGE_TTL_SECONDS', 300) * 1000,
    );
  }
}
