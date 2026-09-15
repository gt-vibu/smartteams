import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { assertValidMissingCheckOut } from './attendance-missing-checkout';
import { AttendancePunchType } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Supplying a day's missing check-out through a correction.
 *
 * A day that ended on a check-in counted no worked time, and the correction workflow could not
 * repair it: it only moved existing punches. The exact case pinned here is the one reported —
 * check-in 09:12, no check-out, a correction for 18:07, a manager's approval, 535 minutes.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const RECORD = '22222222-2222-4222-8222-222222222222';
const CORRECTION = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_USER = '55555555-5555-4555-8555-555555555555';
const MANAGER_USER = '66666666-6666-4666-8666-666666666666';
const STEP_1 = '77777777-7777-4777-8777-777777777777';
const STEP_2 = '88888888-8888-4888-8888-888888888888';

// 14 Sept 2026 in Asia/Kolkata (+05:30): 09:12 is 03:42Z and 18:07 is 12:37Z.
const CHECK_IN = new Date('2026-09-14T03:42:00.000Z');
const CHECK_OUT_ISO = '2026-09-14T18:07:00+05:30';
const CHECK_OUT = new Date(CHECK_OUT_ISO);
const IN = AttendancePunchType.IN;
const OUT = AttendancePunchType.OUT;

function context(userId: string, permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}
const employee = context(EMPLOYEE_USER, ['attendance.corrections.write']);
const manager = context(MANAGER_USER, ['attendance.corrections.decide']);

type Punch = { punchType: AttendancePunchType; occurredAt: Date };

function setup(
  options: {
    punches?: Punch[];
    selfEmployeeId?: string | null;
    steps?: string[];
    requestedByClientId?: string | null;
    pendingMissingCheckOut?: boolean;
    nextPunchAt?: Date;
  } = {},
) {
  const punches: Punch[] = options.punches ?? [{ punchType: IN, occurredAt: CHECK_IN }];
  const steps = (options.steps ?? [STEP_1]).map((id, index) => ({
    id,
    stepNumber: index + 1,
    approverType: 'MANAGER',
    roleId: null,
    approverUserId: null,
  }));
  const recordRow = {
    id: RECORD,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    branchId: 'branch-1',
    workDate: new Date('2026-09-14'),
    employee: { userId: EMPLOYEE_USER, manager: { userId: MANAGER_USER } },
  };
  const state = {
    afterSnapshot: undefined as unknown,
    status: 'PENDING',
    approvals: [] as Array<{ approvalPolicyStepId: string }>,
    recordUpdate: undefined as undefined | Record<string, unknown>,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    employee: {
      findFirst: jest.fn((args: { where: { userId?: string } }) =>
        Promise.resolve(
          args.where.userId === EMPLOYEE_USER
            ? options.selfEmployeeId === undefined
              ? { id: EMPLOYEE }
              : options.selfEmployeeId && { id: options.selfEmployeeId }
            : { id: 'manager-employee' },
        ),
      ),
    },
    attendanceRecord: {
      findFirst: jest.fn(() => Promise.resolve({ ...recordRow, punches: [...punches] })),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        state.recordUpdate = args.data;
        return Promise.resolve({ ...recordRow, ...args.data });
      }),
    },
    attendancePunch: {
      findMany: jest.fn(() => Promise.resolve([...punches])),
      findFirst: jest.fn(() =>
        Promise.resolve(options.nextPunchAt ? { occurredAt: options.nextPunchAt } : null),
      ),
      create: jest.fn((args: { data: Punch }) => {
        punches.push({ punchType: args.data.punchType, occurredAt: args.data.occurredAt });
        return Promise.resolve(args.data);
      }),
      update: jest.fn(),
    },
    approvalPolicy: {
      findMany: jest.fn().mockResolvedValue([{ id: 'policy', isDefault: true, steps }]),
    },
    attendanceCorrection: {
      findMany: jest.fn(() =>
        Promise.resolve(
          options.pendingMissingCheckOut
            ? [{ afterSnapshot: { missingCheckOut: { occurredAt: CHECK_OUT_ISO } } }]
            : [],
        ),
      ),
      create: jest.fn((args: { data: { afterSnapshot: unknown } }) => {
        state.afterSnapshot = args.data.afterSnapshot;
        return Promise.resolve({ id: CORRECTION, ...args.data });
      }),
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: CORRECTION,
          organizationId: ORG,
          attendanceRecordId: RECORD,
          status: state.status,
          reason: 'Forgot to punch out',
          requestedByClientId: options.requestedByClientId ?? null,
          afterSnapshot: state.afterSnapshot,
          approvals: [...state.approvals],
          approvalPolicy: { steps },
          attendanceRecord: { ...recordRow, punches: [...punches] },
        }),
      ),
      update: jest.fn(
        (args: {
          data: { status: string; approvals: { create: { approvalPolicyStepId: string } } };
        }) => {
          state.status = args.data.status;
          state.approvals.push({
            approvalPolicyStepId: args.data.approvals.create.approvalPolicyStepId,
          });
          return Promise.resolve({ id: CORRECTION, status: state.status });
        },
      ),
    },
    // Role-based approvers are not used here; the manager step resolves from the employee row.
    userRole: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    organizationSettings: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ standardDayMinutes: 480 }),
    },
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AttendanceCorrectionsService(database as never, audit);
  return { tx, state, punches, service };
}

const request = { checkOutAt: CHECK_OUT_ISO, reason: 'Forgot to punch out' };

describe('missing check-out: the exact reported case', () => {
  it('09:12 check-in, correction for 18:07, manager approves: one OUT punch and 535 minutes', async () => {
    const { tx, state, punches, service } = setup();

    await service.requestMissingCheckOut(employee, RECORD, request);
    // Nothing changes until the approver decides.
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();

    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Confirmed with the team');

    expect(tx.attendancePunch.create).toHaveBeenCalledTimes(1);
    expect(punches.at(-1)).toEqual({ punchType: OUT, occurredAt: CHECK_OUT });
    expect(state.recordUpdate).toMatchObject({
      status: 'CORRECTED',
      workedMinutes: 535,
      overtimeMinutes: 55,
    });
    // The existing row is updated; no second attendance record is created.
    expect(tx.attendanceRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: RECORD } }),
    );
    // Payroll over that date is marked stale through the existing helper.
    expect(tx.payrollRun.updateMany).toHaveBeenCalled();
  });
});

describe('raising a missing check-out correction', () => {
  it('records the requested instant for the approver, and nothing else changes', async () => {
    const { tx, state, service } = setup();
    await service.requestMissingCheckOut(employee, RECORD, request);
    expect(state.afterSnapshot).toMatchObject({
      missingCheckOut: { occurredAt: CHECK_OUT.toISOString() },
    });
    expect(tx.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it('refuses a check-out before the check-in', async () => {
    const { tx, service } = setup();
    await expect(
      service.requestMissingCheckOut(employee, RECORD, {
        ...request,
        checkOutAt: '2026-09-14T09:00:00+05:30',
      }),
    ).rejects.toThrow('after the check-in');
    expect(tx.attendanceCorrection.create).not.toHaveBeenCalled();
  });

  it('refuses a request without a reason', async () => {
    const { tx, service } = setup();
    await expect(
      service.requestMissingCheckOut(employee, RECORD, { ...request, reason: ' ' }),
    ).rejects.toThrow('reason');
    expect(tx.attendanceCorrection.create).not.toHaveBeenCalled();
  });

  it("refuses an employee correcting a colleague's day", async () => {
    const { tx, service } = setup({ selfEmployeeId: 'someone-else' });
    await expect(service.requestMissingCheckOut(employee, RECORD, request)).rejects.toThrow(
      'You may only act on your own records',
    );
    expect(tx.attendanceCorrection.create).not.toHaveBeenCalled();
  });

  it('refuses a record from another tenant as missing', async () => {
    const { tx, service } = setup();
    tx.attendanceRecord.findFirst.mockResolvedValueOnce(null as never);
    await expect(service.requestMissingCheckOut(employee, RECORD, request)).rejects.toThrow(
      'Attendance record',
    );
  });

  it('refuses a day that already has a check-out', async () => {
    const { service } = setup({
      punches: [
        { punchType: IN, occurredAt: CHECK_IN },
        { punchType: OUT, occurredAt: new Date('2026-09-14T11:00:00Z') },
      ],
    });
    await expect(service.requestMissingCheckOut(employee, RECORD, request)).rejects.toThrow(
      'already has a check-out',
    );
  });

  it('refuses a second request while one is awaiting a decision', async () => {
    const { tx, service } = setup({ pendingMissingCheckOut: true });
    await expect(service.requestMissingCheckOut(employee, RECORD, request)).rejects.toThrow(
      'already awaiting a decision',
    );
    expect(tx.attendanceCorrection.create).not.toHaveBeenCalled();
  });
});

describe('deciding a missing check-out correction', () => {
  it('leaves attendance untouched when rejected', async () => {
    const { tx, service } = setup();
    await service.requestMissingCheckOut(employee, RECORD, request);
    await service.decideCorrection(manager, CORRECTION, 'REJECTED', 'No record of this');
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
    expect(tx.attendanceRecord.update).not.toHaveBeenCalled();
    expect(tx.payrollRun.updateMany).not.toHaveBeenCalled();
  });

  it('only changes attendance on the final step of a two-step policy', async () => {
    const { tx, service } = setup({ steps: [STEP_1, STEP_2] });
    await service.requestMissingCheckOut(employee, RECORD, request);

    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'First step');
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();

    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Second step');
    expect(tx.attendancePunch.create).toHaveBeenCalledTimes(1);
  });

  it('does not add a second check-out if the day was closed in the meantime', async () => {
    const { tx, punches, service } = setup();
    await service.requestMissingCheckOut(employee, RECORD, request);
    // An administrator punched the employee out before the approval.
    punches.push({ punchType: OUT, occurredAt: new Date('2026-09-14T12:00:00Z') });

    await expect(
      service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Approving'),
    ).rejects.toThrow('already has a check-out');
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
  });

  it('cannot be decided twice', async () => {
    const { tx, service } = setup();
    await service.requestMissingCheckOut(employee, RECORD, request);
    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Approving');
    await expect(
      service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Approving again'),
    ).rejects.toThrow('already decided');
    expect(tx.attendancePunch.create).toHaveBeenCalledTimes(1);
  });

  it('ignores the request on a correction a federation client raised — that path is unchanged', async () => {
    const { tx, state, service } = setup({ requestedByClientId: 'partner-client' });
    state.afterSnapshot = { missingCheckOut: { occurredAt: CHECK_OUT_ISO } };
    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Approving');
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
    // Exactly as before: the record is re-totalled from its existing punches, which stay open.
    expect(state.recordUpdate).toMatchObject({ workedMinutes: 0 });
  });

  it('keeps moving an existing check-out the way it always has', async () => {
    const existingOut = new Date('2026-09-14T11:00:00Z');
    const { tx, state, service } = setup({
      punches: [
        { punchType: IN, occurredAt: CHECK_IN },
        { punchType: OUT, occurredAt: existingOut },
      ],
    });
    tx.attendancePunch.findMany.mockResolvedValue([
      { id: 'in', punchType: IN, occurredAt: CHECK_IN },
      { id: 'out', punchType: OUT, occurredAt: existingOut },
    ] as never);
    tx.attendanceCorrection.findFirst.mockImplementation(
      () =>
        Promise.resolve({
          id: CORRECTION,
          organizationId: ORG,
          attendanceRecordId: RECORD,
          status: 'PENDING',
          reason: 'Left later than punched',
          requestedByClientId: null,
          afterSnapshot: { correctedCheckOut: CHECK_OUT.toISOString() },
          approvals: [],
          approvalPolicy: {
            steps: [
              {
                id: STEP_1,
                stepNumber: 1,
                approverType: 'MANAGER',
                roleId: null,
                approverUserId: null,
              },
            ],
          },
          attendanceRecord: {
            id: RECORD,
            employeeId: EMPLOYEE,
            branchId: 'branch-1',
            workDate: new Date('2026-09-14'),
            employee: { userId: EMPLOYEE_USER, manager: { userId: MANAGER_USER } },
            punches: [
              { id: 'in', punchType: IN, occurredAt: CHECK_IN },
              { id: 'out', punchType: OUT, occurredAt: existingOut },
            ],
          },
        }) as never,
    );
    await service.decideCorrection(manager, CORRECTION, 'APPROVED', 'Approving');
    expect(tx.attendancePunch.create).not.toHaveBeenCalled();
    expect(tx.attendancePunch.update).toHaveBeenCalledWith({
      where: { id: 'out' },
      data: { occurredAt: CHECK_OUT },
    });
    expect(state.recordUpdate).toMatchObject({ workedMinutes: 535 });
  });
});

describe('assertValidMissingCheckOut', () => {
  const open = [{ punchType: IN, occurredAt: CHECK_IN }];
  const now = new Date('2026-09-16T00:00:00Z');
  it('accepts a check-out after the check-in, in the past', () => {
    expect(() => assertValidMissingCheckOut(open, CHECK_OUT, now)).not.toThrow();
  });
  it('accepts a check-out after midnight for a late shift', () => {
    const lateIn = [{ punchType: IN, occurredAt: new Date('2026-09-14T16:09:00Z') }]; // 21:39 IST
    expect(() =>
      assertValidMissingCheckOut(lateIn, new Date('2026-09-14T19:30:00Z'), now),
    ).not.toThrow(); // 01:00 IST on the 15th
  });
  it('refuses a future check-out', () => {
    expect(() => assertValidMissingCheckOut(open, new Date('2026-09-17T00:00:00Z'), now)).toThrow(
      'future',
    );
  });
  it('refuses a check-out more than a day after the check-in', () => {
    expect(() => assertValidMissingCheckOut(open, new Date('2026-09-15T04:00:00Z'), now)).toThrow(
      'within 24 hours',
    );
  });
  it("refuses a check-out after the employee's next punch", () => {
    expect(() =>
      assertValidMissingCheckOut(open, CHECK_OUT, now, new Date('2026-09-14T10:00:00Z')),
    ).toThrow('before your next recorded punch');
  });
  it('refuses a day with no check-in', () => {
    expect(() => assertValidMissingCheckOut([], CHECK_OUT, now)).toThrow('no check-in');
  });
});
