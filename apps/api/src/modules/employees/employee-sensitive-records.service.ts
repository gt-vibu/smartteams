import { assertPanFree, saveAadhaar } from './employee-identity-rules';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../generated/prisma/client';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { NotFoundError } from '../../common/errors/domain-error';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { dateOnly } from './employee-mappers';
import {
  decryptEmployeeSecret,
  encryptEmployeeSecret,
  maskEmployeeSecret,
} from './employee-sensitive-data';

/** Personal, bank and reference records shared by native and federation employee APIs. */
@Injectable()
export class EmployeeSensitiveRecordsService {
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
    /**
     * The website's own edits also validate the Aadhaar number and refuse one already recorded for
     * another employee. Federation calls without this and keeps the behaviour it has always had.
     */
    options: { enforceIdentityRules?: boolean } = {},
  ) {
    requirePermission(context, 'employees.personal_details.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      if (options.enforceIdentityRules && input.panNumber?.trim())
        await assertPanFree(tx, this.config, context.organizationId, employeeId, input.panNumber);
      if (options.enforceIdentityRules && input.aadhaarNumber?.trim()) {
        await saveAadhaar(tx, this.config, context.organizationId, employeeId, input.aadhaarNumber);
        input = { ...input, aadhaarNumber: undefined };
      }
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

  async replacePrimaryBankAccount(
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
      const existing = await tx.employeeBankAccount.findFirst({
        where: { organizationId: context.organizationId, employeeId, isPrimary: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      const data = {
        bankName: input.bankName?.trim() || null,
        accountNumberEncrypted: input.accountNumber?.trim()
          ? encryptEmployeeSecret(this.config, input.accountNumber.trim())
          : null,
        ifscCode: input.ifscCode?.trim().toUpperCase() || null,
        accountHolderName: input.accountHolderName?.trim() || null,
        effectiveFrom: dateOnly(input.effectiveFrom ?? new Date().toISOString().slice(0, 10)),
        isPrimary: true,
      };
      const account = existing
        ? await tx.employeeBankAccount.update({ where: { id: existing.id }, data })
        : await tx.employeeBankAccount.create({
            data: { organizationId: context.organizationId, employeeId, ...data },
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
          action: 'EMPLOYEE_BANK_ACCOUNT_REPLACED',
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

  async replaceReferences(
    context: DomainContext,
    employeeId: string,
    references: Array<{
      name: string;
      relationship?: string | null;
      phone: string;
      referenceType?: string;
      sortOrder?: number;
    }>,
  ) {
    requirePermission(context, 'employees.personal_details.write');
    return this.database.run(context, async (tx) => {
      await this.assertEmployee(tx, context.organizationId, employeeId);
      const existing = await tx.employeeReference.findMany({
        where: { organizationId: context.organizationId, employeeId },
        orderBy: { sortOrder: 'asc' },
      });
      const retainedIds: string[] = [];
      const saved: typeof existing = [];
      for (const [index, input] of references.entries()) {
        const current = existing[index];
        const data = {
          name: input.name.trim(),
          relationship: input.relationship?.trim() || null,
          phone: input.phone.trim(),
          referenceType: input.referenceType?.trim() || (index === 0 ? 'FAMILY' : 'OTHER'),
          sortOrder: input.sortOrder ?? index,
        };
        const reference = current
          ? await tx.employeeReference.update({ where: { id: current.id }, data })
          : await tx.employeeReference.create({
              data: { organizationId: context.organizationId, employeeId, ...data },
            });
        retainedIds.push(reference.id);
        saved.push(reference);
      }
      if (retainedIds.length) {
        await tx.employeeReference.deleteMany({
          where: {
            organizationId: context.organizationId,
            employeeId,
            id: { notIn: retainedIds },
          },
        });
      } else {
        await tx.employeeReference.deleteMany({
          where: { organizationId: context.organizationId, employeeId },
        });
      }
      await this.audit.record(
        context,
        {
          entityType: 'EMPLOYEE_REFERENCES',
          entityId: employeeId,
          action: 'EMPLOYEE_REFERENCES_REPLACED',
          afterState: { employeeId, count: saved.length },
        },
        tx,
      );
      return saved;
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
