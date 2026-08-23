import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';
import {
  requirePermission,
  requireReason,
  type DomainContext,
} from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { EmployeeRecordsService } from '../employees/employee-records.service';
import { EmployeesService } from '../employees/employees.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';

type EmployeePatch = {
  employeeNumber?: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  preferredName?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  phone?: string | null;
  status?: EmployeeStatus;
  employmentType?: EmploymentType;
  dateOfJoining?: string | null;
  dateOfLeaving?: string | null;
  primaryBranchId?: string;
  managerEmployeeId?: string;
  externalVersion?: string;
};

type EmployeeCursor = {
  lastName: string;
  firstName: string;
  employeeNumber: string;
  id: string;
};

function encodeEmployeeCursor(value: Record<string, unknown>) {
  const stringField = (field: string) => (typeof value[field] === 'string' ? value[field] : '');
  return Buffer.from(
    JSON.stringify({
      lastName: stringField('lastName'),
      firstName: stringField('firstName'),
      employeeNumber: stringField('employeeNumber'),
      id: stringField('id'),
    } satisfies EmployeeCursor),
  ).toString('base64url');
}

function decodeEmployeeCursor(value?: string): EmployeeCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<EmployeeCursor>;
    if (
      typeof decoded.lastName !== 'string' ||
      typeof decoded.firstName !== 'string' ||
      typeof decoded.employeeNumber !== 'string' ||
      typeof decoded.id !== 'string' ||
      !decoded.id
    )
      throw new Error('invalid');
    return decoded as EmployeeCursor;
  } catch {
    throw new ConflictError('Employee cursor is invalid or expired');
  }
}

@Injectable()
export class FederatedEmployeeService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly employees: EmployeesService,
    private readonly records: EmployeeRecordsService,
    private readonly audit: AuditService,
  ) {}

  async list(
    context: DomainContext,
    filters: {
      search?: string;
      status?: EmployeeStatus;
      branchId?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const effectiveDate = new Date();
      const search = filters.search?.trim();
      // FederationControllerSupport resolves the external branch identifier
      // before creating the context. Filtering with the raw query value here
      // would compare an external ID with the internal branch foreign key and
      // silently return an empty page.
      const branchId = context.branchId;
      const conditions: Prisma.EmployeeWhereInput[] = [];
      if (search) {
        conditions.push({
          OR: [
            { employeeNumber: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { workEmail: { contains: search, mode: 'insensitive' } },
          ],
        });
      }
      if (branchId) {
        conditions.push({
          OR: [
            { primaryBranchId: branchId },
            { branchAssignments: { some: { branchId, endsOn: null } } },
          ],
        });
      }
      const cursor = decodeEmployeeCursor(filters.cursor);
      if (cursor) {
        conditions.push({
          OR: [
            { lastName: { gt: cursor.lastName } },
            { lastName: cursor.lastName, firstName: { gt: cursor.firstName } },
            {
              lastName: cursor.lastName,
              firstName: cursor.firstName,
              employeeNumber: { gt: cursor.employeeNumber },
            },
            {
              lastName: cursor.lastName,
              firstName: cursor.firstName,
              employeeNumber: cursor.employeeNumber,
              id: { gt: cursor.id },
            },
          ],
        });
      }
      const pageSize = filters.limit ?? 200;
      const employees = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          ...(filters.status ? { status: filters.status } : {}),
          ...(conditions.length ? { AND: conditions } : {}),
        },
        include: {
          user: { select: { isActive: true } },
          fieldOwnership: true,
          branchAssignments: true,
          employmentRecords: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
          compensations: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
          payrollPolicies: {
            where: {
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { employeeNumber: 'asc' },
          { id: 'asc' },
        ],
        take: pageSize + 1,
      });
      const hasMore = employees.length > pageSize;
      const items = (hasMore ? employees.slice(0, pageSize) : employees).map((employee) =>
        this.employeeDto(employee),
      );
      const last = items.at(-1);
      return {
        items,
        nextCursor: hasMore && last ? encodeEmployeeCursor(last) : null,
      };
    });
  }

  async get(context: DomainContext, externalId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      const effectiveDate = new Date();
      const employee = await tx.employee.findFirst({
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
        include: {
          user: { select: { isActive: true } },
          fieldOwnership: true,
          branchAssignments: { include: { branch: true }, orderBy: { startsOn: 'desc' } },
          emergencyContacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
          employmentRecords: { orderBy: { effectiveFrom: 'desc' } },
          compensations: { orderBy: { effectiveFrom: 'desc' } },
          payrollPolicies: {
            where: {
              effectiveFrom: { lte: effectiveDate },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
            },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
          manager: {
            select: {
              id: true,
              externalId: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      return this.employeeDto(employee);
    });
  }

  async upsert(
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
      primaryBranchId?: string;
      managerEmployeeId?: string;
      externalVersion?: string;
    },
  ) {
    return this.employees.syncFederated(context, externalId, clientId, input);
  }

  async patch(context: DomainContext, externalId: string, clientId: string, input: EmployeePatch) {
    const current = await this.findRaw(context, externalId);
    return this.upsert(context, externalId, clientId, {
      employeeNumber: input.employeeNumber ?? current.employeeNumber,
      firstName: input.firstName ?? current.firstName,
      middleName:
        input.middleName !== undefined ? input.middleName : (current.middleName ?? undefined),
      lastName: input.lastName ?? current.lastName,
      preferredName:
        input.preferredName !== undefined
          ? input.preferredName
          : (current.preferredName ?? undefined),
      workEmail: input.workEmail !== undefined ? input.workEmail : (current.workEmail ?? undefined),
      personalEmail:
        input.personalEmail !== undefined
          ? input.personalEmail
          : (current.personalEmail ?? undefined),
      phone: input.phone !== undefined ? input.phone : (current.phone ?? undefined),
      status: input.status ?? current.status,
      employmentType: input.employmentType ?? current.employmentType,
      dateOfJoining:
        input.dateOfJoining !== undefined
          ? input.dateOfJoining
          : current.dateOfJoining?.toISOString().slice(0, 10),
      dateOfLeaving:
        input.dateOfLeaving !== undefined
          ? input.dateOfLeaving
          : current.dateOfLeaving?.toISOString().slice(0, 10),
      primaryBranchId: input.primaryBranchId ?? current.primaryBranchId ?? undefined,
      managerEmployeeId: input.managerEmployeeId ?? current.managerEmployeeId ?? undefined,
      externalVersion: input.externalVersion,
    });
  }

  async deactivate(context: DomainContext, externalId: string, reason: string) {
    const employee = await this.findRaw(context, externalId);
    return this.employees.deactivate(context, employee.id, reason);
  }

  async internalId(context: DomainContext, externalId: string) {
    const employee = await this.findRaw(context, externalId);
    return employee.id;
  }

  async internalUserId(context: DomainContext, externalId: string) {
    const employee = await this.findRaw(context, externalId);
    if (!employee.userId || !employee.user?.isActive)
      throw new ConflictError('The federation approver must have an active user account');
    return employee.userId;
  }

  async contacts(context: DomainContext, externalId: string) {
    return this.records.listEmergencyContacts(context, await this.internalId(context, externalId));
  }

  async addContact(
    context: DomainContext,
    externalId: string,
    input: Parameters<EmployeesService['addEmergencyContact']>[2],
  ) {
    return this.employees.addEmergencyContact(
      context,
      await this.internalId(context, externalId),
      input,
    );
  }

  async employment(context: DomainContext, externalId: string) {
    const employee = await this.findRaw(context, externalId);
    return employee.employmentRecords;
  }

  async addEmployment(
    context: DomainContext,
    externalId: string,
    input: Parameters<EmployeesService['addEmploymentRecord']>[2],
  ) {
    return this.employees.addEmploymentRecord(
      context,
      await this.internalId(context, externalId),
      input,
    );
  }

  async compensation(context: DomainContext, externalId: string) {
    const employee = await this.findRaw(context, externalId);
    return employee.compensations;
  }

  async addCompensation(
    context: DomainContext,
    externalId: string,
    input: Parameters<EmployeesService['addCompensation']>[2],
  ) {
    return this.employees.addCompensation(
      context,
      await this.internalId(context, externalId),
      input,
    );
  }

  async assignManager(context: DomainContext, externalId: string, managerExternalId: string) {
    return this.employees.assignManager(
      context,
      await this.internalId(context, externalId),
      await this.internalId(context, managerExternalId),
    );
  }

  async removeBranch(
    context: DomainContext,
    externalEmployeeId: string,
    externalBranchId: string,
    reason: string,
  ) {
    requirePermission(context, 'employees.branches.write');
    requireReason({ ...context, reason }, 'Branch removal requires a reason');
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { organizationId: context.organizationId, externalId: externalEmployeeId },
      });
      const branch = await tx.branch.findFirst({
        where: { organizationId: context.organizationId, externalId: externalBranchId },
      });
      if (!employee) throw new NotFoundError('Employee');
      if (!branch) throw new NotFoundError('Branch');
      const assignment = await tx.employeeBranchAssignment.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId: employee.id,
          branchId: branch.id,
          endsOn: null,
        },
      });
      if (!assignment) throw new NotFoundError('Employee branch assignment');
      const today = new Date();
      const endsOn = assignment.startsOn > today ? assignment.startsOn : today;
      const updated = await tx.employeeBranchAssignment.update({
        where: { id: assignment.id },
        data: { endsOn, isPrimary: false },
      });
      if (employee.primaryBranchId === branch.id) {
        const replacement = await tx.employeeBranchAssignment.findFirst({
          where: {
            organizationId: context.organizationId,
            employeeId: employee.id,
            endsOn: null,
            id: { not: assignment.id },
          },
          orderBy: [{ isPrimary: 'desc' }, { startsOn: 'desc' }],
        });
        await tx.employee.update({
          where: { id: employee.id },
          data: { primaryBranchId: replacement?.branchId ?? null, version: { increment: 1 } },
        });
      }
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_BRANCH_ASSIGNMENT',
          entityId: assignment.id,
          action: 'EMPLOYEE_BRANCH_REMOVED',
          beforeState: jsonSnapshot(assignment),
          afterState: jsonSnapshot(updated),
          reason,
        },
        tx,
      );
      return updated;
    });
  }

  private async findRaw(context: DomainContext, externalId: string) {
    return this.database.run(context, async (tx) => {
      const employee = await tx.employee.findFirst({
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
        include: {
          user: { select: { isActive: true } },
          employmentRecords: { orderBy: { effectiveFrom: 'desc' } },
          compensations: { orderBy: { effectiveFrom: 'desc' } },
        },
      });
      if (!employee) throw new NotFoundError('Employee');
      return employee;
    });
  }

  private employeeDto(value: Record<string, unknown>) {
    const employee = value as {
      id: string;
      organizationId: string;
      employeeNumber: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      preferredName: string | null;
      workEmail: string | null;
      personalEmail?: string | null;
      phone?: string | null;
      identitySource: string;
      externalId: string | null;
      status: string;
      employmentType: string;
      dateOfJoining?: Date | null;
      dateOfLeaving?: Date | null;
      managerEmployeeId?: string | null;
      primaryBranchId: string | null;
      version: number;
      fieldOwnership?: Array<{
        fieldName: string;
        ownerSource: string;
        ownerClientId: string | null;
      }>;
      branchAssignments?: Array<Record<string, unknown>>;
      emergencyContacts?: Array<Record<string, unknown>>;
      employmentRecords?: Array<Record<string, unknown>>;
      compensations?: Array<Record<string, unknown>>;
      payrollPolicies?: Array<Record<string, unknown>>;
      manager?: Record<string, unknown> | null;
      user?: { isActive: boolean } | null;
    };
    return {
      id: employee.id,
      externalId: employee.externalId,
      organizationId: employee.organizationId,
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName: [employee.firstName, employee.middleName, employee.lastName]
        .filter(Boolean)
        .join(' '),
      workEmail: employee.workEmail,
      personalEmail: employee.personalEmail,
      phone: employee.phone,
      identitySource: employee.identitySource,
      status: employee.status,
      isActive: employee.status === EmployeeStatus.ACTIVE,
      hasActiveUser: employee.user?.isActive === true,
      employmentType: employee.employmentType,
      dateOfJoining: employee.dateOfJoining?.toISOString().slice(0, 10) ?? null,
      dateOfLeaving: employee.dateOfLeaving?.toISOString().slice(0, 10) ?? null,
      managerEmployeeId: employee.managerEmployeeId ?? null,
      primaryBranchId: employee.primaryBranchId,
      version: employee.version,
      ownedFields: employee.fieldOwnership ?? [],
      branchAssignments: employee.branchAssignments ?? [],
      emergencyContacts: employee.emergencyContacts ?? [],
      employmentRecords: employee.employmentRecords ?? [],
      compensations: employee.compensations ?? [],
      payrollPolicy: employee.payrollPolicies?.[0]
        ? {
            payrollEnabled: employee.payrollPolicies[0].payrollEnabled,
            salarySlipMode: employee.payrollPolicies[0].salarySlipMode,
            pfEnabled: employee.payrollPolicies[0].pfEnabled,
            esiEnabled: employee.payrollPolicies[0].esiEnabled,
            ptEnabled: employee.payrollPolicies[0].ptEnabled,
            statutoryJurisdiction: employee.payrollPolicies[0].statutoryJurisdiction,
            effectiveFrom: employee.payrollPolicies[0].effectiveFrom,
            effectiveTo: employee.payrollPolicies[0].effectiveTo,
          }
        : null,
      manager: employee.manager ?? null,
    };
  }
}
