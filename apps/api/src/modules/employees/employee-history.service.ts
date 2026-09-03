import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly } from './employee-mappers';
import { assertMayReadEmployee } from './employee-access';

import { assertEmployee, dateBefore } from './employee-records-shared';

/**
 * Employment history and compensation.
 *
 * Both are effective-dated series rather than single values, which is why they are the two
 * largest things in this module: writing one means closing the previous row rather than editing
 * it, so that a payroll run calculated last month still sees what it saw.
 */
@Injectable()
export class EmployeeHistoryService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
  ) {}

  async listEmploymentRecords(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      await assertEmployee(tx, context.organizationId, employeeId);
      await assertMayReadEmployee(tx, context, employeeId);
      return tx.employeeEmploymentRecord.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: [{ effectiveFrom: 'desc' }],
      });
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
      await assertEmployee(tx, context.organizationId, employeeId);
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
      await assertEmployee(tx, context.organizationId, employeeId);
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
}
