import { Injectable } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth.session.service';
import { Prisma } from '../../generated/prisma/client';
import { takeFederatedEmployeeNumber } from './employee-numbering';
import {
  employeeOnboardingDetailsSchema,
  type EmployeeOnboardingDetails,
} from '@smarteam/contracts';
import { EmployeeRecordsService } from './employee-records.service';
import {
  EmployeeStatus,
  EmploymentType,
  IdentityType,
  OwnerSource,
} from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { toEmployeeDto } from './employee-mappers';
import {
  endOpenPrimaryAssignments,
  externallyOwnedFields,
  federatedEmail,
  setOwnership,
} from './employee-shared';

/**
 * Employee records mastered by a federation partner.
 *
 * Employees without a supplied number receive a hotel-wide number atomically on creation.
 * Subsequent syncs preserve that number unless a legacy caller explicitly supplies one.
 *
 * Field ownership is the rule throughout: a field the partner owns is overwritten on every sync,
 * one this tenant owns is not.
 */
@Injectable()
export class EmployeeFederationSyncService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: AuthSessionService,
    private readonly records?: EmployeeRecordsService,
  ) {}

  async syncFederated(
    context: DomainContext,
    externalId: string,
    clientId: string,
    input: {
      personalDetails?: EmployeeOnboardingDetails;
      employeeNumber?: string;
      employeeNumberPrefix?: string;
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
    const parsedPersonal =
      input.personalDetails === undefined
        ? undefined
        : employeeOnboardingDetailsSchema.safeParse(input.personalDetails);
    if (parsedPersonal && !parsedPersonal.success)
      throw new ConflictError('Complete all required employee personal details.');
    const personalDetails = parsedPersonal?.success ? parsedPersonal.data : undefined;
    if (personalDetails) {
      requirePermission(context, 'employees.personal_details.write');
      requirePermission(context, 'employees.bank_details.write');
      if (!this.records) throw new ConflictError('Employee record storage is unavailable.');
    }
    const suppliedNumber = input.employeeNumber?.trim();
    if (input.employeeNumber !== undefined && !suppliedNumber) {
      throw new ConflictError('Employee number cannot be empty.');
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.database.run(context, async (tx) => {
          if (!suppliedNumber) {
            // Serialize automatic hires in the hotel, including concurrent retries
            // of the same external employee. The number and record commit together.
            await tx.$queryRaw`SELECT "id" FROM "organizations" WHERE "id" = ${context.organizationId}::uuid FOR UPDATE`;
          }
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
            if (!manager || manager.id === existing?.id)
              throw new ConflictError('Manager is invalid');
            managerEmployeeId = manager.id;
          }
          const data = {
            employeeNumber:
              suppliedNumber ??
              existing?.employeeNumber ??
              (await takeFederatedEmployeeNumber(
                tx,
                context.organizationId,
                input.employeeNumberPrefix,
              )),
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
            deactivatedAt:
              input.status && input.status !== EmployeeStatus.ACTIVE ? new Date() : null,
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
          if (personalDetails)
            await this.records!.saveOnboarding(
              context,
              employee.id,
              personalDetails,
              tx,
              input.dateOfJoining ?? undefined,
            );
          await tx.userOrganization.upsert({
            where: {
              userId_organizationId: {
                userId: shadowUser.id,
                organizationId: context.organizationId,
              },
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
            await this.sessions.revokeAllSessions(
              employee.userId!,
              'FEDERATED_EMPLOYEE_INACTIVE',
              tx,
            );
          await setOwnership(
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
          return {
            ...toEmployeeDto(employee),
            ...(personalDetails ? { onboardingComplete: true } : {}),
          };
        });
      } catch (error) {
        // An explicit/native hire may claim the candidate while this transaction
        // runs. Retry only the employee-number unique constraint, never other conflicts.
        const target =
          error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : null;
        const numberConflict = Array.isArray(target)
          ? target.some((field) => field === 'employeeNumber' || field === 'employee_number')
          : typeof target === 'string' && target.includes('employee_number');
        if (
          suppliedNumber ||
          attempt >= 2 ||
          !numberConflict ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
    }
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
        await endOpenPrimaryAssignments(
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
}
