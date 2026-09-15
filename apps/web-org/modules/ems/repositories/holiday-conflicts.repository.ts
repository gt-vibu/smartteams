import {
  parseHolidayConflicts,
  parseHolidayReviewDecision,
  parseHolidayReviewInbox,
  type HolidayConflict,
  type HolidayReviewDecision,
  type HolidayReviewInboxItem,
  type HolidayReviewOutcome,
} from '@smarteam/contracts';
import { apiRequest } from '../lib/api-client';
import { expectShape, orgPath, queryString } from './api-helpers';

/**
 * Check-ins on a granted optional holiday: the employee's explanation and a manager's decision.
 *
 * The API derives each day's state; nothing here computes or stores one.
 */
export const holidayConflictsRepository = {
  async list(
    organizationId: string,
    filters: { from: string; to: string; employeeId?: string },
  ): Promise<HolidayConflict[]> {
    return expectShape(
      parseHolidayConflicts(
        await apiRequest(
          `${orgPath(organizationId, '/attendance')}/holiday-conflicts${queryString(filters)}`,
          { method: 'GET' },
        ),
      ),
      'holiday check-in list',
    );
  },

  async explain(
    organizationId: string,
    attendanceId: string,
    input: { reason: string; comment?: string },
  ): Promise<unknown> {
    return apiRequest(
      `${orgPath(organizationId, '/attendance')}/${encodeURIComponent(attendanceId)}/holiday-conflict`,
      { method: 'POST', body: input },
    );
  },

  async inbox(organizationId: string): Promise<HolidayReviewInboxItem[]> {
    return expectShape(
      parseHolidayReviewInbox(
        await apiRequest(`${orgPath(organizationId, '/attendance')}/holiday-conflicts/inbox`, {
          method: 'GET',
        }),
      ),
      'holiday check-in inbox',
    );
  },

  async decide(
    organizationId: string,
    reviewId: string,
    outcome: HolidayReviewOutcome,
    comment: string,
  ): Promise<HolidayReviewDecision> {
    return expectShape(
      parseHolidayReviewDecision(
        await apiRequest(
          `${orgPath(organizationId, '/attendance')}/holiday-conflicts/${encodeURIComponent(reviewId)}/decision`,
          { method: 'POST', body: { outcome, comment } },
        ),
      ),
      'holiday check-in decision',
    );
  },
};
