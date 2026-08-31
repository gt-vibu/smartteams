import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  EmployeeStatus,
  EmploymentType,
  IdentityType,
  OwnerSource,
} from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
  StaleWriteError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { AuthSessionService } from '../auth/auth.session.service';
import { createHash } from 'node:crypto';
import { EmployeeRecordsService } from './employee-records.service';
import { toEmployeeDto } from './employee-mappers';

const externallyOwnedFields = new Set([
  'employeeNumber',
  'firstName',
  'middleName',
  'lastName',
  'preferredName',
  'workEmail',
  'personalEmail',
  'phone',
  'status',
  'employmentType',
  'dateOfJoining',
  'dateOfLeaving',
  'managerEmployeeId',
  'primaryBranchId',
]);

@Injectable()
export class EmployeesService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: AuthSessionService,
    private readonly records: EmployeeRecordsService,
  ) {}

  async createNative(
    context: DomainContext,
    input: {
      employeeNumber: string;
      firstName: string;
      middleName?: string | null;
      lastName: string;
      preferredName?: string | null;
      workEmail?: string | null;
      personalEmail?: string | null;
      phone?: string | null;
      employmentType: EmploymentType;
      dateOfJoining?: string | null;
      primaryBranchId?: string;
    },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      if (
        input.primaryBranchId &&
        !(await tx.branch.findFirst({
          where: { id: input.primaryBranchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const employee = await tx.employee.create({
        data: {
          organizationId: context.organizationId,
          employeeNumber: input.employeeNumber,
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          preferredName: input.preferredName,
          workEmail: input.workEmail,
          personalEmail: input.personalEmail,
          phone: input.phone,
          identitySource: IdentityType.NATIVE,
          employmentType: input.employmentType,
          dateOfJoining: input.dateOfJoining ? new Date(input.dateOfJoining) : undefined,
          primaryBranchId: input.primaryBranchId,
        },
      });
      await this.setOwnership(
        tx,
        context,
        employee.id,
        Object.keys(employee).filter((field) => externallyOwnedFields.has(field)),
        OwnerSource.NATIVE,
      );
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_CREATED',
          afterState: jsonSnapshot(employee),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Employee',
          aggregateId: employee.id,
          aggregateVersion: employee.version,
          eventType: 'employee.created',
          payload: jsonSnapshot(toEmployeeDto(employee)),
        },
        tx,
      );
      return toEmployeeDto(employee);
    });
  }

  async syncFederated(
    context: DomainContext,
    externalId: string,
    clientId: string,
    input: {
      employeeNumber: string;
      firstName: string;
      middleName?: string | null;
      lastName: string;
      preferredName?: string | null;
      workEmail?: string | null;
      personalEmail?: string | null;
      phone?: string | null;
      status?: EmployeeStatus;
      employmentType?: EmploymentType;
      dateOfJoining?: string | null;
      dateOfLeaving?: string | null;
      managerEmployeeId?: string;
      primaryBranchId?: string;
      externalVersion?: string;
    },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const existing = await tx.employee.findFirst({
        where: {
          organizationId: context.organizationId,
          externalId,
          ...(context.branchId
            ? {
                OR: [
                  { primaryBranchId: context.branchId },
                  { branchAssignments: { some: { branchId: context.branchId, endsOn: null } } },
                ],
              }
            : {}),
        },
      });
      // Federation callers identify branches by the external id BlizBooks
      // provisioned; native callers use the internal id. Accept either, but
      // persist the resolved internal id for the foreign key.
      let primaryBranchId = input.primaryBranchId;
      if (primaryBranchId) {
        const branch = await tx.branch.findFirst({
          where: {
            organizationId: context.organizationId,
            OR: [{ id: primaryBranchId }, { externalId: primaryBranchId }],
          },
        });
        if (!branch) throw new NotFoundError('Branch');
        primaryBranchId = branch.id;
      }
      let managerEmployeeId = input.managerEmployeeId;
      if (managerEmployeeId) {
        const manager = await tx.employee.findFirst({
          where: {
            organizationId: context.organizationId,
            OR: [{ id: managerEmployeeId }, { externalId: managerEmployeeId }],
            status: EmployeeStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!manager || manager.id === existing?.id) throw new ConflictError('Manager is invalid');
        managerEmployeeId = manager.id;
      }
      const data = {
        employeeNumber: input.employeeNumber,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        preferredName: input.preferredName,
        workEmail: input.workEmail,
        personalEmail: input.personalEmail,
        phone: input.phone,
        status: input.status ?? EmployeeStatus.ACTIVE,
        employmentType: input.employmentType ?? EmploymentType.FULL_TIME,
        dateOfJoining:
          input.dateOfJoining === null
            ? null
            : input.dateOfJoining
              ? new Date(input.dateOfJoining)
              : undefined,
        dateOfLeaving:
          input.dateOfLeaving === null
            ? null
            : input.dateOfLeaving
              ? new Date(input.dateOfLeaving)
              : undefined,
        managerEmployeeId,
        primaryBranchId,
        deactivatedAt: input.status && input.status !== EmployeeStatus.ACTIVE ? new Date() : null,
        identitySource: IdentityType.FEDERATED,
        externalId,
      };
      const shadowUser = existing?.userId
        ? { id: existing.userId }
        : ((await tx.user.findFirst({
            where: {
              externalIdentityProvider: `federation:${clientId}`,
              externalOrganizationId: context.organizationId,
              externalIdentityId: externalId,
            },
            select: { id: true },
          })) ??
          (await tx.user.create({
            data: {
              email: federatedEmail(clientId, externalId),
              emailNormalized: federatedEmail(clientId, externalId),
              displayName: `${input.firstName} ${input.lastName}`.trim(),
              identityType: IdentityType.FEDERATED,
              externalIdentityProvider: `federation:${clientId}`,
              externalOrganizationId: context.organizationId,
              externalIdentityId: externalId,
            },
          })));
      const employee = existing
        ? await tx.employee.update({
            where: { id: existing.id },
            data: { ...data, userId: shadowUser.id, version: { increment: 1 } },
          })
        : await tx.employee.create({
            data: { organizationId: context.organizationId, userId: shadowUser.id, ...data },
          });
      await tx.userOrganization.upsert({
        where: {
          userId_organizationId: { userId: shadowUser.id, organizationId: context.organizationId },
        },
        create: {
          userId: shadowUser.id,
          organizationId: context.organizationId,
          status: 'ACTIVE',
          source: 'BLIZBOOKS',
          externalId,
        },
        update: { status: 'ACTIVE', removedAt: null, externalId },
      });
      if (employee.status !== EmployeeStatus.ACTIVE)
        await this.sessions.revokeAllSessions(employee.userId!, 'FEDERATED_EMPLOYEE_INACTIVE', tx);
      await this.setOwnership(
        tx,
        context,
        employee.id,
        [...externallyOwnedFields],
        OwnerSource.FEDERATED,
        clientId,
        input.externalVersion,
      );
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: existing ? 'EMPLOYEE_SYNCED' : 'EMPLOYEE_PROVISIONED',
          beforeState: existing ? jsonSnapshot(existing) : undefined,
          afterState: jsonSnapshot(employee),
        },
        tx,
      );
      await this.outbox.append(
        context,
        {
          aggregateType: 'Employee',
          aggregateId: employee.id,
          aggregateVersion: employee.version,
          eventType: 'employee.changed',
          payload: jsonSnapshot(toEmployeeDto(employee)),
        },
        tx,
      );
      return toEmployeeDto(employee);
    });
  }

  async get(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        include: { fieldOwnership: true, branchAssignments: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      return {
        ...toEmployeeDto(employee),
        ownedFields: employee.fieldOwnership.map((ownership) => ({
          fieldName: ownership.fieldName,
          ownerSource: ownership.ownerSource,
          ownerClientId: ownership.ownerClientId,
        })),
      };
    });
  }

  async list(context: DomainContext) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employees = await tx.employee.findMany({
        where: { organizationId: context.organizationId },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      return employees.map((employee) => toEmployeeDto(employee));
    });
  }

  async updateNative(
    context: DomainContext,
    employeeId: string,
    version: number,
    input: {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      preferredName?: string;
      workEmail?: string;
      personalEmail?: string;
      phone?: string;
      status?: EmployeeStatus;
      primaryBranchId?: string;
    },
  ) {
    requirePermission(context, 'employees.write');
    const blockedFields = Object.keys(input).filter((field) => externallyOwnedFields.has(field));
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        include: { fieldOwnership: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (
        input.primaryBranchId &&
        !(await tx.branch.findFirst({
          where: { id: input.primaryBranchId, organizationId: context.organizationId },
        }))
      )
        throw new NotFoundError('Branch');
      const blocked = employee.fieldOwnership.filter(
        (ownership) =>
          blockedFields.includes(ownership.fieldName) &&
          ownership.ownerSource === OwnerSource.FEDERATED,
      );
      if (blocked.length)
        throw new ForbiddenDomainError(
          `Federated ownership prevents editing: ${blocked.map((field) => field.fieldName).join(', ')}`,
        );
      const result = await tx.employee.updateMany({
        where: { id: employeeId, organizationId: context.organizationId, version },
        data: { ...input, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new StaleWriteError();
      const updated = await tx.employee.findUniqueOrThrow({ where: { id: employeeId } });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          action: 'EMPLOYEE_UPDATED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }

  async assignBranch(
    context: DomainContext,
    employeeId: string,
    input: { branchId: string; startsOn: string; endsOn?: string; isPrimary?: boolean },
  ) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
      });
      if (!employee) throw new NotFoundError('Employee');
      const branch = await tx.branch.findFirst({
        where: { id: input.branchId, organizationId: context.organizationId },
      });
      if (!branch) throw new NotFoundError('Branch');
      if (input.endsOn && new Date(input.endsOn) <= new Date(input.startsOn))
        throw new ConflictError('Branch assignment end must be after its start');
      const startsOn = new Date(input.startsOn);
      const open = await tx.employeeBranchAssignment.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          branchId: input.branchId,
          endsOn: null,
        },
        orderBy: { startsOn: 'desc' },
      });
      let assignment;
      if (open) {
        // Same-day reassignment would overlap the open row under
        // employee_branch_assignments_no_overlap, so extend it in place.
        assignment = await tx.employeeBranchAssignment.update({
          where: { id: open.id },
          data: {
            startsOn: open.startsOn < startsOn ? open.startsOn : startsOn,
            endsOn: input.endsOn ? new Date(input.endsOn) : undefined,
            isPrimary: input.isPrimary ?? open.isPrimary,
          },
        });
      } else {
        await this.endOpenPrimaryAssignments(
          tx,
          context.organizationId,
          employeeId,
          startsOn,
          input.isPrimary,
        );
        assignment = await tx.employeeBranchAssignment.create({
          data: {
            organizationId: context.organizationId,
            employeeId,
            branchId: input.branchId,
            startsOn,
            endsOn: input.endsOn ? new Date(input.endsOn) : undefined,
            isPrimary: input.isPrimary ?? false,
            sourceAccessMode: context.accessMode,
          },
        });
      }
      if (input.isPrimary)
        await tx.employee.update({
          where: { id: employeeId },
          data: { primaryBranchId: input.branchId, version: { increment: 1 } },
        });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_BRANCH_ASSIGNMENT',
          entityId: assignment.id,
          action: 'EMPLOYEE_BRANCH_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      return assignment;
    });
  }

  async assignFederatedBranch(
    context: DomainContext,
    externalEmployeeId: string,
    externalBranchId: string,
    input: { startsOn: string; endsOn?: string; isPrimary?: boolean },
  ) {
    requirePermission(context, 'employees.branches.write');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
      });
      const branch = await tx.branch.findFirst({
        where: { organizationId: context.organizationId, externalId: externalBranchId },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (!branch) throw new NotFoundError('Branch');
      const startsOn = new Date(input.startsOn);
      // Federation sync repeats the same assignment. employee_branch_assignments_
      // no_overlap treats a row as covering its inclusive start date, so
      // close-and-recreate on the same day violates the exclusion constraint.
      // Reuse the open assignment for this branch instead.
      const open = await tx.employeeBranchAssignment.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          branchId: branch.id,
          endsOn: null,
        },
        orderBy: { startsOn: 'desc' },
      });
      let assignment;
      if (open) {
        assignment = await tx.employeeBranchAssignment.update({
          where: { id: open.id },
          data: {
            startsOn: open.startsOn < startsOn ? open.startsOn : startsOn,
            endsOn: input.endsOn ? new Date(input.endsOn) : undefined,
            isPrimary: input.isPrimary ?? open.isPrimary,
          },
        });
      } else {
        await this.endOpenPrimaryAssignments(
          tx,
          context.organizationId,
          employee.id,
          startsOn,
          input.isPrimary,
        );
        assignment = await tx.employeeBranchAssignment.create({
          data: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            branchId: branch.id,
            startsOn,
            endsOn: input.endsOn ? new Date(input.endsOn) : undefined,
            isPrimary: input.isPrimary ?? false,
            sourceAccessMode: context.accessMode,
          },
        });
      }
      if (input.isPrimary)
        await tx.employee.update({
          where: { id: employee.id },
          data: { primaryBranchId: branch.id, version: { increment: 1 } },
        });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_BRANCH_ASSIGNMENT',
          entityId: assignment.id,
          action: 'EMPLOYEE_BRANCH_ASSIGNED',
          afterState: jsonSnapshot(assignment),
        },
        tx,
      );
      return assignment;
    });
  }

  /**
   * Close currently open primary assignments so a replacement can take over.
   * A daterange row covers its end date inclusively, so the boundary is the
   * day before the replacement starts; a same-day primary on another branch
   * cannot move before its own start and instead ends on its start date.
   */
  private async endOpenPrimaryAssignments(
    tx: Prisma.TransactionClient,
    organizationId: string,
    employeeId: string,
    replacementStartsOn: Date,
    close: boolean | undefined,
  ) {
    if (!close) return;
    const boundary = new Date(replacementStartsOn);
    boundary.setUTCDate(boundary.getUTCDate() - 1);
    const openPrimary = await tx.employeeBranchAssignment.findMany({
      where: {
        organizationId,
        employeeId,
        isPrimary: true,
        endsOn: null,
      },
    });
    for (const assignment of openPrimary) {
      await tx.employeeBranchAssignment.update({
        where: { id: assignment.id },
        data: {
          endsOn: assignment.startsOn >= boundary ? assignment.startsOn : boundary,
          isPrimary: false,
        },
      });
    }
  }

  async syncAccess(context: DomainContext, externalEmployeeId: string, permissionKeys: string[]) {
    requirePermission(context, 'employees.access.write');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
        include: { user: true },
      });
      if (!employee?.userId) throw new NotFoundError('Federated employee user');
      const mappedGrant = context.actor.clientId
        ? await tx.federationGrant.findFirst({
            where: {
              clientId: context.actor.clientId,
              organizationId: context.organizationId,
              effect: 'ALLOW',
              status: 'ACTIVE',
              startsAt: { lte: new Date() },
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              AND: [
                {
                  OR: [
                    { branchId: null },
                    ...(context.branchId ? [{ branchId: context.branchId }] : []),
                  ],
                },
              ],
              roleMappings: { some: {} },
            },
            include: { roleMappings: { orderBy: { priority: 'asc' } } },
            orderBy: { createdAt: 'asc' },
          })
        : null;
      const role = mappedGrant?.roleMappings[0]?.roleId
        ? await tx.role.findUniqueOrThrow({ where: { id: mappedGrant.roleMappings[0].roleId } })
        : await tx.role.upsert({
            where: {
              organizationId_code: {
                organizationId: context.organizationId,
                code: `FEDERATED_${employee.id}`,
              },
            },
            create: {
              organizationId: context.organizationId,
              code: `FEDERATED_${employee.id}`,
              name: `Federated access ${employee.employeeNumber}`,
              scope: 'ORGANIZATION',
              isSystem: false,
              permissions: {
                create: permissionKeys.map((key) => ({
                  permission: {
                    connectOrCreate: { where: { key }, create: { key, description: key } },
                  },
                })),
              },
            },
            update: {
              permissions: {
                deleteMany: {},
                create: permissionKeys.map((key) => ({
                  permission: {
                    connectOrCreate: { where: { key }, create: { key, description: key } },
                  },
                })),
              },
            },
          });
      const existingAssignment = await tx.userRole.findFirst({
        where: {
          userId: employee.userId,
          organizationId: context.organizationId,
          roleId: role.id,
          branchId: context.branchId,
        },
      });
      const assignment = existingAssignment
        ? await tx.userRole.update({
            where: { id: existingAssignment.id },
            data: {
              assignmentSource: context.accessMode,
              sourceFederationGrantId: mappedGrant?.id,
              endsAt: null,
            },
          })
        : await tx.userRole.create({
            data: {
              userId: employee.userId,
              organizationId: context.organizationId,
              roleId: role.id,
              branchId: context.branchId,
              assignmentSource: context.accessMode,
              sourceFederationGrantId: mappedGrant?.id,
            },
          });
      await this.audit.record(
        context,
        {
          entityType: 'USER_ROLE',
          entityId: assignment.id,
          action: 'FEDERATED_EMPLOYEE_ACCESS_SYNCED',
          afterState: jsonSnapshot({ employeeId: employee.id, permissionKeys }),
        },
        tx,
      );
      return { employeeId: employee.id, permissionKeys };
    });
  }

  async revokeFederatedSessions(
    context: DomainContext,
    externalEmployeeId: string,
    reason: string,
  ) {
    requirePermission(context, 'employees.sessions.revoke');
    requireReason({ ...context, reason }, 'Session revocation requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
      });
      if (!employee?.userId) throw new NotFoundError('Federated employee user');
      await this.sessions.revokeAllSessions(employee.userId, reason, tx);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_SESSIONS_REVOKED',
          reason,
        },
        tx,
      );
      return { employeeId: employee.id, revoked: true };
    });
  }

  async deactivate(context: DomainContext, employeeId: string, reason: string) {
    requirePermission(context, 'employees.write');
    if (!reason.trim()) throw new ConflictError('Employee deactivation requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
      });
      if (!employee) throw new NotFoundError('Employee');
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { status: 'INACTIVE', deactivatedAt: new Date(), version: { increment: 1 } },
      });
      if (employee.userId)
        await this.sessions.revokeAllSessions(employee.userId, 'EMPLOYEE_DEACTIVATED', tx);
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          action: 'EMPLOYEE_DEACTIVATED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }

  async listEmergencyContacts(context: DomainContext, employeeId: string) {
    return this.records.listEmergencyContacts(context, employeeId);
  }

  async addEmergencyContact(
    context: DomainContext,
    employeeId: string,
    input: {
      name: string;
      relationship: string;
      phone: string;
      email?: string;
      isPrimary?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.records.addEmergencyContact(context, employeeId, input);
  }

  async addEmploymentRecord(
    context: DomainContext,
    employeeId: string,
    input: {
      jobTitle?: string;
      department?: string;
      managerEmployeeId?: string;
      employmentType: EmploymentType;
      status: EmployeeStatus;
      effectiveFrom: string;
      effectiveTo?: string;
    },
  ) {
    return this.records.addEmploymentRecord(context, employeeId, input);
  }

  async addCompensation(
    context: DomainContext,
    employeeId: string,
    input: {
      payType: 'SALARY' | 'HOURLY' | 'DAILY' | 'PER_SHIFT';
      payFrequency: 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';
      baseAmount: number;
      currencyCode: string;
      overtimeMultiplier: number;
      effectiveFrom: string;
      effectiveTo?: string;
    },
  ) {
    return this.records.addCompensation(context, employeeId, input);
  }

  async assignManager(context: DomainContext, employeeId: string, managerEmployeeId: string) {
    return this.records.assignManager(context, employeeId, managerEmployeeId);
  }

  private async setOwnership(
    tx: Parameters<Parameters<TenantDatabaseService['run']>[1]>[0],
    context: DomainContext,
    employeeId: string,
    fields: string[],
    ownerSource: OwnerSource,
    ownerClientId?: string,
    externalVersion?: string,
  ) {
    for (const fieldName of fields) {
      await tx.employeeFieldOwnership.upsert({
        where: { employeeId_fieldName: { employeeId, fieldName } },
        create: {
          employeeId,
          organizationId: context.organizationId,
          fieldName,
          ownerSource,
          ownerClientId,
          lastExternalVersion: externalVersion,
        },
        update: { ownerSource, ownerClientId, lastExternalVersion: externalVersion },
      });
    }
  }
}

function federatedEmail(clientId: string, externalId: string) {
  const suffix = createHash('sha256')
    .update(`${clientId}:${externalId}`)
    .digest('hex')
    .slice(0, 24);
  return `federated-${suffix}@invalid.smarteam.local`;
}
