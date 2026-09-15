import { AttendanceHolidayReviewService } from './attendance-holiday-review.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * An in-memory tenant for the holiday-review specs: one employee with a CONFIRMED optional holiday
 * on 2026-09-14, their manager, an HR administrator, and whatever attendance the test adds.
 */

export const ORG = '11111111-1111-4111-8111-111111111111';
export const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
export const EMPLOYEE = '22222222-2222-4222-8222-222222222222';
export const EMPLOYEE_USER = '33333333-3333-4333-8333-333333333333';
export const MANAGER_USER = '44444444-4444-4444-8444-444444444444';
export const SECOND_MANAGER_USER = '45454545-4545-4545-8545-454545454545';
export const COLLEAGUE_USER = '55555555-5555-4555-8555-555555555555';
export const RECORD = '66666666-6666-4666-8666-666666666666';
export const HOLIDAY = '77777777-7777-4777-8777-777777777777';
export const SELECTION = '88888888-8888-4888-8888-888888888888';
export const HR_ROLE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const DAY = new Date('2026-09-14T00:00:00.000Z');

export function context(
  userId: string,
  permissions: string[],
  organizationId = ORG,
): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

export const employeeCtx = context(EMPLOYEE_USER, [
  'attendance.read',
  'attendance.corrections.write',
]);
export const managerCtx = context(MANAGER_USER, [
  'attendance.read',
  'attendance.corrections.decide',
]);

type Row = Record<string, unknown> & { id: string };

export function tenant(
  options: {
    punches?: Array<{ punchType: 'IN' | 'OUT'; occurredAt: Date }>;
    recordStatus?: string;
    workedMinutes?: number;
    overtimeMinutes?: number;
    runs?: Array<{ id: string; status: string }>;
    /** Approval steps of the default correction policy. */
    steps?: Array<{ approverType: string; roleId?: string; approverUserId?: string }>;
    hrUsers?: string[];
  } = {},
) {
  const holiday = {
    id: HOLIDAY,
    organizationId: ORG,
    name: 'Onam',
    holidayDate: DAY,
    isOptional: true,
    isActive: true,
  };
  const selection: Row = {
    id: SELECTION,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    holidayId: HOLIDAY,
    year: 2026,
    status: 'CONFIRMED',
    cancelledAt: null,
  };
  const punches = options.punches ?? [
    { punchType: 'IN' as const, occurredAt: new Date('2026-09-14T03:42:00Z') },
  ];
  const record: Row = {
    id: RECORD,
    organizationId: ORG,
    employeeId: EMPLOYEE,
    branchId: 'branch-1',
    workDate: DAY,
    status: options.recordStatus ?? (punches.length % 2 === 0 ? 'COMPLETED' : 'OPEN'),
    dayStatus: 'PRESENT',
    workedMinutes: options.workedMinutes ?? (punches.length >= 2 ? 535 : 0),
    overtimeMinutes: options.overtimeMinutes ?? (punches.length >= 2 ? 55 : 0),
    correctionNote: null,
  };
  const employeeRow = {
    id: EMPLOYEE,
    firstName: 'Vibu',
    lastName: 'D',
    employeeNumber: 'E1',
    userId: EMPLOYEE_USER,
    manager: { userId: MANAGER_USER },
  };
  const reviews: Row[] = [];
  const runs = (options.runs ?? []).map((run) => ({
    ...run,
    calculationStaleAt: null as Date | null,
  }));
  const steps = (options.steps ?? [{ approverType: 'MANAGER' }]).map((step, index) => ({
    id: `step-${index + 1}`,
    stepNumber: index + 1,
    roleId: step.roleId ?? null,
    approverUserId: step.approverUserId ?? null,
    approverType: step.approverType,
  }));
  const locks: string[] = [];
  const inOrg = (where: { organizationId?: string }) => where.organizationId === ORG;
  const fullRecord = () => ({
    ...record,
    employee: employeeRow,
    punches: [...punches],
    _count: { punches: punches.length },
  });
  const fullReview = (review: Row) => ({
    ...review,
    holiday,
    selection,
    attendanceRecord: fullRecord(),
  });

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      locks.push(strings.join('?').split(' FROM ')[1]?.split(' ')[0] ?? '');
      return Promise.resolve([]);
    }),
    employee: {
      findFirst: jest.fn((args: { where: { userId?: string } }) =>
        Promise.resolve(
          args.where.userId === EMPLOYEE_USER
            ? { id: EMPLOYEE }
            : args.where.userId
              ? { id: `employee-of-${args.where.userId}` }
              : null,
        ),
      ),
    },
    userRole: {
      findFirst: jest.fn((args: { where: { userId: string } }) =>
        Promise.resolve((options.hrUsers ?? []).includes(args.where.userId) ? { id: 'ur' } : null),
      ),
    },
    approvalPolicy: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'policy', isDefault: true, steps }])),
    },
    employeeHolidaySelection: {
      findMany: jest.fn((args: { where: { organizationId: string; status: { in: string[] } } }) =>
        Promise.resolve(
          inOrg(args.where) && args.where.status.in.includes(selection.status as string)
            ? [{ ...selection, holiday }]
            : [],
        ),
      ),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...selection })),
      update: jest.fn((args: { data: Row }) => {
        Object.assign(selection, args.data);
        return Promise.resolve({ ...selection });
      }),
    },
    attendanceRecord: {
      findFirst: jest.fn((args: { where: { id: string; organizationId: string } }) =>
        Promise.resolve(args.where.id === RECORD && inOrg(args.where) ? fullRecord() : null),
      ),
      findMany: jest.fn((args: { where: { organizationId: string } }) =>
        Promise.resolve(inOrg(args.where) ? [fullRecord()] : []),
      ),
      findUniqueOrThrow: jest.fn(() => Promise.resolve({ ...record })),
      update: jest.fn((args: { data: Row }) => {
        const data = { ...args.data };
        delete data.version;
        Object.assign(record, data);
        return Promise.resolve({ ...record });
      }),
    },
    attendanceHolidayReview: {
      create: jest.fn((args: { data: Row }) => {
        if (reviews.some((r) => r.attendanceRecordId === RECORD && r.status === 'PENDING'))
          return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        const review: Row = {
          status: 'PENDING',
          outcome: null,
          decisionComment: null,
          decidedAt: null,
          decidedByUserId: null,
          createdAt: new Date(Date.now() + reviews.length),
          ...args.data,
          id: `review-${reviews.length + 1}`,
        };
        reviews.unshift(review);
        return Promise.resolve({ ...review });
      }),
      findMany: jest.fn((args: { where: { organizationId: string; status?: string } }) =>
        Promise.resolve(
          inOrg(args.where)
            ? reviews
                .filter((r) => !args.where.status || r.status === args.where.status)
                .map(fullReview)
            : [],
        ),
      ),
      findFirst: jest.fn((args: { where: { id: string; organizationId: string } }) => {
        const review = reviews.find((r) => r.id === args.where.id);
        return Promise.resolve(review && inOrg(args.where) ? fullReview(review) : null);
      }),
      update: jest.fn((args: { where: { id: string }; data: Row }) => {
        const review = reviews.find((r) => r.id === args.where.id)!;
        Object.assign(review, args.data);
        return Promise.resolve({ ...review });
      }),
    },
    payrollRun: {
      updateMany: jest.fn(() => {
        const touched = runs.filter((r) => r.status === 'CALCULATED' && !r.calculationStaleAt);
        touched.forEach((run) => Object.assign(run, { calculationStaleAt: new Date() }));
        return Promise.resolve({ count: touched.length });
      }),
      findMany: jest.fn((args: { where: { status: { in: string[] } } }) =>
        Promise.resolve(
          runs
            .filter((r) => args.where.status.in.includes(r.status))
            .map(({ id, status }) => ({ id, status })),
        ),
      ),
    },
  };
  // Row locks, as far as the specs need them: the first `FOR UPDATE` on a review holds until that
  // transaction ends, so a second decision waits and then reads what the first one wrote.
  let reviewLockHeld: Promise<void> = Promise.resolve();
  const database = {
    run: jest.fn(async (_ctx: unknown, cb: (client: unknown) => unknown) => {
      let release = () => {};
      let acquired = false;
      const runTx = {
        ...tx,
        $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
          await tx.$queryRaw(strings);
          if (!acquired && locks.at(-1) === 'attendance_holiday_reviews') {
            acquired = true;
            const previous = reviewLockHeld;
            reviewLockHeld = new Promise((resolve) => (release = resolve));
            await previous;
          }
          return [];
        }),
      };
      try {
        return await cb(runTx);
      } finally {
        release();
      }
    }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const service = new AttendanceHolidayReviewService(database as never, audit, outbox as never);
  const auditActions = () =>
    audit.record.mock.calls.map(
      (call) => (call as unknown as [unknown, { action: string }])[1].action,
    );
  return { service, tx, record, selection, reviews, runs, locks, audit, outbox, auditActions };
}
