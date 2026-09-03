import { Injectable } from '@nestjs/common';
import type { PayrollRunStatus } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { PayrollCalendarService } from './payroll-calendar.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollComponentsService, type ComponentInput } from './payroll-components.service';
import { PayrollPayslipsService } from './payroll-payslips.service';
import { PayrollRunsService } from './payroll-runs.service';

export type { ComponentInput };

/**
 * The payroll module's entry point.
 *
 * This was a single 1539-line class holding the component catalogue, the calendar, the payslip
 * and ledger reads, the calculation engine and the run state machine all at once — six concerns
 * that shared a tenant and very little else. It is now a facade over five services, each of which
 * can be read end to end.
 *
 * The constructor still takes exactly `(database, audit, outbox)`. That is deliberate: Nest
 * resolves this class by those three dependencies and three test suites construct it directly, so
 * widening the signature would have made a mechanical split into a breaking change. The
 * collaborators are composed here from the same three, which keeps the split invisible from the
 * outside — every method below forwards, with identical arguments and identical behaviour.
 *
 * Callers that want one concern can inject that service instead; this exists so the controllers
 * and the federation module did not all have to change at once.
 */
@Injectable()
export class PayrollService {
  private readonly calendar: PayrollCalendarService;
  private readonly calculation: PayrollCalculationService;
  private readonly components: PayrollComponentsService;
  private readonly payslips: PayrollPayslipsService;
  private readonly runs: PayrollRunsService;

  constructor(database: TenantDatabaseService, audit: AuditService, outbox: OutboxService) {
    this.calendar = new PayrollCalendarService(database, audit);
    this.calculation = new PayrollCalculationService(database, audit, outbox);
    this.components = new PayrollComponentsService(database, audit);
    this.payslips = new PayrollPayslipsService(database);
    this.runs = new PayrollRunsService(database, audit);
  }

  // --- pay component catalogue -----------------------------------------------------------

  createComponent(context: DomainContext, input: ComponentInput) {
    return this.components.createComponent(context, input);
  }

  listComponents(context: DomainContext) {
    return this.components.listComponents(context);
  }

  updateComponent(context: DomainContext, id: string, input: ComponentInput) {
    return this.components.updateComponent(context, id, input);
  }

  listEmployeeComponents(context: DomainContext, employeeId: string) {
    return this.components.listEmployeeComponents(context, employeeId);
  }

  assignComponent(
    ...args: Parameters<PayrollComponentsService['assignComponent']>
  ): ReturnType<PayrollComponentsService['assignComponent']> {
    return this.components.assignComponent(...args);
  }

  // --- calendar --------------------------------------------------------------------------

  getCalendar(...args: Parameters<PayrollCalendarService['getCalendar']>) {
    return this.calendar.getCalendar(...args);
  }

  updateCalendar(...args: Parameters<PayrollCalendarService['updateCalendar']>) {
    return this.calendar.updateCalendar(...args);
  }

  // --- payslips and ledger ---------------------------------------------------------------

  listPayslips(context: DomainContext, requestedEmployeeId?: string) {
    return this.payslips.listPayslips(context, requestedEmployeeId);
  }

  ledger(...args: Parameters<PayrollPayslipsService['ledger']>) {
    return this.payslips.ledger(...args);
  }

  // --- runs ------------------------------------------------------------------------------

  listRuns(context: DomainContext) {
    return this.runs.listRuns(context);
  }

  createRun(...args: Parameters<PayrollRunsService['createRun']>) {
    return this.runs.createRun(...args);
  }

  addAdjustment(...args: Parameters<PayrollRunsService['addAdjustment']>) {
    return this.runs.addAdjustment(...args);
  }

  correct(context: DomainContext, runId: string, reason: string) {
    return this.runs.correct(context, runId, reason);
  }

  advance(context: DomainContext, runId: string, target: PayrollRunStatus, comment: string) {
    return this.runs.advance(context, runId, target, comment);
  }

  // --- calculation -----------------------------------------------------------------------

  calculate(context: DomainContext, runId: string) {
    return this.calculation.calculate(context, runId);
  }
}
