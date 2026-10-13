import type { DomainContext } from '../../common/context/domain-context';
import {
  assertOpenPayrollPeriod,
  automaticApproval,
  systemApprovalContext,
  validateAutomation,
} from './approval-automation';

describe('Automatic approval safeguards', () => {
  const branchId = '00000000-0000-4000-8000-000000000001';
  const leaveTypeId = '00000000-0000-4000-8000-000000000002';
  const now = new Date('2026-10-07T10:00:00Z');
  it('keeps existing policies manual and fails closed on invalid rules', () => {
    expect(automaticApproval({}, { leaveDays: 1 }, now)).toBe(false);
    expect(automaticApproval({ mode: 'AUTOMATIC', maxLeaveDays: -1 }, { leaveDays: 1 }, now)).toBe(
      false,
    );
  });
  it('requires every scope, date and limit to match', () => {
    const rule = {
      mode: 'CONDITIONAL',
      branchIds: [branchId],
      leaveTypeIds: [leaveTypeId],
      maxLeaveDays: 2,
      minNoticeDays: 3,
      effectiveOn: '2026-10-07',
    };
    const facts = { branchId, leaveTypeId, leaveDays: 2, noticeDays: 3 };
    expect(automaticApproval(rule, facts, now)).toBe(true);
    for (const change of [
      { branchId: null },
      { leaveTypeId: branchId },
      { leaveDays: 3 },
      { noticeDays: 2 },
      { requiresReview: true },
    ])
      expect(automaticApproval(rule, { ...facts, ...change }, now)).toBe(false);
    expect(automaticApproval({ ...rule, effectiveOn: '2026-10-08' }, facts, now)).toBe(false);
    expect(automaticApproval(rule, { branchId, leaveTypeId, leaveDays: 2 }, now)).toBe(false);
  });
  it('requires meaningful conditional limits before saving a policy', () => {
    expect(() => validateAutomation('LEAVE', { mode: 'CONDITIONAL' })).toThrow('maximum');
    expect(() =>
      validateAutomation('ATTENDANCE_CORRECTION', { mode: 'CONDITIONAL', maxChangedMinutes: 15 }),
    ).toThrow('age');
    expect(() => validateAutomation('PAYROLL', { mode: 'AUTOMATIC' })).toThrow(
      'leave and attendance',
    );
  });
  it('attributes system decisions without retaining the requester as an approver', () => {
    const context: DomainContext = {
      organizationId: branchId,
      accessMode: 'NATIVE',
      actor: { type: 'USER', userId: leaveTypeId },
      permissions: new Set(['*']),
      correlationId: 'c',
      requestId: 'r',
    };
    const system = systemApprovalContext(context);
    expect(system.actor).toEqual({ type: 'SYSTEM' });
    expect(system.permissions.size).toBe(0);
    expect(context.actor.userId).toBe(leaveTypeId);
  });
  it('refuses changes to released payroll and locks the period before checking it', async () => {
    const calls: string[] = [];
    const tx = {
      $queryRaw: jest.fn(() => {
        calls.push('lock');
        return Promise.resolve([]);
      }),
      payrollRun: {
        findFirst: jest.fn(() => {
          calls.push('check');
          return Promise.resolve({ id: branchId });
        }),
      },
    };
    await expect(assertOpenPayrollPeriod(tx as never, branchId, now, now)).rejects.toThrow(
      'correction run',
    );
    expect(calls).toEqual(['lock', 'check']);
  });
});
