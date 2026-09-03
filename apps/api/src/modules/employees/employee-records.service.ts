import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly, toEmployeeDto } from './employee-mappers';
import { assertMayReadEmployee } from './employee-access';

@Injectable()
export class EmployeeRecordsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listEmergencyContacts(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      // Next-of-kin names and phone numbers. Self-scoped on the same boundary as the record
      // they hang off.
      await assertMayReadEmployee(tx, context, employeeId);
      return tx.employeeEmergencyContact.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      });
    });
  }

  /**
   * Employment history for an employee, most recent first.
   *
   * `jobTitle` and `department` live on this record rather than on `Employee`, so this is the
   * only way to read them. Deliberately a separate route instead of widening `toEmployeeDto`,
   * which is part of the federation response contract and must not change.
   */
  async listEmploymentRecords(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      await assertMayReadEmployee(tx, context, employeeId);
      return tx.employeeEmploymentRecord.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: [{ effectiveFrom: 'desc' }],
      });
    });
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
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      if (input.isPrimary)
        await tx.employeeEmergencyContact.updateMany({
          where: { organizationId: context.organizationId, employeeId, isPrimary: true },
          data: { isPrimary: false },
        });
      const contact = await tx.employeeEmergencyContact.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          name: input.name.trim(),
          relationship: input.relationship.trim(),
          phone: input.phone.trim(),
          email: input.email?.trim(),
          isPrimary: input.isPrimary ?? false,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_EMERGENCY_CONTACT',
          entityId: contact.id,
          action: 'EMPLOYEE_EMERGENCY_CONTACT_CREATED',
          afterState: jsonSnapshot(contact),
        },
        tx,
      );
      return contact;
    });
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
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : undefined;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Employment record end must not precede its start');
      if (input.managerEmployeeId) {
        if (
          input.managerEmployeeId === employeeId ||
          !(await tx.employee.findFirst({
            where: {
              id: input.managerEmployeeId,
              organizationId: context.organizationId,
              status: EmployeeStatus.ACTIVE,
            },
          }))
        )
          throw new ConflictError(
            'Employment manager must be another active employee in this organization',
          );
      }
      const overlap = await tx.employeeEmploymentRecord.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) {
        if (
          context.accessMode === 'FEDERATION' &&
          overlap.effectiveFrom.getTime() === effectiveFrom.getTime() &&
          overlap.effectiveTo === null
        ) {
          const record = await tx.employeeEmploymentRecord.update({
            where: { id: overlap.id },
            data: {
              jobTitle: input.jobTitle?.trim(),
              department: input.department?.trim(),
              managerEmployeeId: input.managerEmployeeId,
              employmentType: input.employmentType,
              status: input.status,
            },
          });
          await tx.employee.update({
            where: { id: employeeId },
            data: {
              managerEmployeeId: input.managerEmployeeId,
              employmentType: input.employmentType,
              status: input.status,
              version: { increment: 1 },
            },
          });
          await this.audit.record(
            context,
            {
              entityType: 'EMPLOYEE_EMPLOYMENT_RECORD',
              entityId: record.id,
              action: 'EMPLOYEE_EMPLOYMENT_RECORD_UPDATED',
              afterState: jsonSnapshot(record),
            },
            tx,
          );
          return record;
        }
        if (
          context.accessMode === 'FEDERATION' &&
          overlap.effectiveTo === null &&
          effectiveFrom > overlap.effectiveFrom
        ) {
          await tx.employeeEmploymentRecord.update({
            where: { id: overlap.id },
            data: { effectiveTo: dateBefore(effectiveFrom) },
          });
        } else {
          throw new ConflictError('Employment records must not overlap');
        }
      }
      const record = await tx.employeeEmploymentRecord.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          jobTitle: input.jobTitle?.trim(),
          department: input.department?.trim(),
          managerEmployeeId: input.managerEmployeeId,
          employmentType: input.employmentType,
          status: input.status,
          effectiveFrom,
          effectiveTo,
          sourceAccessMode: context.accessMode,
        },
      });
      const employee = await tx.employee.update({
        where: { id: employeeId },
        data: {
          managerEmployeeId: input.managerEmployeeId,
          employmentType: input.employmentType,
          status: input.status,
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_EMPLOYMENT_RECORD',
          entityId: record.id,
          action: 'EMPLOYEE_EMPLOYMENT_RECORD_CREATED',
          afterState: jsonSnapshot({ record, employee }),
        },
        tx,
      );
      return record;
    });
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
    requirePermission(context, 'employees.compensation.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      if (
        !Number.isFinite(input.baseAmount) ||
        input.baseAmount < 0 ||
        !Number.isFinite(input.overtimeMultiplier) ||
        input.overtimeMultiplier <= 0
      )
        throw new ConflictError('Compensation values are invalid');
      const effectiveFrom = dateOnly(input.effectiveFrom);
      const effectiveTo = input.effectiveTo ? dateOnly(input.effectiveTo) : undefined;
      if (effectiveTo && effectiveTo < effectiveFrom)
        throw new ConflictError('Compensation end must not precede its start');
      const overlap = await tx.employeeCompensation.findFirst({
        where: {
          organizationId: context.organizationId,
          employeeId,
          effectiveFrom: { lte: effectiveTo ?? new Date('9999-12-31') },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (overlap) {
        if (
          context.accessMode === 'FEDERATION' &&
          overlap.effectiveFrom.getTime() === effectiveFrom.getTime() &&
          overlap.effectiveTo === null
        ) {
          const compensation = await tx.employeeCompensation.update({
            where: { id: overlap.id },
            data: {
              payType: input.payType,
              payFrequency: input.payFrequency,
              baseAmount: new Prisma.Decimal(input.baseAmount),
              currencyCode: input.currencyCode.toUpperCase(),
              overtimeMultiplier: new Prisma.Decimal(input.overtimeMultiplier),
            },
          });
          await this.audit.record(
            context,
            {
              entityType: 'EMPLOYEE_COMPENSATION',
              entityId: compensation.id,
              action: 'EMPLOYEE_COMPENSATION_UPDATED',
              afterState: jsonSnapshot(compensation),
            },
            tx,
          );
          return compensation;
        }
        if (
          context.accessMode === 'FEDERATION' &&
          overlap.effectiveTo === null &&
          effectiveFrom > overlap.effectiveFrom
        ) {
          await tx.employeeCompensation.update({
            where: { id: overlap.id },
            data: { effectiveTo: dateBefore(effectiveFrom) },
          });
        } else {
          throw new ConflictError('Compensation records must not overlap');
        }
      }
      const compensation = await tx.employeeCompensation.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          payType: input.payType,
          payFrequency: input.payFrequency,
          baseAmount: new Prisma.Decimal(input.baseAmount),
          currencyCode: input.currencyCode.toUpperCase(),
          overtimeMultiplier: new Prisma.Decimal(input.overtimeMultiplier),
          effectiveFrom,
          effectiveTo,
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_COMPENSATION',
          entityId: compensation.id,
          action: 'EMPLOYEE_COMPENSATION_CREATED',
          afterState: jsonSnapshot(compensation),
        },
        tx,
      );
      return compensation;
    });
  }

  /**
   * Links a user account to an employee record.
   *
   * `Employee.userId` has always existed and the whole product depends on it — self-scoped reads
   * resolve "my employee" through it, and manager approval routing follows it from the requester's
   * `managerEmployeeId` to the manager's login. Only the federated sync path ever populated it, so
   * for a natively created employee the column stayed null and both behaviours silently failed:
   * an employee saw no payroll of their own, and a `MANAGER` approval step could never resolve.
   *
   * The column is globally unique, so a user belongs to at most one employee. Both directions are
   * refused rather than overwritten — a silent re-link would move someone's leave, payslips and
   * approval authority to another person.
   */
  async linkUser(context: DomainContext, employeeId: string, userId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const employee = await this.assertEmployee(tx, context.organizationId, employeeId);
      if (employee.userId === userId) return toEmployeeDto(employee);
      if (employee.userId)
        throw new ConflictError('This employee is already linked to a different user account');

      // Membership is the tenant boundary: a user outside this organization must not become one
      // of its employees by id alone.
      const membership = await tx.userOrganization.findFirst({
        where: { userId, organizationId: context.organizationId, status: 'ACTIVE' },
        select: { userId: true },
      });
      if (!membership) throw new NotFoundError('Active organization member');

      const taken = await tx.employee.findFirst({
        where: { userId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (taken) throw new ConflictError('That user account is already linked to another employee');

      const updated = await tx.employee.update({
        where: { id: employee.id },
        data: { userId, version: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employee.id,
          action: 'EMPLOYEE_USER_LINKED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }

  async assignManager(context: DomainContext, employeeId: string, managerEmployeeId: string) {
    requirePermission(context, 'employees.write');
    return this.database.run(context, async (tx) => {
      const employee = await this.assertEmployee(tx, context.organizationId, employeeId);
      if (
        employeeId === managerEmployeeId ||
        !(await tx.employee.findFirst({
          where: {
            id: managerEmployeeId,
            organizationId: context.organizationId,
            status: EmployeeStatus.ACTIVE,
          },
        }))
      )
        throw new ConflictError('Manager must be another active employee in this organization');
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { managerEmployeeId, version: { increment: 1 } },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          action: 'EMPLOYEE_MANAGER_ASSIGNED',
          beforeState: jsonSnapshot(employee),
          afterState: jsonSnapshot(updated),
        },
        tx,
      );
      return toEmployeeDto(updated);
    });
  }

  private async assertEmployee(
    tx: Prisma.TransactionClient,
    organizationId: string,
    employeeId: string,
  ) {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundError('Employee');
    return employee;
  }
}

function dateBefore(value: Date) {
  const previous = new Date(value);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous;
}
