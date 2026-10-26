import { ApprovalRemindersService } from './approval-reminders.service';

const DAY = 86_400_000;
const now = new Date('2026-09-24T10:00:00Z');

type Pending = { recipientUserId: string; entityId: string; ageDays: number };

function setup(options: {
  pending: Pending[];
  reminderDays?: number;
  escalationDays?: number;
  decided?: boolean;
  remindedToday?: boolean;
  escalatedBefore?: boolean;
}) {
  const created: Array<{ kind: string; recipientUserId: string }> = [];
  const rows = options.pending.map((row) => ({
    recipientUserId: row.recipientUserId,
    kind: 'LEAVE_PENDING',
    title: 'Leave request',
    body: 'Ada asked for 2 Oct 2026.',
    entityType: 'LEAVE_REQUEST',
    entityId: row.entityId,
    createdAt: new Date(now.getTime() - row.ageDays * DAY),
  }));
  const tx = {
    organizationSettings: {
      findUnique: jest.fn().mockResolvedValue({
        approvalReminderDays: options.reminderDays ?? 2,
        approvalEscalationDays: options.escalationDays ?? 5,
      }),
    },
    notification: {
      findMany: jest
        .fn()
        // The waiting batches, then "anything newer" (nothing).
        .mockResolvedValueOnce(rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()))
        .mockResolvedValueOnce([]),
      findFirst: jest.fn(({ where }: { where: { kind: string } }) =>
        Promise.resolve(
          (where.kind === 'APPROVAL_REMINDER' && options.remindedToday) ||
            (where.kind === 'APPROVAL_ESCALATED' && options.escalatedBefore)
            ? { id: 'x' }
            : null,
        ),
      ),
      createMany: jest.fn(
        ({ data }: { data: Array<{ kind: string; recipientUserId: string }> }) => {
          created.push(...data.map(({ kind, recipientUserId }) => ({ kind, recipientUserId })));
          return Promise.resolve({ count: data.length });
        },
      ),
    },
    leaveRequest: {
      findFirst: jest.fn().mockResolvedValue(options.decided ? null : { id: 'leave' }),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([{ userId: 'admin' }, { userId: 'boss' }]) },
  };
  const database = {
    runSystem: jest.fn().mockResolvedValue([{ id: 'org' }]),
    run: jest.fn((_context: unknown, callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { service: new ApprovalRemindersService(database as never), created };
}

describe('following up undecided requests', () => {
  it('reminds the people it waits on after the reminder delay', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 3 }],
    });
    await service.sweep(now);
    expect(created).toEqual([{ kind: 'APPROVAL_REMINDER', recipientUserId: 'boss' }]);
  });
  it('does not remind twice in a day', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 3 }],
      remindedToday: true,
    });
    await service.sweep(now);
    expect(created).toEqual([]);
  });
  it('leaves a request that has been decided', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 9 }],
      decided: true,
    });
    await service.sweep(now);
    expect(created).toEqual([]);
  });
  it('tells administrators once after the escalation delay, not the approver again', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 6 }],
    });
    await service.sweep(now);
    expect(created).toContainEqual({ kind: 'APPROVAL_ESCALATED', recipientUserId: 'admin' });
    expect(created).not.toContainEqual({ kind: 'APPROVAL_ESCALATED', recipientUserId: 'boss' });
  });
  it('does not escalate the same request twice', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 6 }],
      escalatedBefore: true,
    });
    await service.sweep(now);
    expect(created.filter((row) => row.kind === 'APPROVAL_ESCALATED')).toEqual([]);
  });
  it('does nothing when the organization turned both off', async () => {
    const { service, created } = setup({
      pending: [{ recipientUserId: 'boss', entityId: 'l1', ageDays: 9 }],
      reminderDays: 0,
      escalationDays: 0,
    });
    await service.sweep(now);
    expect(created).toEqual([]);
  });
});
