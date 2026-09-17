import {
  COLLEAGUE_USER,
  context,
  DAY,
  EMPLOYEE,
  EMPLOYEE_USER,
  employeeCtx,
  HR_ROLE,
  MANAGER_USER,
  managerCtx,
  OTHER_ORG,
  RECORD,
  SECOND_MANAGER_USER,
  SELECTION,
  tenant,
} from './attendance-holiday-review.fixture';
import { holidayConflictState } from './attendance-holiday-conflict';

/**
 * A check-in on a granted optional holiday: always accepted, then explained by the employee and
 * decided by a manager — keep the holiday, or make it a working day. Never silently either.
 */

const IN = { punchType: 'IN' as const, occurredAt: new Date('2026-09-14T03:42:00Z') };
const OUT = { punchType: 'OUT' as const, occurredAt: new Date('2026-09-14T12:37:00Z') };
const request = { reason: 'Asked to cover the release', comment: 'Manager called at 8' };
const keep = { outcome: 'KEEP_HOLIDAY' as const, comment: 'Not needed; take the holiday' };
const convert = { outcome: 'CONVERT_TO_WORKING_DAY' as const, comment: 'Worked on request' };

async function conflictState(t: ReturnType<typeof tenant>) {
  const { conflicts } = await t.service.listConflicts(employeeCtx, {
    from: '2026-09-01',
    to: '2026-09-30',
  });
  return conflicts[0]?.state ?? null;
}

describe('detecting the conflict', () => {
  it('1. an optional holiday with no check-in is not a conflict', async () => {
    const t = tenant({ punches: [] });
    expect(await conflictState(t)).toBeNull();
  });

  it('2. a check-in on the holiday needs the employee’s reason', async () => {
    const t = tenant({ punches: [IN] });
    expect(await conflictState(t)).toBe('AWAITING_REASON');
  });

  it('3. a check-in and check-out is the same conflict, with its worked time untouched', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const { conflicts } = await t.service.listConflicts(employeeCtx, {
      from: '2026-09-14',
      to: '2026-09-14',
    });
    expect(conflicts[0]).toMatchObject({
      state: 'AWAITING_REASON',
      holiday: { name: 'Onam', date: '2026-09-14' },
      attendance: { workedMinutes: 535, overtimeMinutes: 55 },
    });
  });

  it('4. a check-in with no check-out is still a conflict, and can be explained and decided', async () => {
    const t = tenant({ punches: [IN] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    expect(await conflictState(t)).toBe('AWAITING_DECISION');
    await t.service.decide(managerCtx, review.id, keep);
    expect(t.record).toMatchObject({ status: 'REJECTED', workedMinutes: 0 });
  });

  it('is not shown for a holiday the employee cancelled themselves', () => {
    const selection = {
      id: SELECTION,
      employeeId: EMPLOYEE,
      holidayId: 'h',
      status: 'CANCELLED',
      holiday: { id: 'h', name: 'Onam', holidayDate: DAY, isOptional: true, isActive: true },
    };
    const record = {
      id: RECORD,
      employeeId: EMPLOYEE,
      workDate: DAY,
      status: 'COMPLETED',
      workedMinutes: 480,
      overtimeMinutes: 0,
      punchCount: 2,
    };
    expect(holidayConflictState(record, selection, [])).toBeNull();
  });
});

describe('the employee’s explanation', () => {
  it('records the reason and comment, audited, and changes neither attendance nor holiday', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    expect(review).toMatchObject({
      status: 'PENDING',
      reason: request.reason,
      comment: request.comment,
    });
    expect(t.auditActions()).toEqual(['ATTENDANCE_HOLIDAY_REVIEW_REQUESTED']);
    expect(t.record).toMatchObject({ status: 'COMPLETED', workedMinutes: 535 });
    expect(t.selection.status).toBe('CONFIRMED');
  });

  it('is refused a second time while one awaits a decision', async () => {
    const t = tenant();
    await t.service.requestReview(employeeCtx, RECORD, request);
    await expect(t.service.requestReview(employeeCtx, RECORD, request)).rejects.toThrow(
      'already awaiting a manager decision',
    );
  });

  it("is refused for a colleague's day", async () => {
    const t = tenant();
    const colleague = context(COLLEAGUE_USER, ['attendance.read', 'attendance.corrections.write']);
    await expect(t.service.requestReview(colleague, RECORD, request)).rejects.toThrow(
      'You may only act on your own records',
    );
  });
});

describe('the manager’s decision', () => {
  it('5. keep the holiday: punches kept as history, no worked time, holiday still granted', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const result = await t.service.decide(managerCtx, review.id, keep);
    expect(result.result).toBe('KEEP_HOLIDAY');
    expect(t.record).toMatchObject({ status: 'REJECTED', workedMinutes: 0, overtimeMinutes: 0 });
    expect(t.record.correctionNote).toContain('Optional holiday kept');
    expect(t.tx.attendanceRecord.update).toHaveBeenCalledTimes(1); // no punch is deleted
    expect(t.selection.status).toBe('CONFIRMED');
    expect(t.outbox.append).not.toHaveBeenCalled();
    expect(t.reviews[0]).toMatchObject({ status: 'APPROVED', outcome: 'KEEP_HOLIDAY' });
    expect(t.auditActions()).toContain('ATTENDANCE_HOLIDAY_REVIEW_HOLIDAY_KEPT');
    expect(await conflictState(t)).toBe('HOLIDAY_KEPT');
  });

  it('6. convert to a working day: the holiday is cancelled the existing way, attendance kept', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    await t.service.decide(managerCtx, review.id, convert);
    expect(t.selection).toMatchObject({ status: 'CANCELLED' });
    expect(t.selection.cancelledAt).toBeInstanceOf(Date);
    expect(t.record).toMatchObject({
      status: 'COMPLETED',
      workedMinutes: 535,
      overtimeMinutes: 55,
    });
    // The same audit action and event an employee's own cancellation produces.
    expect(t.auditActions()).toEqual(
      expect.arrayContaining(['EMPLOYEE_HOLIDAY_CANCELLED', 'ATTENDANCE_HOLIDAY_REVIEW_CONVERTED']),
    );
    expect(t.outbox.append).toHaveBeenCalledWith(
      managerCtx,
      expect.objectContaining({ eventType: 'employee.holiday.cancelled', aggregateId: SELECTION }),
      expect.anything(),
    );
    expect(await conflictState(t)).toBe('CONVERTED_TO_WORKING_DAY');
  });

  it('7. a CALCULATED payroll run over the day is marked stale', async () => {
    const t = tenant({ runs: [{ id: 'run', status: 'CALCULATED' }] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const result = await t.service.decide(managerCtx, review.id, convert);
    expect(result.payroll).toEqual({ markedStale: 1, finalizedRuns: [] });
  });

  it('8. a DRAFT run has nothing to invalidate and is left alone', async () => {
    const t = tenant({ runs: [{ id: 'run', status: 'DRAFT' }] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const result = await t.service.decide(managerCtx, review.id, keep);
    expect(result.payroll).toEqual({ markedStale: 0, finalizedRuns: [] });
  });

  it('9. a RELEASED run is not changed, and the decision reports it for the correction workflow', async () => {
    const t = tenant({ runs: [{ id: 'run', status: 'RELEASED' }] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const result = await t.service.decide(managerCtx, review.id, keep);
    expect(result.payroll).toEqual({
      markedStale: 0,
      finalizedRuns: [{ id: 'run', status: 'RELEASED' }],
    });
    expect(t.runs[0]!.calculationStaleAt).toBeNull();
  });
});

describe('who may decide, and when', () => {
  it('10. another tenant cannot see, explain or decide the review', async () => {
    const t = tenant();
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const outsider = context(
      MANAGER_USER,
      ['attendance.corrections.decide', 'attendance.corrections.write'],
      OTHER_ORG,
    );
    await expect(t.service.decide(outsider, review.id, keep)).rejects.toThrow('Holiday review');
    await expect(t.service.requestReview(outsider, RECORD, request)).rejects.toThrow(
      'Attendance record',
    );
    expect(t.reviews[0]!.status).toBe('PENDING');
  });

  it('11. the employee cannot resolve their own conflict', async () => {
    const t = tenant();
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    await expect(t.service.decide(employeeCtx, review.id, convert)).rejects.toThrow(
      'Missing permission: attendance.corrections.decide',
    );
    // Even holding the decide permission, deciding one's own day is refused.
    const selfDecider = context(EMPLOYEE_USER, ['attendance.corrections.decide']);
    await expect(t.service.decide(selfDecider, review.id, convert)).rejects.toThrow(
      'may not decide this review',
    );
    expect(t.selection.status).toBe('CONFIRMED');
  });

  it('refuses a manager who is not an approver for this employee', async () => {
    const t = tenant();
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const otherManager = context(SECOND_MANAGER_USER, ['attendance.corrections.decide']);
    await expect(t.service.decide(otherManager, review.id, keep)).rejects.toThrow(
      'may not decide this review',
    );
  });

  it('lets an administrator on a role step decide', async () => {
    const t = tenant({
      steps: [{ approverType: 'MANAGER' }, { approverType: 'ROLE', roleId: HR_ROLE }],
      hrUsers: [SECOND_MANAGER_USER],
    });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    const hr = context(SECOND_MANAGER_USER, ['attendance.corrections.decide']);
    await t.service.decide(hr, review.id, keep);
    expect(t.reviews[0]).toMatchObject({
      status: 'APPROVED',
      decidedByUserId: SECOND_MANAGER_USER,
    });
  });

  it('12. a review cannot be decided twice', async () => {
    const t = tenant();
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    await t.service.decide(managerCtx, review.id, keep);
    await expect(t.service.decide(managerCtx, review.id, convert)).rejects.toThrow(
      'already decided',
    );
    expect(t.selection.status).toBe('CONFIRMED');
  });

  it('13. two approvers at once: the review is locked before it is read, and one decision wins', async () => {
    const t = tenant({
      steps: [{ approverType: 'MANAGER' }, { approverType: 'ROLE', roleId: HR_ROLE }],
      hrUsers: [SECOND_MANAGER_USER],
    });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    t.locks.length = 0;
    const hr = context(SECOND_MANAGER_USER, ['attendance.corrections.decide']);
    const outcomes = await Promise.allSettled([
      t.service.decide(managerCtx, review.id, keep),
      t.service.decide(hr, review.id, convert),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ message: 'This review is already decided' }) as unknown,
    });
    expect(t.locks[0]).toBe('attendance_holiday_reviews');
    expect(t.locks).toEqual(
      expect.arrayContaining(['attendance_records', 'employee_holiday_selections']),
    );
  });

  it('14. a holiday cancelled before the decision closes the review without changing anything', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    t.selection.status = 'CANCELLED';
    const result = await t.service.decide(managerCtx, review.id, keep);
    expect(result.result).toBe('NO_LONGER_IN_CONFLICT');
    expect(t.reviews[0]).toMatchObject({ status: 'CANCELLED', outcome: null });
    expect(t.record).toMatchObject({ status: 'COMPLETED', workedMinutes: 535 });
    expect(t.auditActions()).toContain('ATTENDANCE_HOLIDAY_REVIEW_CLOSED');
    expect(t.tx.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it('15. attendance corrected before the decision: the decision applies to the corrected day', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    Object.assign(t.record, { status: 'CORRECTED', workedMinutes: 600, overtimeMinutes: 120 });
    await t.service.decide(managerCtx, review.id, keep);
    expect(t.record).toMatchObject({ status: 'REJECTED', workedMinutes: 0, overtimeMinutes: 0 });
  });

  it('a correction approved after the holiday was kept reopens the conflict instead of double counting', async () => {
    const t = tenant({ punches: [IN, OUT] });
    const review = await t.service.requestReview(employeeCtx, RECORD, request);
    await t.service.decide(managerCtx, review.id, keep);
    Object.assign(t.record, { status: 'CORRECTED', workedMinutes: 535 });
    expect(await conflictState(t)).toBe('AWAITING_REASON');
  });
});

describe('the approver inbox', () => {
  it('lists the review for the manager, not for the employee or another manager', async () => {
    const t = tenant();
    await t.service.requestReview(employeeCtx, RECORD, request);
    const { reviews } = await t.service.listInbox(managerCtx);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ reason: request.reason, holiday: { name: 'Onam' } });
    const selfDecider = context(EMPLOYEE_USER, ['attendance.corrections.decide']);
    expect((await t.service.listInbox(selfDecider)).reviews).toHaveLength(0);
    const other = context(SECOND_MANAGER_USER, ['attendance.corrections.decide']);
    expect((await t.service.listInbox(other)).reviews).toHaveLength(0);
  });

  it('a self-service caller cannot list a colleague’s conflicts', async () => {
    const t = tenant();
    await expect(
      t.service.listConflicts(context(COLLEAGUE_USER, ['attendance.read']), {
        employeeId: EMPLOYEE,
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).rejects.toThrow('Employees may only read their own attendance records');
  });
});
