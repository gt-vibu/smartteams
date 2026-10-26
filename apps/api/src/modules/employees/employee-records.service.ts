import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { EmployeeContactsService } from './employee-contacts.service';
import { EmployeeHistoryService } from './employee-history.service';
import { EmployeeSensitiveRecordsService } from './employee-sensitive-records.service';
import type { Prisma } from '../../generated/prisma/client';
import type { EmployeeOnboardingDetails } from '@smarteam/contracts';

/** Employee history, compensation, contacts, links and sensitive workforce records. */
@Injectable()
export class EmployeeRecordsService {
  private readonly contacts: EmployeeContactsService;
  private readonly history: EmployeeHistoryService;
  private readonly sensitive: EmployeeSensitiveRecordsService;

  constructor(database: TenantDatabaseService, audit: AuditService, config?: ConfigService) {
    this.contacts = new EmployeeContactsService(database, audit);
    this.history = new EmployeeHistoryService(database, audit);
    this.sensitive = new EmployeeSensitiveRecordsService(
      database,
      audit,
      config ?? new ConfigService(),
    );
  }

  getPersonalProfile(...args: Parameters<EmployeeSensitiveRecordsService['getPersonalProfile']>) {
    return this.sensitive.getPersonalProfile(...args);
  }

  async saveOnboarding(
    context: DomainContext,
    employeeId: string,
    details: EmployeeOnboardingDetails,
    tx: Prisma.TransactionClient,
    effectiveFrom?: string,
  ) {
    await this.sensitive.upsertPersonalProfile(context, employeeId, details, {}, tx);
    await this.sensitive.replacePrimaryBankAccount(
      context,
      employeeId,
      {
        bankName: details.bankName,
        accountNumber: details.bankAccountNumber,
        ifscCode: details.ifscCode,
        accountHolderName: details.bankAccountName,
        ...(effectiveFrom ? { effectiveFrom } : {}),
      },
      tx,
    );
    await this.sensitive.replaceReferences(
      context,
      employeeId,
      [
        {
          name: details.familyReferenceName,
          phone: details.familyReferenceContact,
          referenceType: 'FAMILY',
          sortOrder: 0,
        },
        {
          name: details.referenceName2,
          phone: details.referenceContact2,
          referenceType: 'OTHER',
          sortOrder: 1,
        },
      ],
      tx,
    );
  }

  upsertPersonalProfile(
    ...args: Parameters<EmployeeSensitiveRecordsService['upsertPersonalProfile']>
  ) {
    return this.sensitive.upsertPersonalProfile(...args);
  }

  listBankAccounts(...args: Parameters<EmployeeSensitiveRecordsService['listBankAccounts']>) {
    return this.sensitive.listBankAccounts(...args);
  }

  addBankAccount(...args: Parameters<EmployeeSensitiveRecordsService['addBankAccount']>) {
    return this.sensitive.addBankAccount(...args);
  }

  replacePrimaryBankAccount(
    ...args: Parameters<EmployeeSensitiveRecordsService['replacePrimaryBankAccount']>
  ) {
    return this.sensitive.replacePrimaryBankAccount(...args);
  }

  listReferences(...args: Parameters<EmployeeSensitiveRecordsService['listReferences']>) {
    return this.sensitive.listReferences(...args);
  }

  addReference(...args: Parameters<EmployeeSensitiveRecordsService['addReference']>) {
    return this.sensitive.addReference(...args);
  }

  replaceReferences(...args: Parameters<EmployeeSensitiveRecordsService['replaceReferences']>) {
    return this.sensitive.replaceReferences(...args);
  }

  listEmergencyContacts(context: DomainContext, employeeId: string) {
    return this.contacts.listEmergencyContacts(context, employeeId);
  }

  addEmergencyContact(...args: Parameters<EmployeeContactsService['addEmergencyContact']>) {
    return this.contacts.addEmergencyContact(...args);
  }

  linkUser(context: DomainContext, employeeId: string, userId: string) {
    return this.contacts.linkUser(context, employeeId, userId);
  }

  assignManager(context: DomainContext, employeeId: string, managerEmployeeId: string) {
    return this.contacts.assignManager(context, employeeId, managerEmployeeId);
  }

  listEmploymentRecords(context: DomainContext, employeeId: string) {
    return this.history.listEmploymentRecords(context, employeeId);
  }

  addEmploymentRecord(...args: Parameters<EmployeeHistoryService['addEmploymentRecord']>) {
    return this.history.addEmploymentRecord(...args);
  }

  addCompensation(...args: Parameters<EmployeeHistoryService['addCompensation']>) {
    return this.history.addCompensation(...args);
  }
}
