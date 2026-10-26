'use client';

import {
  formatDate,
  formatDateRange,
  formatDateTime,
  hasPermission,
  type HolidayReviewDecision,
  type HolidayReviewInboxItem,
  type HolidayReviewOutcome,
} from '@smarteam/contracts';
import { useCallback, useMemo } from 'react';
import { emitDataChanged, useDataChanged } from '../lib/data-events';
import { attendanceRepository } from '../repositories/attendance.repository';
import { holidayConflictsRepository } from '../repositories/holiday-conflicts.repository';
import { leaveRepository } from '../repositories/leave.repository';
import { useSession } from './auth-context';
import { useAdvanceInbox } from './use-advance-inbox';
import { useApprovalBatch } from './use-approval-batch';
import { useAsyncResource } from './use-async-resource';
import { useLeaveExtrasInbox } from './use-leave-extras-inbox';
import { useMutationRunner } from './use-mutation-runner';

/**
 * Everything awaiting the signed-in user's decision, across the domains that have an inbox.
 *
 * There is no unified approvals API: each module owns its own queue and its own decision route,
 * and the server decides whether the caller may approve. This hook composes the two inboxes that
 * exist — leave requests and attendance corrections — rather than inventing a third surface.
 *
 * Timesheet and payroll approvals have no inbox route, so they are not listed here at all.
 *
 * A check-in on an approved optional holiday is its own item: it is not approved or rejected but
 * decided one of two ways — keep the holiday or make it a working day — so it carries the review
 * the dialog needs.
 */

export type ApprovalDomainKey =
  'LEAVE' | 'ATTENDANCE_CORRECTION' | 'HOLIDAY_CHECK_IN' | 'COMP_OFF' | 'ENCASHMENT' | 'ADVANCE';

export type ApprovalInboxItem = {
  id: string;
  domain: ApprovalDomainKey;
  employeeId: string;
  /** Who is asking, as the request carries it; null when the API sent no name. */
  requester: string | null;
  title: string;
  detail: string;
  submittedAt: string | null;
  holidayReview?: HolidayReviewInboxItem;
  /** The check-out this correction asks the approver to accept, if it asks for one. */
  proposedCheckOut?: string;
  /** Whether the end-of-day close raised it rather than the employee. */
  autoClosed?: boolean;
  /** Requests that create the first punches for an absent day need one-at-a-time review. */
  requiresIndividualReview?: boolean;
  currentStep?: { stepNumber: number; approverType: string };
  warningReason?: string | null;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  attachments?: Array<{ id: string; name: string; contentType: string; byteSize: string }>;
};

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

type RequesterSummary = {
  firstName: string;
  lastName?: string | null;
  employeeNumber?: string | null;
};

function requesterName(employee: RequesterSummary | null | undefined) {
  if (!employee) return null;
  const name = `${employee.firstName} ${employee.lastName ?? ''}`.trim();
  return employee.employeeNumber ? `${name} (${employee.employeeNumber})` : name;
}

export function useApprovalInbox() {
  const { session, persona } = useSession();
  const organizationId = session?.organizationId || null;
  const permissions = useMemo(() => persona?.permissions ?? [], [persona]);
  const batch = useApprovalBatch(organizationId, session?.user.id ?? null);

  const canReadLeave = hasPermission(permissions, 'leave.requests.read');
  const canDecideLeave = hasPermission(permissions, 'leave.requests.decide');
  const canReadAttendance = hasPermission(permissions, 'attendance.read');
  const canDecideAttendance = hasPermission(permissions, 'attendance.corrections.decide');

  const leave = useAsyncResource<unknown[]>(
    () => leaveRepository.requestInbox(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadLeave },
  );

  const attendance = useAsyncResource<unknown[]>(
    () => attendanceRepository.correctionInbox(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canReadAttendance },
  );

  const holidayReviews = useAsyncResource<HolidayReviewInboxItem[]>(
    () => holidayConflictsRepository.inbox(organizationId!),
    [organizationId],
    { enabled: Boolean(organizationId) && canDecideAttendance },
  );

  // Comp-off and encashment wait on people too, so they belong in the same inbox.
  const extras = useLeaveExtrasInbox();
  const advances = useAdvanceInbox();
  const refetchAll = useCallback(async () => {
    await Promise.all([
      leave.refetch(),
      attendance.refetch(),
      holidayReviews.refetch(),
      extras.refetch(),
      advances.refetch(),
    ]);
  }, [attendance, leave, holidayReviews, extras, advances]);
  useDataChanged(['approvals'], refetchAll);

  const { saving, saveError, setSaveError, run } = useMutationRunner(refetchAll);

  const items: ApprovalInboxItem[] = useMemo(() => {
    const leaveItems = (leave.data ?? []).map((entry) => {
      const request = entry as {
        id: string;
        employeeId: string;
        employee?: RequesterSummary | null;
        attachments?: ApprovalInboxItem['attachments'];
        leaveType?: { name: string; paid: boolean } | null;
        requestedDays?: number | string | null;
        startDate?: string;
        endDate?: string;
        reason?: string | null;
        submittedAt?: string | null;
        currentStep?: { stepNumber: number; approverType: string };
        warningReason?: string | null;
      };
      // What an approver decides on: who, which leave, how long, when and why.
      const days = request.requestedDays == null ? null : Number(request.requestedDays);
      const kind = request.leaveType
        ? `${request.leaveType.name}${request.leaveType.paid ? '' : ' (unpaid)'}`
        : 'Leave request';
      return {
        id: request.id,
        domain: 'LEAVE' as const,
        employeeId: request.employeeId,
        requester: requesterName(request.employee),
        title: days === null ? kind : `${kind} · ${days} ${days === 1 ? 'day' : 'days'}`,
        detail: `${
          request.startDate && request.endDate
            ? formatDateRange(request.startDate, request.endDate)
            : '--'
        }${request.reason ? ` · ${request.reason}` : ''}`,
        submittedAt: request.submittedAt ?? null,
        currentStep: request.currentStep,
        warningReason: request.warningReason,
        attachments: request.attachments,
      };
    });
    const attendanceItems = (attendance.data ?? []).map((entry) => {
      const correction = entry as {
        id: string;
        employeeId?: string;
        employee?: RequesterSummary | null;
        reason?: string | null;
        warningReason?: string | null;
        requestedAt?: string;
        createdAt?: string;
        currentStep?: { stepNumber: number; approverType: string };
        beforeSnapshot?: unknown;
        afterSnapshot?: {
          missingCheckOut?: { occurredAt?: string; autoClosed?: boolean };
          correctedCheckIn?: string;
          correctedCheckOut?: string;
          missingAttendanceDay?: boolean;
          isNonWorkingDay?: boolean;
          nonWorkingDayReason?: string;
          nonWorkingDayDetail?: string;
        } | null;
      };
      // The approver has to see the time they are being asked to accept, not only the reason.
      const requestedCheckOut = correction.afterSnapshot?.missingCheckOut?.occurredAt;
      const autoClosed = Boolean(correction.afterSnapshot?.missingCheckOut?.autoClosed);
      const before =
        correction.beforeSnapshot && typeof correction.beforeSnapshot === 'object'
          ? (correction.beforeSnapshot as { punches?: unknown; dayStatus?: unknown })
          : null;
      const legacyMissingAttendanceDay =
        correction.afterSnapshot?.correctedCheckIn != null &&
        Array.isArray(before?.punches) &&
        before.punches.length === 0 &&
        before.dayStatus === 'ABSENT';
      const when = requestedCheckOut ? formatDateTime(requestedCheckOut) : '';
      const warning =
        correction.warningReason ||
        (correction.afterSnapshot?.isNonWorkingDay
          ? correction.afterSnapshot.nonWorkingDayDetail ||
            correction.afterSnapshot.nonWorkingDayReason
          : null);
      return {
        id: correction.id,
        domain: 'ATTENDANCE_CORRECTION' as const,
        employeeId: correction.employeeId ?? '',
        requester: requesterName(correction.employee),
        title: autoClosed
          ? 'Day closed with no check-out'
          : requestedCheckOut
            ? 'Missing check-out'
            : warning
              ? `Attendance regularization · ${warning}`
              : 'Attendance regularization',
        detail: requestedCheckOut
          ? `${autoClosed ? 'Proposed check-out' : 'Check-out'} at ${when}${warning ? ` · [${warning}]` : ''} · ${correction.reason ?? ''}`
          : [
              warning && `[${warning}]`,
              // The times asked for, so the approver sees what approving changes.
              correction.afterSnapshot?.correctedCheckIn &&
                `Check-in to ${clockTime(correction.afterSnapshot.correctedCheckIn)}`,
              correction.afterSnapshot?.correctedCheckOut &&
                `Check-out to ${clockTime(correction.afterSnapshot.correctedCheckOut)}`,
              correction.reason ?? '--',
            ]
              .filter(Boolean)
              .join(' · '),
        submittedAt: correction.requestedAt ?? correction.createdAt ?? null,
        ...(requestedCheckOut ? { proposedCheckOut: requestedCheckOut } : {}),
        autoClosed,
        requiresIndividualReview:
          correction.afterSnapshot?.missingAttendanceDay === true || legacyMissingAttendanceDay,
        currentStep: correction.currentStep,
        warningReason: warning,
        beforeSnapshot: correction.beforeSnapshot,
        afterSnapshot: correction.afterSnapshot,
      };
    });
    const holidayItems = (holidayReviews.data ?? []).map((review) => ({
      id: review.id,
      domain: 'HOLIDAY_CHECK_IN' as const,
      employeeId: review.employee.id,
      requester: requesterName(review.employee),
      title: 'Worked on an approved optional holiday',
      detail: `${`${review.employee.firstName} ${review.employee.lastName ?? ''}`.trim()} · ${
        review.holiday.name
      } (${formatDate(review.workDate)}) · ${review.reason}`,
      submittedAt: review.createdAt,
      holidayReview: review,
    }));
    const extraItems = extras.items.map((item) => ({
      ...item,
      employeeId: '',
      submittedAt: null,
    }));
    const advanceItems = advances.items.map((item) => ({ ...item, employeeId: '' }));
    return [...leaveItems, ...attendanceItems, ...holidayItems, ...extraItems, ...advanceItems];
  }, [attendance.data, leave.data, holidayReviews.data, extras.items, advances.items]);

  /**
   * Keeps the holiday or converts the day. Resolves with the server's result only once it has
   * accepted the decision, and announces the change so attendance, holiday and payroll screens
   * read it again rather than showing what they loaded before.
   */
  const decideHolidayReview = useCallback(
    async (item: ApprovalInboxItem, outcome: HolidayReviewOutcome, comment: string) => {
      const recorded: { decision: HolidayReviewDecision | null } = { decision: null };
      const ok = await run(async () => {
        recorded.decision = await holidayConflictsRepository.decide(
          organizationId!,
          item.id,
          outcome,
          comment,
        );
      }, 'The decision could not be recorded.');
      emitDataChanged('attendance', 'holidays', 'payroll', 'approvals');
      return ok ? recorded.decision : null;
    },
    [organizationId, run],
  );

  /**
   * Records a decision. `checkOutAt` is the approver's own time for a day that was closed
   * automatically, or whose requested time they are correcting; the server re-checks it.
   */
  const decide = useCallback(
    async (
      item: ApprovalInboxItem,
      status: 'APPROVED' | 'REJECTED',
      comment?: string,
      checkOutAt?: string,
    ) => {
      const ok = await run(
        () =>
          item.domain === 'ADVANCE'
            ? advances.decide(item.id, status === 'APPROVED', comment)
            : item.domain === 'COMP_OFF' || item.domain === 'ENCASHMENT'
              ? extras.decide({ id: item.id, domain: item.domain }, status === 'APPROVED', comment)
              : item.domain === 'LEAVE'
                ? leaveRepository.decide(organizationId!, item.id, status, comment)
                : attendanceRepository.decideCorrection(
                    organizationId!,
                    item.id,
                    status,
                    comment,
                    checkOutAt,
                  ),
        'The decision could not be recorded.',
      );
      // An approved correction changes the day, its timesheet and what payroll owes for it.
      // An approved advance is recovered by the next payroll run.
      if (ok && item.domain === 'ADVANCE') emitDataChanged('payroll', 'approvals');
      if (ok && item.domain === 'ATTENDANCE_CORRECTION')
        emitDataChanged('attendance', 'timesheets', 'payroll', 'approvals');
      return ok;
    },
    [organizationId, run, extras, advances],
  );

  return {
    batch,
    items,
    loading:
      leave.loading ||
      attendance.loading ||
      holidayReviews.loading ||
      extras.loading ||
      advances.loading,
    error:
      leave.error ?? attendance.error ?? holidayReviews.error ?? extras.error ?? advances.error,
    leaveForbidden: leave.forbidden || !canReadLeave,
    attendanceForbidden: attendance.forbidden || !canReadAttendance,
    refetch: refetchAll,
    saving,
    saveError,
    dismissError: () => setSaveError(null),
    decide,
    decideHolidayReview,
    // Comp-off, encashment and advances are listed only for someone who may decide them.
    canDecide: (item: ApprovalInboxItem) =>
      item.domain === 'COMP_OFF' || item.domain === 'ENCASHMENT' || item.domain === 'ADVANCE'
        ? true
        : item.domain === 'LEAVE'
          ? canDecideLeave
          : canDecideAttendance,
  };
}

export type ApprovalInboxState = Omit<ReturnType<typeof useApprovalInbox>, 'batch'> & {
  batch?: ReturnType<typeof useApprovalBatch>;
};
