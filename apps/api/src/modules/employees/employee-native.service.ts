import { Injectable } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth.session.service';
import {
  EmployeeStatus,
  EmploymentType,
  IdentityType,
  OwnerSource,
} from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import {
  ConflictError,
  ForbiddenDomainError,
  NotFoundError,
  StaleWriteError,
} from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { toEmployeeDto } from './employee-mappers';
import { assertMayReadEmployee, canReadAllEmployees, findSelfEmployeeId } from './employee-access';
import { endOpenPrimaryAssignments, externallyOwnedFields, setOwnership } from './employee-shared';

/**
 * Employees this tenant owns: creating, reading, listing, editing, moving between branches and
 * deactivating.
 *
 * The native half of the module. Everything here is authoritative in this database, which is what
 * separates it from the federated half where BlizBooks owns most fields.
 */
@Injectable()
export class EmployeeNativeService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: AuthSessionService,
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
      await setOwnership(
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

  async get(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
        include: { fieldOwnership: true, branchAssignments: true },
      });
      if (!employee) throw new NotFoundError('Employee');
      // After the existence check, so an employee in another tenant reports as missing rather
      // than as refused.
      await assertMayReadEmployee(tx, context, employee.id);
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

  /**
   * The employee directory.
   *
   * `employees.read` alone returns the caller's own record and nothing else. The tenant-wide
   * directory needs `employees.read.all` or the wildcard, because these rows carry
   * `personalEmail` and `phone` for every member of staff — the response is a full contact
   * export, not a name list.
   */

  async list(context: DomainContext, filters: { limit?: number; cursor?: string } = {}) {
    requirePermission(context, 'employees.read');
    // Capped server-side rather than trusted from the query: an unbounded read here loads every
    // employee row into memory and holds the RLS transaction open for the whole serialisation.
    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 200);
    return this.database.run(context, async (tx) => {
      if (!canReadAllEmployees(context)) {
        const selfEmployeeId = await findSelfEmployeeId(tx, context);
        // A user with no employee record of their own sees an empty directory, not everyone's.
        if (!selfEmployeeId) return { items: [], nextCursor: undefined };
        const self = await tx.employee.findFirst({
          where: { id: selfEmployeeId, organizationId: context.organizationId },
        });
        return { items: self ? [toEmployeeDto(self)] : [], nextCursor: undefined };
      }
      const employees = await tx.employee.findMany({
        where: { organizationId: context.organizationId },
        // Paging needs a total order, and (lastName, firstName) is not unique — two people with
        // the same name would make the cursor ambiguous and could skip or repeat a row. Id is
        // the tiebreaker and the cursor.
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
        take: limit + 1,
      });
      const hasNextPage = employees.length > limit;
      const page = employees.slice(0, limit);
      return {
        items: page.map((employee) => toEmployeeDto(employee)),
        nextCursor: hasNextPage ? page.at(-1)?.id : undefined,
      };
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
        await endOpenPrimaryAssignments(
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
}
