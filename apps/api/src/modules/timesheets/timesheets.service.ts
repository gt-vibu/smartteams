import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { TimesheetEntriesService } from './timesheet-entries.service';
import { TimesheetLifecycleService } from './timesheet-lifecycle.service';
import { TimesheetPeriodsService } from './timesheet-periods.service';

/**
 * The timesheets module's entry point.
 *
 * Building a period from attendance is bulk work; everything after it happens one timesheet at a
 * time, split between recording time and moving a sheet through approval. Those are three
 * services, behind the constructor Nest already resolves.
 */
@Injectable()
export class TimesheetsService {
  private readonly entries: TimesheetEntriesService;
  private readonly periods: TimesheetPeriodsService;
  private readonly lifecycle: TimesheetLifecycleService;

  constructor(database: TenantDatabaseService, audit: AuditService, outbox: OutboxService) {
    this.entries = new TimesheetEntriesService(database, audit);
    this.periods = new TimesheetPeriodsService(database, audit);
    this.lifecycle = new TimesheetLifecycleService(database, audit, outbox);
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

  listJobTypes(...args: Parameters<TimesheetEntriesService['listJobTypes']>) {
    return this.entries.listJobTypes(...args);
  }

  createJobType(...args: Parameters<TimesheetEntriesService['createJobType']>) {
    return this.entries.createJobType(...args);
  }

  quickCreateProject(...args: Parameters<TimesheetEntriesService['quickCreateProject']>) {
    return this.entries.quickCreateProject(...args);
  }

  submit(...args: Parameters<TimesheetLifecycleService['submit']>) {
    return this.lifecycle.submit(...args);
  }

  unsubmit(...args: Parameters<TimesheetLifecycleService['unsubmit']>) {
    return this.lifecycle.unsubmit(...args);
  }

  decide(...args: Parameters<TimesheetLifecycleService['decide']>) {
    return this.lifecycle.decide(...args);
  }
}
