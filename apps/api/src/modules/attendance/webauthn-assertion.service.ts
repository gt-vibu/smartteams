import { Injectable } from '@nestjs/common';
import { expiry, isTransport, type WebauthnResponse } from './webauthn-shared';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
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
 * Proving possession of an enrolled passkey.
 *
 * The authentication half: issue a challenge, verify the assertion, advance the signature counter.
 * A counter that fails to advance is the signal that a credential has been cloned, so it is
 * checked rather than merely recorded.
 */
@Injectable()
export class WebauthnAssertionService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

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
          expiresAt: expiry(this.config),
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
}
