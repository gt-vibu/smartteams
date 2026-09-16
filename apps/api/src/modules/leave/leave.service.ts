import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { LeaveBalancesService } from './leave-balances.service';
import { LeaveDecisionsService } from './leave-decisions.service';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';

/**
 * The leave module's entry point.
 *
 * Was a single 1215-line class covering the type catalogue, branch assignment, balances, request
 * creation, approval and cancellation. Those are now four services, none of which calls another:
 * everything they share is a free function in `leave-shared` or `leave-balance-ops`, so the split
 * is along real seams rather than a directory reshuffle.
 *
 * The constructor still takes exactly `(database, audit, outbox)` so Nest and the two suites that
 * construct this class directly keep working. Every method forwards unchanged.
 */
@Injectable()
export class LeaveService {
  private readonly balances: LeaveBalancesService;
  private readonly decisions: LeaveDecisionsService;
  private readonly requests: LeaveRequestsService;
  private readonly types: LeaveTypesService;

  constructor(database: TenantDatabaseService, audit: AuditService, outbox: OutboxService) {
    this.balances = new LeaveBalancesService(database, audit);
    this.decisions = new LeaveDecisionsService(database, audit);
    this.requests = new LeaveRequestsService(database, audit, outbox);
    this.types = new LeaveTypesService(database, audit);
  }

  // --- leave types and branch assignment --------------------------------------------------

  createType(...args: Parameters<LeaveTypesService['createType']>) {
    return this.types.createType(...args);
  }

  listTypes(context: DomainContext) {
    return this.types.listTypes(context);
  }

  syncType(...args: Parameters<LeaveTypesService['syncType']>) {
    return this.types.syncType(...args);
  }

  assignTypeToBranch(context: DomainContext, code: string) {
    return this.types.assignTypeToBranch(context, code);
  }

  listAssignments(context: DomainContext) {
    return this.types.listAssignments(context);
  }

  // --- balances ----------------------------------------------------------------------------

  listBalances(context: DomainContext, requestedEmployeeId?: string) {
    return this.balances.listBalances(context, requestedEmployeeId);
  }

  adjustBalance(...args: Parameters<LeaveBalancesService['adjustBalance']>) {
    return this.balances.adjustBalance(...args);
  }

  // --- requests ----------------------------------------------------------------------------

  listRequests(...args: Parameters<LeaveRequestsService['listRequests']>) {
    return this.requests.listRequests(...args);
  }

  listPendingApprovals(context: DomainContext, approverUserId: string) {
    return this.requests.listPendingApprovals(context, approverUserId);
  }

  createRequest(...args: Parameters<LeaveRequestsService['createRequest']>) {
    return this.requests.createRequest(...args);
  }

  // --- decisions ---------------------------------------------------------------------------

  decide(...args: Parameters<LeaveDecisionsService['decide']>) {
    return this.decisions.decide(...args);
  }

  cancel(context: DomainContext, requestId: string, reason: string) {
    return this.decisions.cancel(context, requestId, reason);
  }
}
