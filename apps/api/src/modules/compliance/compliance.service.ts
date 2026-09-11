import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { ComplianceProfilesService } from './compliance-profiles.service';
import { ComplianceRecordsService } from './compliance-records.service';

export { STATUTORY_SCHEME_CATALOG, assertComplianceTransition } from './compliance-shared';

/**
 * The compliance module's entry point.
 *
 * Enrolment (which schemes apply to whom) and contribution records (what was owed and whether it
 * was filed) are separate concerns that shared a file. This forwards to both.
 */
@Injectable()
export class ComplianceService {
  private readonly profiles_: ComplianceProfilesService;
  private readonly records_: ComplianceRecordsService;

  constructor(database: TenantDatabaseService, audit: AuditService, outbox: OutboxService) {
    this.profiles_ = new ComplianceProfilesService(database, audit);
    this.records_ = new ComplianceRecordsService(database, audit, outbox);
  }

  schemes(context: DomainContext) {
    return this.profiles_.schemes(context);
  }

  profiles(context: DomainContext, employeeId: string) {
    return this.profiles_.profiles(context, employeeId);
  }

  upsertProfile(...args: Parameters<ComplianceProfilesService['upsertProfile']>) {
    return this.profiles_.upsertProfile(...args);
  }

  records(...args: Parameters<ComplianceRecordsService['records']>) {
    return this.records_.records(...args);
  }

  upsertRecord(...args: Parameters<ComplianceRecordsService['upsertRecord']>) {
    return this.records_.upsertRecord(...args);
  }
}
