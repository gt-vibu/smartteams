import { Injectable } from '@nestjs/common';
import type { AttendancePunchType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../federation/outbox.service';
import { AttendanceLocationService } from './attendance-location.service';
import { AttendanceCorrectionListsService } from './attendance-correction-lists.service';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { AttendanceHolidayReviewService } from './attendance-holiday-review.service';
import { AttendancePreferencesService } from './attendance-preferences.service';
import { AttendancePunchService, type PunchInput } from './attendance-punch.service';

export type { PunchInput };

/**
 * Re-exported because the module's unit tests and other modules import these pure helpers from
 * here, and moving them to `attendance-shared` should not force every caller to change.
 */
export { attendanceTotals, correctionPunchUpdates, hasOpenPunch } from './attendance-shared';

/**
 * The attendance module's entry point.
 *
 * Was 1006 lines covering punching, corrections and per-branch capture settings. Those are now
 * four services sharing free functions rather than each other, so `punch` — the one endpoint an
 * entire workforce hits twice a day — can be read without the correction workflow in the way.
 *
 * The constructor still takes `(database, audit, outbox)`, so Nest, the federation controller and
 * the self-scoping suite that constructs this directly all keep working unchanged.
 */
@Injectable()
export class AttendanceService {
  private readonly corrections: AttendanceCorrectionsService;
  private readonly correctionLists: AttendanceCorrectionListsService;
  private readonly preferences: AttendancePreferencesService;
  private readonly punches: AttendancePunchService;
  private readonly holidayReviews: AttendanceHolidayReviewService;

  constructor(
    database: TenantDatabaseService,
    audit: AuditService,
    outbox: OutboxService,
    locations: AttendanceLocationService,
  ) {
    this.corrections = new AttendanceCorrectionsService(database, audit);
    this.correctionLists = new AttendanceCorrectionListsService(database);
    this.preferences = new AttendancePreferencesService(database, audit, locations);
    this.punches = new AttendancePunchService(database, audit, outbox, locations);
    this.holidayReviews = new AttendanceHolidayReviewService(database, audit, outbox);
  }

  // --- punching and reading records ----------------------------------------------------------

  punch(context: DomainContext, type: AttendancePunchType, input: PunchInput) {
    return this.punches.punch(context, type, input);
  }

  /**
   * The native app's punch: the same punch, plus the optional-holiday conflict it created, if any,
   * so the app can ask for the reason straight away. Federation calls `punch` and is unchanged.
   */
  async punchNative(context: DomainContext, type: AttendancePunchType, input: PunchInput) {
    const result = await this.punches.punch(context, type, input);
    const holidayConflict = await this.holidayReviews.conflictForRecord(context, result.record.id);
    return { ...result, holidayConflict };
  }

  list(...args: Parameters<AttendancePunchService['list']>) {
    return this.punches.list(...args);
  }

  // --- corrections -----------------------------------------------------------------------------

  requestCorrection(...args: Parameters<AttendanceCorrectionsService['requestCorrection']>) {
    return this.corrections.requestCorrection(...args);
  }

  requestMissingCheckOut(
    ...args: Parameters<AttendanceCorrectionsService['requestMissingCheckOut']>
  ) {
    return this.corrections.requestMissingCheckOut(...args);
  }

  decideCorrection(...args: Parameters<AttendanceCorrectionsService['decideCorrection']>) {
    return this.corrections.decideCorrection(...args);
  }

  listPendingCorrectionApprovals(context: DomainContext, approverUserId: string) {
    return this.correctionLists.listPendingCorrectionApprovals(context, approverUserId);
  }

  listCorrectionRequests(
    ...args: Parameters<AttendanceCorrectionListsService['listCorrectionRequests']>
  ) {
    return this.correctionLists.listCorrectionRequests(...args);
  }

  // --- a check-in on a granted optional holiday -------------------------------------------------

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

  // --- per-branch capture settings ---------------------------------------------------------------

  updatePreferences(...args: Parameters<AttendancePreferencesService['updatePreferences']>) {
    return this.preferences.updatePreferences(...args);
  }

  getPreferences(context: DomainContext, branchId?: string) {
    return this.preferences.getPreferences(context, branchId);
  }
}
