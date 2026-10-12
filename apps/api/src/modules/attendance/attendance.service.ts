import { Injectable } from '@nestjs/common';
import type { DomainContext } from '../../common/context/domain-context';
import type { AttendancePunchType } from '../../generated/prisma/enums';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { InboxPagination } from '../approvals/approval-inbox-page';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { AttendanceAutoCheckOutService } from './attendance-auto-checkout.service';
import { AttendanceCorrectionListsService } from './attendance-correction-lists.service';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { AttendanceHolidayReviewService } from './attendance-holiday-review.service';
import { AttendanceLocationService } from './attendance-location.service';
import { AttendancePreferencesService } from './attendance-preferences.service';
import { AttendancePunchService, type PunchInput } from './attendance-punch.service';

export type { PunchInput };

export { attendanceTotals, correctionPunchUpdates, hasOpenPunch } from './attendance-shared';

/** Native and federation callers share this facade while implementation is split by domain. */
@Injectable()
export class AttendanceService {
  private readonly corrections: AttendanceCorrectionsService;
  private readonly correctionLists: AttendanceCorrectionListsService;
  private readonly preferences: AttendancePreferencesService;
  private readonly punches: AttendancePunchService;
  private readonly holidayReviews: AttendanceHolidayReviewService;
  private readonly autoCheckOut: AttendanceAutoCheckOutService;

  constructor(
    database: TenantDatabaseService,
    audit: AuditService,
    outbox: OutboxService,
    locations: AttendanceLocationService,
  ) {
    this.autoCheckOut = new AttendanceAutoCheckOutService(database, audit);
    this.corrections = new AttendanceCorrectionsService(database, audit);
    this.correctionLists = new AttendanceCorrectionListsService(database);
    this.preferences = new AttendancePreferencesService(database, audit, locations);
    this.punches = new AttendancePunchService(database, audit, outbox, locations);
    this.holidayReviews = new AttendanceHolidayReviewService(database, audit, outbox);
  }

  runAutoCheckOut(context: DomainContext) {
    return this.autoCheckOut.runNow(context);
  }

  punch(context: DomainContext, type: AttendancePunchType, input: PunchInput) {
    return this.punches.punch(context, type, input);
  }

  async punchNative(context: DomainContext, type: AttendancePunchType, input: PunchInput) {
    const result = await this.punches.punch(context, type, input);
    const holidayConflict = await this.holidayReviews.conflictForRecord(context, result.record.id);
    return { ...result, holidayConflict };
  }

  list(...args: Parameters<AttendancePunchService['list']>) {
    return this.punches.list(...args);
  }

  requestCorrection(...args: Parameters<AttendanceCorrectionsService['requestCorrection']>) {
    return this.corrections.requestCorrection(...args);
  }

  requestCorrectionForDate(
    ...args: Parameters<AttendanceCorrectionsService['requestCorrectionForDate']>
  ) {
    return this.corrections.requestCorrectionForDate(...args);
  }

  requestMissingCheckOut(
    ...args: Parameters<AttendanceCorrectionsService['requestMissingCheckOut']>
  ) {
    return this.corrections.requestMissingCheckOut(...args);
  }

  decideCorrection(...args: Parameters<AttendanceCorrectionsService['decideCorrection']>) {
    return this.corrections.decideCorrection(...args);
  }

  listPendingCorrectionApprovals(
    context: DomainContext,
    approverUserId: string,
    pagination?: InboxPagination,
  ) {
    return this.correctionLists.listPendingCorrectionApprovals(context, approverUserId, pagination);
  }

  listCorrectionRequests(
    ...args: Parameters<AttendanceCorrectionListsService['listCorrectionRequests']>
  ) {
    return this.correctionLists.listCorrectionRequests(...args);
  }

  listHolidayConflicts(...args: Parameters<AttendanceHolidayReviewService['listConflicts']>) {
    return this.holidayReviews.listConflicts(...args);
  }

  requestHolidayReview(...args: Parameters<AttendanceHolidayReviewService['requestReview']>) {
    return this.holidayReviews.requestReview(...args);
  }

  listHolidayReviewInbox(context: DomainContext) {
    return this.holidayReviews.listInbox(context);
  }

  decideHolidayReview(...args: Parameters<AttendanceHolidayReviewService['decide']>) {
    return this.holidayReviews.decide(...args);
  }

  updatePreferences(...args: Parameters<AttendancePreferencesService['updatePreferences']>) {
    return this.preferences.updatePreferences(...args);
  }

  getPreferences(context: DomainContext, branchId?: string) {
    return this.preferences.getPreferences(context, branchId);
  }
}
