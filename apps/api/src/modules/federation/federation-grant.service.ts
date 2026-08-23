import { Injectable } from '@nestjs/common';
import { ConflictError, ForbiddenDomainError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { randomUUID } from 'node:crypto';

export const FEDERATION_GRANTABLE_SCOPES = [
  'tenants.write',
  'branches.write',
  'capabilities.read',
  'webhooks.write',
  'events.read',
  'webhooks.replay',
  'employees.read',
  'employees.write',
  'employees.deactivate',
  'employees.branches.write',
  'employees.access.write',
  'employees.sessions.revoke',
  'employees.records.write',
  'employees.compensation.read',
  'employees.compensation.write',
  'attendance.read',
  'attendance.preferences.read',
  'shifts.read',
  'shifts.write',
  'attendance.preferences.write',
  'attendance.corrections.write',
  'attendance.corrections.decide',
  'attendance.webauthn.assert',
  'attendance.write',
  'timesheets.read',
  'timesheets.write',
  'timesheets.submit',
  'timesheets.decide',
  'attendance.webauthn.enroll',
  'leave.types.read',
  'leave.types.write',
  'leave.balances.read',
  'leave.requests.read',
  'leave.requests.write',
  'leave.requests.decide',
  'leave.balances.adjust',
  'approval-policies.read',
  'approval-policies.write',
  'files.write',
  'payroll.components.read',
  'payroll.components.write',
  'payroll.payslips.read',
  'payroll.payslips.read.all',
  'payroll.calendars.read',
  'payroll.runs.read',
  'payroll.runs.write',
  'payroll.runs.calculate',
  'payroll.runs.approve',
  'payroll.runs.release',
  'payroll.runs.lock',
  'payroll.ledger.read',
  'payroll.calendars.write',
  'payroll.adjustments.write',
  'payroll.compliance.read',
  'payroll.compliance.write',
  'payroll.policy.read',
  'payroll.policy.write',
  'payroll.employee-profile.read',
  'payroll.employee-profile.read.all',
  'payroll.employee-profile.write',
  'payroll.preview.read',
  'payroll.advances.read',
  'payroll.advances.read.all',
  'payroll.advances.request',
  'payroll.advances.approve',
  'payroll.payments.read',
  'payroll.payments.read.all',
  'payroll.payments.write',
] as const;

type ResolvedGrant = {
  effect: 'ALLOW' | 'DENY';
  scopes: Array<{ scope: { code: string } }>;
};

export function effectiveFederationPermissions(grants: ResolvedGrant[]) {
  const deniedScopes = new Set(
    grants
      .filter((grant) => grant.effect === 'DENY')
      .flatMap((grant) => grant.scopes.map((entry) => entry.scope.code)),
  );
  return new Set(
    grants
      .filter((grant) => grant.effect === 'ALLOW')
      .flatMap((grant) => grant.scopes.map((entry) => entry.scope.code))
      .filter((permission) => !deniedScopes.has(permission)),
  );
}

@Injectable()
export class FederationGrantService {
  constructor(private readonly database: TenantDatabaseService) {}

  async resolve(
    clientId: string,
    organizationId: string,
    branchId: string | undefined,
    scope: string,
  ) {
    const grants = await this.database.run(
      {
        organizationId,
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId },
        correlationId: randomUUID(),
        requestId: randomUUID(),
        permissions: new Set(),
      },
      async (tx) => {
        const capabilityCode = capabilityForScope(scope);
        if (capabilityCode) {
          const capability = await tx.organizationFederationCapability.findFirst({
            where: {
              organizationId,
              status: 'ENABLED',
              capability: { code: capabilityCode, isActive: true },
            },
            select: { capabilityId: true },
          });
          if (!capability) {
            throw new ForbiddenDomainError(
              `Federation capability is not enabled for this organization: ${capabilityCode}`,
            );
          }
        }
        return tx.federationGrant.findMany({
          where: {
            clientId,
            organizationId,
            status: 'ACTIVE',
            startsAt: { lte: new Date() },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            AND: [{ OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] }],
          },
          include: { scopes: { include: { scope: true } } },
        });
      },
    );
    const denied = grants.some(
      (grant) =>
        grant.effect === 'DENY' && grant.scopes.some((entry) => entry.scope.code === scope),
    );
    const allowed = grants.some(
      (grant) =>
        grant.effect === 'ALLOW' && grant.scopes.some((entry) => entry.scope.code === scope),
    );
    if (denied || !allowed)
      throw new ForbiddenDomainError(
        `Federation grant does not allow scope ${scope} for this organization or branch`,
      );
    const permissions = effectiveFederationPermissions(grants);
    return {
      branchId: branchId ?? grants.find((grant) => grant.branchId)?.branchId,
      permissions,
    };
  }

  async listCapabilities(clientId: string, organizationId: string) {
    const capabilities = await this.database.run(
      {
        organizationId,
        accessMode: 'FEDERATION',
        actor: { type: 'FEDERATION_CLIENT', clientId },
        correlationId: randomUUID(),
        requestId: randomUUID(),
        permissions: new Set(),
      },
      (tx) =>
        tx.organizationFederationCapability.findMany({
          where: { organizationId, status: 'ENABLED', capability: { isActive: true } },
          select: {
            status: true,
            capability: { select: { code: true, version: true, description: true } },
          },
          orderBy: { capability: { code: 'asc' } },
        }),
    );
    return {
      capabilities,
      grantableCapabilities: [...FEDERATION_GRANTABLE_SCOPES],
    };
  }

  async resolveTarget(
    clientId: string,
    externalOrganizationId: string,
    externalBranchId: string | undefined,
    scope: string,
  ) {
    const organization = await this.database.runSystem(undefined, (tx) =>
      tx.organization.findFirst({
        where: {
          OR: [
            { externalId: externalOrganizationId },
            ...(isUuid(externalOrganizationId) ? [{ id: externalOrganizationId }] : []),
          ],
        },
        select: { id: true },
      }),
    );
    if (!organization)
      throw new ConflictError(
        'Federated tenant must be registered before this operation can be authorized',
      );
    const branch = externalBranchId
      ? await this.database.runSystem(undefined, (tx) =>
          tx.branch.findFirst({
            where: {
              organizationId: organization.id,
              OR: [
                { externalId: externalBranchId },
                ...(isUuid(externalBranchId) ? [{ id: externalBranchId }] : []),
              ],
            },
            select: { id: true },
          }),
        )
      : undefined;
    if (externalBranchId && !branch)
      throw new ConflictError(
        'Federated branch must be registered before this operation can be authorized',
      );
    const resolved = await this.resolve(clientId, organization.id, branch?.id, scope);
    return {
      organizationId: organization.id,
      branchId: resolved.branchId ?? branch?.id,
      permissions: resolved.permissions,
    };
  }
}

export function capabilityForScope(scope: string) {
  if (scope.startsWith('employees.')) return 'employees';
  if (scope.startsWith('attendance.webauthn.')) return 'device_verification';
  if (scope.startsWith('attendance.')) return 'attendance';
  if (scope.startsWith('leave.')) return 'leave';
  if (scope.startsWith('approval-policies.')) return 'approval_policies';
  if (scope.startsWith('files.')) return 'leave';
  if (scope.startsWith('timesheets.')) return 'timesheets';
  if (scope.startsWith('shifts.')) return 'shifts';
  if (scope.startsWith('payroll.compliance.')) return 'compliance';
  if (scope.startsWith('payroll.')) return 'payroll';
  return undefined;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
