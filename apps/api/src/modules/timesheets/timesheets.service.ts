import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { TimesheetEntriesService } from './timesheet-entries.service';
import { TimesheetPeriodsService } from './timesheet-periods.service';

/**
 * The timesheets module's entry point.
 *
 * Building a period from attendance is bulk work; everything after it happens one timesheet at a
 * time. Those are two services now, behind the constructor Nest already resolves.
 */
@Injectable()
export class TimesheetsService {
  private readonly entries: TimesheetEntriesService;
  private readonly periods: TimesheetPeriodsService;

  constructor(database: TenantDatabaseService, audit: AuditService, outbox: OutboxService) {
    this.entries = new TimesheetEntriesService(database, audit, outbox);
    this.periods = new TimesheetPeriodsService(database, audit);
  }

  list(...args: Parameters<TimesheetPeriodsService['list']>) {
    return this.periods.list(...args);
  }

  createPeriod(...args: Parameters<TimesheetPeriodsService['createPeriod']>) {
    return this.periods.createPeriod(...args);
  }

  derive(context: DomainContext, periodId: string) {
    return this.periods.derive(context, periodId);
  }

  addManualEntry(...args: Parameters<TimesheetEntriesService['addManualEntry']>) {
    return this.entries.addManualEntry(...args);
  }

  submit(...args: Parameters<TimesheetEntriesService['submit']>) {
    return this.entries.submit(...args);
  }

  decide(...args: Parameters<TimesheetEntriesService['decide']>) {
    return this.entries.decide(...args);
  }
}
