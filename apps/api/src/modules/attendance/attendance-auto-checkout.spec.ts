import { AttendanceAutoCheckOutService } from './attendance-auto-checkout.service';
import { instantAtLocalTime, isAutoClose, wallClock } from './attendance-auto-checkout';
import { missingCheckOutFrom } from './attendance-missing-checkout';
import type { DomainContext } from '../../common/context/domain-context';
import { DEFAULT_MISSED_CHECK_OUT_POLICY, type MissedCheckOutPolicy } from '@smarteam/contracts';

/**
 * Closing a day nobody checked out of.
 *
 * The close proposes; it never decides. What is pinned here is that it raises the ordinary
 * correction for a human to settle, that it leaves attendance and pay untouched until they do,
 * and the four cases where it must keep its hands off the day entirely.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const RECORD = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

// 16 Sept 2026 in Asia/Kolkata: 23:59 local is 18:29Z, so 19:00Z is after the day's close.
const AFTER_CUTOFF = new Date('2026-09-16T19:00:00.000Z');
const BEFORE_CUTOFF = new Date('2026-09-16T12:00:00.000Z');
const CHECK_IN = new Date('2026-09-16T03:42:00.000Z');
const CLOSE_TIME = new Date(Date.UTC(1970, 0, 1, 23, 59));

function adminContext(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: 'admin-1' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function setup(
  options: {
    mode?: 'DISABLED' | 'REVIEW_REQUIRED';
    openDays?: number;
    nightShift?: boolean;
    pendingMissingCheckOut?: boolean;
    lastPunchOut?: boolean;
    policy?: MissedCheckOutPolicy;
    assignedShift?: { endsAt: Date; crossesMidnight: boolean; daysOfWeek: number[] };
  } = {},
) {
  const record = {
    id: RECORD,
    employeeId: EMPLOYEE,
    branchId: 'branch-1',
    workDate: new Date('2026-09-16'),
    punches: [
      { punchType: 'IN', occurredAt: CHECK_IN },
      ...(options.lastPunchOut
        ? [{ punchType: 'OUT', occurredAt: new Date('2026-09-16T12:00:00.000Z') }]
        : []),
    ],
    employee: { userId: 'employee-1', manager: { userId: 'manager-1' } },
  };
  const created: Array<{ reason: string; afterSnapshot: unknown }> = [];
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: {
      findMany: jest.fn().mockResolvedValue([{ id: ORG, timezone: 'Asia/Kolkata' }]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        timezone: 'Asia/Kolkata',
        settings: { autoCheckOutMode: options.mode ?? 'REVIEW_REQUIRED' },
      }),
    },
    organizationSettings: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        autoCheckOutMode: options.mode ?? 'REVIEW_REQUIRED',
        autoCheckOutAt: CLOSE_TIME,
        metadata: options.policy ? { missedCheckOutPolicy: options.policy } : undefined,
        payrollDayOfMonth: null,
      }),
    },
    attendanceRecord: {
      findMany: jest.fn().mockResolvedValue(options.openDays === 0 ? [] : [record]),
      findUnique: jest.fn().mockResolvedValue({
        employeeId: 'employee-1',
        workDate: new Date('2026-09-18T00:00:00Z'),
      }),
    },
    employeeShiftAssignment: {
      findFirst: jest.fn().mockResolvedValue(
        options.nightShift || options.assignedShift
          ? {
              id: 'assignment-1',
              shift: options.assignedShift ?? {
                endsAt: new Date(Date.UTC(1970, 0, 1, 6)),
                crossesMidnight: true,
                daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
              },
            }
          : null,
      ),
    },
    attendanceCorrection: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.pendingMissingCheckOut
            ? [{ afterSnapshot: { missingCheckOut: { occurredAt: '2026-09-16T18:29:00.000Z' } } }]
            : [],
        ),
      create: jest.fn((args: { data: { reason: string; afterSnapshot: unknown } }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'correction-1', ...args.data });
      }),
    },
    approvalPolicy: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'policy-1',
          isDefault: true,
          steps: [
            {
              id: 'step-1',
              stepNumber: 1,
              approverType: 'MANAGER',
              roleId: null,
              approverUserId: null,
            },
          ],
        },
      ]),
    },
    attendancePunch: { create: jest.fn() },
    userRole: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
    employee: { findFirst: jest.fn().mockResolvedValue({ userId: 'manager-1' }) },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1' }) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
    runSystem: jest.fn((_org: unknown, cb: (client: unknown) => unknown) =>
      Promise.resolve(cb(tx)),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    tx,
    record,
    created,
    audit,
    service: new AttendanceAutoCheckOutService(database as never, audit),
  };
}

describe('the day close', () => {
  it('raises a correction at the tenant cutoff and changes no attendance', async () => {
    const { tx, created, service } = setup();
    const outcome = await service.closeDueDays(AFTER_CUTOFF);

    expect(outcome.closed).toBe(1);
    expect(created).toHaveLength(1);
    const snapshot = created[0]?.afterSnapshot;
    // 23:59 in Asia/Kolkata, as an instant.
    expect(missingCheckOutFrom(snapshot)?.toISOString()).toBe('2026-09-16T18:29:00.000Z');
    expect(isAutoClose(snapshot)).toBe(true);
    // Nothing is punched, nothing is totalled, nothing is paid: a human decides that.
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
    // The request belongs to nobody: no person asked for it.
    expect((created[0] as { requestedByUserId?: string }).requestedByUserId).toBeUndefined();
  });

  it('waits until the organization’s own day is over', async () => {
    const { created, service } = setup();
    const outcome = await service.closeDueDays(BEFORE_CUTOFF);
    expect(outcome.closed).toBe(0);
    expect(created).toHaveLength(0);
  });

  it('leaves a night shift alone, because it is still being worked at 23:59', async () => {
    const { created, service } = setup({ nightShift: true });
    const outcome = await service.closeDueDays(AFTER_CUTOFF);
    expect(outcome.skippedNightShift).toBe(1);
    expect(created).toHaveLength(0);
  });

  it('proposes the assigned shift end after its local deadline', async () => {
    const policy: MissedCheckOutPolicy = {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      resolutionMethod: 'PROVISIONAL_AUTO_CLOSE',
      correctionDeadline: 'SAME_DAY',
      closeTimeSource: 'SHIFT_END',
      configuredTime: '23:59',
    };
    const { created, service } = setup({
      policy,
      assignedShift: {
        endsAt: new Date(Date.UTC(1970, 0, 1, 17)),
        crossesMidnight: false,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      },
    });
    const outcome = await service.closeDueDays(AFTER_CUTOFF);
    expect(outcome.closed).toBe(1);
    expect(missingCheckOutFrom(created[0]?.afterSnapshot)?.toISOString()).toBe(
      '2026-09-16T11:30:00.000Z',
    );
    expect(created[0]?.afterSnapshot).toMatchObject({
      missingCheckOut: { policyVersion: 1, policy: { closeTimeSource: 'SHIFT_END' } },
    });
  });

  it('does not auto-resolve when the employee-correction fallback is keep-open', async () => {
    const policy: MissedCheckOutPolicy = {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      resolutionMethod: 'EMPLOYEE_CORRECTION',
      deadlineFallback: 'KEEP_OPEN',
    };
    const { tx, created, service } = setup({ policy });
    const outcome = await service.closeDueDays(AFTER_CUTOFF);
    expect(outcome.closed).toBe(0);
    expect(created).toHaveLength(0);
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('does not raise a second request for a day already awaiting one', async () => {
    const { created, service } = setup({ pendingMissingCheckOut: true });
    const outcome = await service.closeDueDays(AFTER_CUTOFF);
    expect(outcome.skippedAlreadyPending).toBe(1);
    expect(created).toHaveLength(0);
  });

  it('paginates across organization-sized batches instead of stopping at the first 200 records', async () => {
    const { tx, record, created, service } = setup();
    const makeBatch = (start: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...record,
        id: `record-${String(start + index).padStart(4, '0')}`,
      }));
    tx.attendanceRecord.findMany
      .mockResolvedValueOnce(makeBatch(0, 200))
      .mockResolvedValueOnce(makeBatch(200, 1));

    const outcome = await service.closeDueDays(AFTER_CUTOFF);

    expect(outcome.closed).toBe(201);
    expect(created).toHaveLength(201);
    expect(tx.attendanceRecord.findMany).toHaveBeenCalledTimes(2);
  });

  it('ignores a day whose last punch is a check-out', async () => {
    const { created, service } = setup({ lastPunchOut: true });
    await service.closeDueDays(AFTER_CUTOFF);
    expect(created).toHaveLength(0);
  });

  it('does nothing for an organization that has not asked for it', async () => {
    const { tx, service } = setup({ mode: 'DISABLED' });
    tx.organization.findMany.mockResolvedValue([]);
    const outcome = await service.closeDueDays(AFTER_CUTOFF);
    expect(outcome.closed).toBe(0);
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});

describe('running the close on request', () => {
  it('needs permission over attendance settings', async () => {
    const { service } = setup();
    await expect(service.runNow(adminContext(['attendance.read']))).rejects.toThrow(
      'Missing permission: attendance.preferences.write',
    );
  });

  it('closes the day and records who asked', async () => {
    const { created, audit, service } = setup();
    const outcome = await service.runNow(
      adminContext(['attendance.preferences.write']),
      AFTER_CUTOFF,
    );
    expect(outcome.closed).toBe(1);
    expect(created).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { type: 'USER', userId: 'admin-1' } }),
      expect.objectContaining({ action: 'ATTENDANCE_AUTO_CHECK_OUT_RUN' }),
      expect.anything(),
    );
  });

  it('does nothing while the organization has it switched off', async () => {
    const { created, service } = setup({ mode: 'DISABLED' });
    const outcome = await service.runNow(
      adminContext(['attendance.preferences.write']),
      AFTER_CUTOFF,
    );
    expect(outcome.closed).toBe(0);
    expect(created).toHaveLength(0);
  });
});

describe('the cutoff instant', () => {
  it('is the wall clock where the employee works, not UTC', () => {
    expect(instantAtLocalTime('2026-09-16', '23:59', 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-16T18:29:00.000Z',
    );
    expect(instantAtLocalTime('2026-09-16', '23:59', 'UTC').toISOString()).toBe(
      '2026-09-16T23:59:00.000Z',
    );
    // New York in September is UTC-4, so the same wall clock is the small hours of the next day.
    expect(instantAtLocalTime('2026-09-16', '23:59', 'America/New_York').toISOString()).toBe(
      '2026-09-17T03:59:00.000Z',
    );
  });

  it('survives the night the clocks go back', () => {
    // 1 Nov 2026 is the US change; the cutoff is still that date's 23:59, at UTC-5.
    expect(instantAtLocalTime('2026-11-01', '23:59', 'America/New_York').toISOString()).toBe(
      '2026-11-02T04:59:00.000Z',
    );
  });

  it('reads the stored time-only column as a wall clock', () => {
    expect(wallClock(CLOSE_TIME)).toBe('23:59');
    expect(wallClock(new Date(Date.UTC(1970, 0, 1, 9, 5)))).toBe('09:05');
  });
});
