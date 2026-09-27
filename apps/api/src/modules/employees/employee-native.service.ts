import { takeEmployeeNumber } from './departments.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  assertEmployeeNumberFree,
  assertLoginEmailFree,
  assertWorkEmailFree,
  nextOrganizationEmployeeNumber,
  normalizeEmail,
  normalizeEmployeeNumber,
  saveAadhaar,
} from './employee-identity-rules';
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
import { dateOnly, toEmployeeDto } from './employee-mappers';
import { assertMayReadEmployee, canReadAllEmployees, findSelfEmployeeId } from './employee-access';
import { externallyOwnedFields, setOwnership } from './employee-shared';
import { ensurePrimaryRow, openBranch, organizationToday } from './employee-branch-rules';
import { applyEmployeeBranchEdit } from './employee-branch-edit';
import { markPayrollStale } from '../payroll/payroll-staleness';
import { endCurrentRelationships } from './employee-lifecycle';

/**
 * Employees this tenant owns: creating, reading, listing, editing, moving between branches and
 * deactivating.
 *
 * The native half of the module. Everything here is authoritative in this database, which is what
 * separates it from the federated half where BlizBooks owns most fields.
 */
/**
 * A directory row: the shared employee shape plus the joining date, which "recently joined" and
 * tenure need. Added here rather than to `toEmployeeDto`, which a partner integration also reads.
 */
function directoryRow(
  employee: Parameters<typeof toEmployeeDto>[0] & { dateOfJoining: Date | null },
) {
  const joined = employee.dateOfJoining;
  return {
    ...toEmployeeDto(employee),
    dateOfJoining: joined ? joined.toISOString().slice(0, 10) : null,
  };
}

@Injectable()
export class EmployeeNativeService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: AuthSessionService,
    private readonly config: ConfigService,
  ) {}

  async createNative(
    context: DomainContext,
    input: {
      employeeNumber?: string;
      departmentId?: string;
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
      /** Required: an employee cannot be created without a valid Aadhaar number. */
      aadhaarNumber: string;
      /** Set when a login will be created next, so a taken address is refused before anything. */
      createLogin?: boolean;
    },
  ) {
    requirePermission(context, 'employees.write');
    const workEmail = normalizeEmail(input.workEmail);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new ConflictError('Enter the first and last name.');
    if (input.createLogin && !workEmail)
      throw new ConflictError('A work email is needed to create a login.');
    return this.database.run(context, async (tx) => {
      // Every check runs before anything is written, so a refusal leaves no half-made employee.
      await assertWorkEmailFree(tx, context.organizationId, workEmail);
      if (input.createLogin) await assertLoginEmailFree(tx, context.organizationId, workEmail);
      if (input.primaryBranchId) {
        const branch = await tx.branch.findFirst({
          where: { id: input.primaryBranchId, organizationId: context.organizationId },
          select: { name: true, status: true },
        });
        if (!branch) throw new NotFoundError('Branch');
        if (branch.status !== 'ACTIVE')
          throw new ConflictError(`${branch.name} is deactivated, so nobody can be hired into it.`);
      }
      if (
        input.departmentId &&
        !(await tx.department.findFirst({
          where: { id: input.departmentId, organizationId: context.organizationId },
          select: { id: true },
        }))
      )
        throw new NotFoundError('Department');
      // A typed ID wins; otherwise the department's series; otherwise the company's (EMP001 …).
      const typed = input.employeeNumber ? normalizeEmployeeNumber(input.employeeNumber) : '';
      const employeeNumber =
        typed ||
        (input.departmentId
          ? await takeEmployeeNumber(tx, context.organizationId, input.departmentId)
          : null) ||
        (await nextOrganizationEmployeeNumber(tx, context.organizationId));
      await assertEmployeeNumberFree(tx, context.organizationId, employeeNumber);
      const employee = await tx.employee.create({
        data: {
          organizationId: context.organizationId,
          employeeNumber,
          departmentId: input.departmentId,
          firstName,
          middleName: input.middleName,
          lastName,
          preferredName: input.preferredName,
          workEmail,
          personalEmail: input.personalEmail,
          phone: input.phone,
          identitySource: IdentityType.NATIVE,
          employmentType: input.employmentType,
          dateOfJoining: input.dateOfJoining ? dateOnly(input.dateOfJoining) : undefined,
          primaryBranchId: input.primaryBranchId,
        },
      });
      await saveAadhaar(tx, this.config, context.organizationId, employee.id, input.aadhaarNumber);
      // The primary branch gets its history row from the start, dated from joining.
      await ensurePrimaryRow(
        tx,
        context.organizationId,
        employee,
        await organizationToday(tx, context.organizationId),
        context.accessMode,
      );
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
        return { items: self ? [directoryRow(self)] : [], nextCursor: undefined };
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
        items: page.map(directoryRow),
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
      employmentType?: EmploymentType;
      dateOfJoining?: string | null;
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
      // Someone who has left is kept as history, exactly as they were; their record is not edited.
      if (employee.status !== 'ACTIVE')
        throw new ConflictError(
          `${employee.firstName} ${employee.lastName} has left the company, so their record can no longer be edited.`,
        );
      const { primaryBranchId: requestedBranchId, ...fields } = input;
      const requestedBranch =
        requestedBranchId && requestedBranchId !== employee.primaryBranchId
          ? await openBranch(tx, context.organizationId, requestedBranchId)
          : null;
      const blocked = employee.fieldOwnership.filter(
        (ownership) =>
          blockedFields.includes(ownership.fieldName) &&
          ownership.ownerSource === OwnerSource.FEDERATED,
      );
      if (blocked.length)
        throw new ForbiddenDomainError(
          `Federated ownership prevents editing: ${blocked.map((field) => field.fieldName).join(', ')}`,
        );
      const workEmail = input.workEmail === undefined ? undefined : normalizeEmail(input.workEmail);
      if (workEmail !== undefined)
        await assertWorkEmailFree(tx, context.organizationId, workEmail, employeeId);
      for (const field of ['firstName', 'lastName'] as const)
        if (input[field] !== undefined && !input[field].trim())
          throw new ConflictError('The first and last name cannot be empty.');
      const result = await tx.employee.updateMany({
        where: { id: employeeId, organizationId: context.organizationId, version },
        data: {
          // Everything but the primary branch, which moves through its history below.
          ...fields,
          ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
          ...(workEmail !== undefined ? { workEmail } : {}),
          ...(input.dateOfJoining !== undefined
            ? { dateOfJoining: input.dateOfJoining ? dateOnly(input.dateOfJoining) : null }
            : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new StaleWriteError();
      // After the versioned write, so the version the caller sent is the one checked.
      await applyEmployeeBranchEdit(tx, context, employee, {
        branch: requestedBranch,
        dateOfJoining:
          input.dateOfJoining === undefined
            ? undefined
            : input.dateOfJoining
              ? dateOnly(input.dateOfJoining)
              : null,
      });
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

  async deactivate(context: DomainContext, employeeId: string, reason: string) {
    requirePermission(context, 'employees.write');
    if (!reason.trim()) throw new ConflictError('Employee deactivation requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, organizationId: context.organizationId },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (employee.userId && employee.userId === context.actor.userId)
        throw new ConflictError('You cannot deactivate your own employee record');
      // The company's own date: from midnight to 05:30 in India the UTC date is still yesterday,
      // which recorded the wrong last day and discarded a branch move made that morning. A
      // partner integration keeps the date it has always been given.
      const today =
        context.accessMode === 'NATIVE'
          ? await organizationToday(tx, context.organizationId)
          : dateOnly(new Date().toISOString());
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: {
          status: 'INACTIVE',
          deactivatedAt: new Date(),
          // Their last day, unless one was already recorded when the exit was planned.
          dateOfLeaving: employee.dateOfLeaving ?? today,
          version: { increment: 1 },
        },
      });
      // The payroll run selects `status: 'ACTIVE'` employees, so deactivating someone removes
      // them from the population entirely — a calculated run that still includes them would pay
      // a person the engine would no longer select.
      //
      // Scoped forward from the deactivation rather than across all history. That filter carries
      // no date, so recalculating a long-settled period would drop them from it too; invalidating
      // those runs is a decision about closed payroll, not something this change should make.
      await markPayrollStale(tx, context.organizationId, updated.deactivatedAt ?? new Date());
      // Write the primary branch's history row first if onboarding never did, so the record of
      // where they worked survives their leaving rather than exists only as a column on them.
      await ensurePrimaryRow(
        tx,
        context.organizationId,
        employee,
        await organizationToday(tx, context.organizationId),
        context.accessMode,
        false,
      );
      await endCurrentRelationships(
        tx,
        context.organizationId,
        employeeId,
        updated.dateOfLeaving ?? today,
      );
      if (employee.userId) {
        // Someone who has left cannot sign in to this company again. Only this company: the same
        // person may still work for another one under the same login.
        await tx.userOrganization.updateMany({
          where: {
            organizationId: context.organizationId,
            userId: employee.userId,
            status: 'ACTIVE',
          },
          data: { status: 'SUSPENDED' },
        });
        await this.sessions.revokeAllSessions(employee.userId, 'EMPLOYEE_DEACTIVATED', tx);
      }
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
