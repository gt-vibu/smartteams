import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { EmployeeContactsService } from './employee-contacts.service';
import { EmployeeHistoryService } from './employee-history.service';

/**
 * Employee records: history, compensation, contacts and links.
 *
 * Effective-dated series and flat records are different enough to be worth separating; this keeps
 * the single injection point the rest of the codebase already uses.
 */
@Injectable()
export class EmployeeRecordsService {
  private readonly contacts: EmployeeContactsService;
  private readonly history: EmployeeHistoryService;

  constructor(database: TenantDatabaseService, audit: AuditService) {
    this.contacts = new EmployeeContactsService(database, audit);
    this.history = new EmployeeHistoryService(database, audit);
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
