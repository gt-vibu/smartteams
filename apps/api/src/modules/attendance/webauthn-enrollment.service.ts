import { Injectable } from '@nestjs/common';
import { expiry, isTransport, type WebauthnResponse } from './webauthn-shared';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
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

/**
 * Enrolling a passkey, and removing one.
 *
 * The registration half of WebAuthn: issue a challenge, verify the attestation, store the
 * credential. Revocation lives here too because it undoes exactly what enrolment did.
 */
@Injectable()
export class WebauthnEnrollmentService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
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
          expiresAt: expiry(this.config),
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
}
