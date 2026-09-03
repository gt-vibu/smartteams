import { Injectable } from '@nestjs/common';
import { EmployeeStatus, EmploymentType } from '../../generated/prisma/enums';
import { type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { AuthSessionService } from '../auth/auth.session.service';
import { EmployeeRecordsService } from './employee-records.service';
import { EmployeeFederationAccessService } from './employee-federation-access.service';
import { EmployeeFederationSyncService } from './employee-federation-sync.service';
import { EmployeeNativeService } from './employee-native.service';

/**
 * The employees module's entry point.
 *
 * Was 877 lines holding the native write paths, the federated sync, access revocation and a set
 * of thin forwards to `EmployeeRecordsService`. Those are now three services, sharing free
 * functions in `employee-shared` rather than each other.
 *
 * The constructor still takes the same five dependencies, so Nest and every direct construction
 * keep working, and each method below forwards with identical arguments.
 */
@Injectable()
export class EmployeesService {
  private readonly federationAccess: EmployeeFederationAccessService;
  private readonly federationSync: EmployeeFederationSyncService;
  private readonly native: EmployeeNativeService;

  constructor(
    database: TenantDatabaseService,
    audit: AuditService,
    outbox: OutboxService,
    sessions: AuthSessionService,
    private readonly records: EmployeeRecordsService,
  ) {
    this.federationAccess = new EmployeeFederationAccessService(database, audit, sessions);
    this.federationSync = new EmployeeFederationSyncService(database, audit, outbox, sessions);
    this.native = new EmployeeNativeService(database, audit, outbox, sessions);
  }

  // --- employees this tenant owns --------------------------------------------------------------

  createNative(...args: Parameters<EmployeeNativeService['createNative']>) {
    return this.native.createNative(...args);
  }

  get(context: DomainContext, employeeId: string) {
    return this.native.get(context, employeeId);
  }

  list(...args: Parameters<EmployeeNativeService['list']>) {
    return this.native.list(...args);
  }

  updateNative(...args: Parameters<EmployeeNativeService['updateNative']>) {
    return this.native.updateNative(...args);
  }

  assignBranch(...args: Parameters<EmployeeNativeService['assignBranch']>) {
    return this.native.assignBranch(...args);
  }

  deactivate(...args: Parameters<EmployeeNativeService['deactivate']>) {
    return this.native.deactivate(...args);
  }

  // --- employees a partner masters -------------------------------------------------------------

  syncFederated(...args: Parameters<EmployeeFederationSyncService['syncFederated']>) {
    return this.federationSync.syncFederated(...args);
  }

  assignFederatedBranch(
    ...args: Parameters<EmployeeFederationSyncService['assignFederatedBranch']>
  ) {
    return this.federationSync.assignFederatedBranch(...args);
  }

  syncAccess(...args: Parameters<EmployeeFederationAccessService['syncAccess']>) {
    return this.federationAccess.syncAccess(...args);
  }

  revokeFederatedSessions(
    ...args: Parameters<EmployeeFederationAccessService['revokeFederatedSessions']>
  ) {
    return this.federationAccess.revokeFederatedSessions(...args);
  }

  // --- employment records, contacts and compensation ---------------------------------------------

  async listEmploymentRecords(context: DomainContext, employeeId: string) {
    return this.records.listEmploymentRecords(context, employeeId);
  }

  async listEmergencyContacts(context: DomainContext, employeeId: string) {
    return this.records.listEmergencyContacts(context, employeeId);
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
    return this.records.addEmergencyContact(context, employeeId, input);
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
    return this.records.addEmploymentRecord(context, employeeId, input);
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
    return this.records.addCompensation(context, employeeId, input);
  }

  async linkUser(context: DomainContext, employeeId: string, userId: string) {
    return this.records.linkUser(context, employeeId, userId);
  }

  async assignManager(context: DomainContext, employeeId: string, managerEmployeeId: string) {
    return this.records.assignManager(context, employeeId, managerEmployeeId);
  }
}
