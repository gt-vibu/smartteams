import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { ConflictError, NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService, jsonSnapshot } from '../audit/audit.service';
import { dateOnly, toEmployeeDto } from './employee-mappers';
import {
  decryptEmployeeSecret,
  encryptEmployeeSecret,
  maskEmployeeSecret,
} from './employee-sensitive-data';

@Injectable()
export class EmployeeRecordsService {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async getPersonalProfile(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.personal_details.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const profile = await tx.employeePersonalProfile.findUnique({ where: { employeeId } });
      if (!profile) return null;
      const canReveal = context.permissions.has('employees.personal_details.write');
      return {
        ...profile,
        aadhaarNumber: canReveal
          ? decryptEmployeeSecret(this.config, profile.aadhaarNumberEncrypted)
          : maskEmployeeSecret(decryptEmployeeSecret(this.config, profile.aadhaarNumberEncrypted)),
        panNumber: canReveal
          ? decryptEmployeeSecret(this.config, profile.panNumberEncrypted)
          : maskEmployeeSecret(decryptEmployeeSecret(this.config, profile.panNumberEncrypted)),
        aadhaarNumberEncrypted: undefined,
        panNumberEncrypted: undefined,
      };
    });
  }

  async upsertPersonalProfile(
    context: DomainContext,
    employeeId: string,
    input: {
      fatherName?: string | null;
      motherName?: string | null;
      spouseName?: string | null;
      aadhaarNumber?: string | null;
      panNumber?: string | null;
      presentAddress?: string | null;
      permanentAddress?: string | null;
    },
  ) {
    requirePermission(context, 'employees.personal_details.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const profile = await tx.employeePersonalProfile.upsert({
        where: { employeeId },
        create: {
          organizationId: context.organizationId,
          employeeId,
          fatherName: input.fatherName?.trim() || null,
          motherName: input.motherName?.trim() || null,
          spouseName: input.spouseName?.trim() || null,
          presentAddress: input.presentAddress?.trim() || null,
          permanentAddress: input.permanentAddress?.trim() || null,
          aadhaarNumberEncrypted: input.aadhaarNumber?.trim()
            ? encryptEmployeeSecret(this.config, input.aadhaarNumber.trim())
            : null,
          panNumberEncrypted: input.panNumber?.trim()
            ? encryptEmployeeSecret(this.config, input.panNumber.trim().toUpperCase())
            : null,
        },
        update: {
          fatherName: input.fatherName?.trim() || null,
          motherName: input.motherName?.trim() || null,
          spouseName: input.spouseName?.trim() || null,
          presentAddress: input.presentAddress?.trim() || null,
          permanentAddress: input.permanentAddress?.trim() || null,
          ...(input.aadhaarNumber !== undefined
            ? {
                aadhaarNumberEncrypted: input.aadhaarNumber?.trim()
                  ? encryptEmployeeSecret(this.config, input.aadhaarNumber.trim())
                  : null,
              }
            : {}),
          ...(input.panNumber !== undefined
            ? {
                panNumberEncrypted: input.panNumber?.trim()
                  ? encryptEmployeeSecret(this.config, input.panNumber.trim().toUpperCase())
                  : null,
              }
            : {}),
        },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_PERSONAL_PROFILE',
          entityId: profile.id,
          action: 'EMPLOYEE_PERSONAL_PROFILE_UPDATED',
          afterState: { id: profile.id, employeeId },
        },
        tx,
      );
      return {
        ...profile,
        aadhaarNumber: '[stored]',
        panNumber: '[stored]',
        aadhaarNumberEncrypted: undefined,
        panNumberEncrypted: undefined,
      };
    });
  }

  async listBankAccounts(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.bank_details.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const accounts = await tx.employeeBankAccount.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: { effectiveFrom: 'desc' },
      });
      const canReveal = context.permissions.has('employees.bank_details.write');
      return accounts.map((account) => ({
        ...account,
        accountNumber: canReveal
          ? decryptEmployeeSecret(this.config, account.accountNumberEncrypted)
          : maskEmployeeSecret(decryptEmployeeSecret(this.config, account.accountNumberEncrypted)),
        accountNumberEncrypted: undefined,
      }));
    });
  }

  async addBankAccount(
    context: DomainContext,
    employeeId: string,
    input: {
      bankName?: string | null;
      accountNumber?: string | null;
      ifscCode?: string | null;
      accountHolderName?: string | null;
      effectiveFrom?: string;
    },
  ) {
    requirePermission(context, 'employees.bank_details.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const account = await tx.employeeBankAccount.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          bankName: input.bankName?.trim() || null,
          accountNumberEncrypted: input.accountNumber?.trim()
            ? encryptEmployeeSecret(this.config, input.accountNumber.trim())
            : null,
          ifscCode: input.ifscCode?.trim().toUpperCase() || null,
          accountHolderName: input.accountHolderName?.trim() || null,
          effectiveFrom: dateOnly(input.effectiveFrom ?? new Date().toISOString().slice(0, 10)),
        },
      });
      await tx.employeeBankAccount.updateMany({
        where: {
          organizationId: context.organizationId,
          employeeId,
          id: { not: account.id },
          isPrimary: true,
        },
        data: { isPrimary: false },
      });
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_BANK_ACCOUNT',
          entityId: account.id,
          action: 'EMPLOYEE_BANK_ACCOUNT_CREATED',
          afterState: { id: account.id, employeeId },
        },
        tx,
      );
      return { ...account, accountNumber: '[stored]', accountNumberEncrypted: undefined };
    });
  }

  async listReferences(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.personal_details.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      return tx.employeeReference.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }

  async addReference(
    context: DomainContext,
    employeeId: string,
    input: {
      name: string;
      relationship?: string | null;
      phone: string;
      referenceType?: string;
      sortOrder?: number;
    },
  ) {
    requirePermission(context, 'employees.personal_details.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      return tx.employeeReference.create({
        data: {
          organizationId: context.organizationId,
          employeeId,
          name: input.name.trim(),
          relationship: input.relationship?.trim() || null,
          phone: input.phone.trim(),
          referenceType: input.referenceType?.trim() || 'FAMILY',
          sortOrder: input.sortOrder ?? 0,
        },
      });
    });
  }

  async listEmergencyContacts(context: DomainContext, employeeId: string) {
    requirePermission(context, 'employees.read');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      return tx.employeeEmergencyContact.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
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
