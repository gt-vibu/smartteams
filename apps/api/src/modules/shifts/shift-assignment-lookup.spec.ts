import { ShiftAssignmentLookupService } from './shift-assignment-lookup.service';
import type { DomainContext } from '../../common/context/domain-context';

/** Reading the shift an employee is assigned to, for Home's Work Schedule card. */

const ORG = '11111111-1111-4111-8111-111111111111';
const SELF = '22222222-2222-4222-8222-222222222222';
const COLLEAGUE = '33333333-3333-4333-8333-333333333333';

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

function setup(assignment: object | null = null) {
  const tx = {
    employee: { findFirst: jest.fn().mockResolvedValue({ id: SELF }) },
    employeeShiftAssignment: { findFirst: jest.fn().mockResolvedValue(assignment) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new ShiftAssignmentLookupService(database as never) };
}

describe('current shift assignment', () => {
  it("returns the caller's own shift for the day, in the shift's own times", async () => {
    const { tx, service } = setup({
      id: 'a-1',
      employeeId: SELF,
      startsOn: new Date('2026-09-01'),
      endsOn: null,
      shift,
    });
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
          organizationId: ORG,
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

  it('lets an administrator read any employee', async () => {
    const { tx, service } = setup(null);
    await service.current(context(['shifts.read', 'employees.read.all']), {
      employeeId: COLLEAGUE,
    });
    expect(tx.employeeShiftAssignment.findFirst).toHaveBeenCalled();
  });

  it('requires shifts.read', async () => {
    const { service } = setup(null);
    await expect(service.current(context([]), {})).rejects.toThrow('Missing permission');
  });
});
