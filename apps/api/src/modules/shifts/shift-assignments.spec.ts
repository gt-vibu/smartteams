import { assignmentState, ShiftAssignmentsService } from './shift-assignments.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Reading and ending shift assignments: Home's Work Schedule card, and the Shifts screen's list of
 * who is on each shift with an "End assignment" action.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SELF = '22222222-2222-4222-8222-222222222222';
const COLLEAGUE = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444';

function context(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: 'user-1' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}
const admin = context(['shifts.read', 'shifts.write', 'employees.read.all']);

const shift = {
  id: 'shift-1',
  organizationId: ORG,
  branchId: null,
  code: 'GEN',
  name: 'General',
  daysOfWeek: [1, 2, 3, 4, 5],
  startsAt: new Date(Date.UTC(1970, 0, 1, 9, 30)),
  endsAt: new Date(Date.UTC(1970, 0, 1, 18, 30)),
  crossesMidnight: false,
  breakMinutes: 60,
  isActive: true,
  breakRules: [],
};

function setup(assignment: { startsOn: Date; endsOn: Date | null } | null = null) {
  const row = assignment && { id: ASSIGNMENT, employeeId: SELF, shift, ...assignment };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }) },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: SELF }) },
    employeeShiftAssignment: {
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue(row ? [row] : []),
      update: jest.fn((args: { data: { endsOn: Date } }) =>
        Promise.resolve({ ...row, ...args.data }),
      ),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { tx, audit, service: new ShiftAssignmentsService(database as never, audit) };
}

describe('current shift assignment', () => {
  it("returns the caller's own shift for the day, in the shift's own times", async () => {
    const { tx, service } = setup({ startsOn: new Date('2026-09-01'), endsOn: null });
    const result = await service.current(context(['shifts.read']), { on: '2026-09-15' });
    expect(result.assignment).toMatchObject({
      employeeId: SELF,
      startsOn: '2026-09-01',
      endsOn: null,
      shift: { name: 'General', startsAt: '09:30:00', endsAt: '18:30:00' },
    });
    expect(tx.employeeShiftAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: SELF,
          startsOn: { lte: new Date('2026-09-15T00:00:00.000Z') },
        }) as unknown,
      }),
    );
  });

  it('says there is none rather than inventing one', async () => {
    const { service } = setup(null);
    await expect(service.current(context(['shifts.read']), {})).resolves.toEqual({
      assignment: null,
    });
  });

  it("refuses a colleague's shift without the broader read permission", async () => {
    const { tx, service } = setup(null);
    await expect(
      service.current(context(['shifts.read']), { employeeId: COLLEAGUE }),
    ).rejects.toThrow('Employees may only read their own record');
    expect(tx.employeeShiftAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('requires shifts.read', async () => {
    const { service } = setup(null);
    await expect(service.current(context([]), {})).rejects.toThrow('Missing permission');
  });
});

describe('listing assignments', () => {
  it('lists who is on a shift, current and upcoming by default', async () => {
    const { tx, service } = setup({ startsOn: new Date('2026-09-01'), endsOn: null });
    const result = await service.list(admin, { shiftId: 'shift-1' });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    const where = (tx.employeeShiftAssignment.findMany.mock.calls[0] as [{ where: object }])[0]
      .where;
    expect(where).toMatchObject({ organizationId: ORG, shiftId: 'shift-1' });
    expect(where).toHaveProperty('OR');
  });

  it('includes ended assignments only when asked', async () => {
    const { tx, service } = setup(null);
    await service.list(admin, { includeEnded: true });
    const where = (tx.employeeShiftAssignment.findMany.mock.calls[0] as [{ where: object }])[0]
      .where;
    expect(where).not.toHaveProperty('OR');
  });

  it('narrows a self-service caller to their own, and refuses naming a colleague', async () => {
    const { tx, service } = setup(null);
    await service.list(context(['shifts.read']), {});
    const where = (tx.employeeShiftAssignment.findMany.mock.calls[0] as [{ where: object }])[0]
      .where;
    expect(where).toMatchObject({ employeeId: SELF });
    await expect(service.list(context(['shifts.read']), { employeeId: COLLEAGUE })).rejects.toThrow(
      'Employees may only read their own record',
    );
  });
});

describe('ending an assignment', () => {
  const end = { endsOn: '2026-09-20', reason: 'Moving to the night shift' };

  it('sets the last day on the shift, audited with the reason', async () => {
    const { tx, audit, service } = setup({ startsOn: new Date('2026-09-01'), endsOn: null });
    const result = await service.end(admin, ASSIGNMENT, end);
    expect(result.endsOn).toBe('2026-09-20');
    expect(tx.employeeShiftAssignment.update).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT },
      data: { endsOn: new Date('2026-09-20T00:00:00.000Z') },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SHIFT_ASSIGNMENT_ENDED',
        reason: end.reason,
      }),
      tx,
    );
    // Locked before it is read, so two administrators cannot both end it.
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('refuses a last day before the assignment starts', async () => {
    const { tx, service } = setup({ startsOn: new Date('2026-09-25'), endsOn: null });
    await expect(service.end(admin, ASSIGNMENT, end)).rejects.toThrow('before the assignment');
    expect(tx.employeeShiftAssignment.update).not.toHaveBeenCalled();
  });

  it('only ever brings the end forward', async () => {
    const { tx, service } = setup({
      startsOn: new Date('2026-09-01'),
      endsOn: new Date('2026-09-10'),
    });
    await expect(service.end(admin, ASSIGNMENT, end)).rejects.toThrow('can only be ended earlier');
    expect(tx.employeeShiftAssignment.update).not.toHaveBeenCalled();
  });

  it('is not found in another tenant, and needs shifts.write and a reason', async () => {
    const missing = setup(null);
    await expect(missing.service.end(admin, ASSIGNMENT, end)).rejects.toThrow('Shift assignment');
    const { service } = setup({ startsOn: new Date('2026-09-01'), endsOn: null });
    await expect(service.end(context(['shifts.read']), ASSIGNMENT, end)).rejects.toThrow(
      'Missing permission: shifts.write',
    );
    await expect(service.end(admin, ASSIGNMENT, { ...end, reason: ' ' })).rejects.toThrow(
      'requires a reason',
    );
  });
});

describe('assignmentState', () => {
  const on = (startsOn: string, endsOn: string | null) => ({
    startsOn: new Date(startsOn),
    endsOn: endsOn ? new Date(endsOn) : null,
  });
  it('is current through its last day, upcoming before it starts, ended after', () => {
    expect(assignmentState(on('2026-09-01', null), '2026-09-15')).toBe('CURRENT');
    expect(assignmentState(on('2026-09-01', '2026-09-15'), '2026-09-15')).toBe('CURRENT');
    expect(assignmentState(on('2026-09-20', null), '2026-09-15')).toBe('UPCOMING');
    expect(assignmentState(on('2026-09-01', '2026-09-14'), '2026-09-15')).toBe('ENDED');
  });
});
