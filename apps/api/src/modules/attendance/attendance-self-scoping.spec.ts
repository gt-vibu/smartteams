import { AttendanceService } from './attendance.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_A = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE_B = '66666666-6666-4666-8666-666666666666';

function context(permissions: string[], overrides: Partial<DomainContext> = {}): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    ...overrides,
  };
}

function setup(self: { id: string } | null = { id: EMPLOYEE_A }) {
  const tx = {
    employee: { findFirst: jest.fn().mockResolvedValue(self) },
    attendanceRecord: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const stub: unknown = { record: jest.fn(), publish: jest.fn() };
  return {
    tx,
    service: new AttendanceService(database as never, stub as never, stub as never, stub as never),
  };
}

type ListCall = [{ where: { employeeId?: string; organizationId: string } }];

function firstWhere(calls: unknown) {
  const call = (calls as unknown[])[0] as ListCall | undefined;
  if (!call) throw new Error('Expected the list query to have been issued');
  return call[0].where;
}

const recordFilter = (tx: ReturnType<typeof setup>['tx']) =>
  firstWhere(tx.attendanceRecord.findMany.mock.calls);

describe('AttendanceService.list self-scoping', () => {
  it('allows an employee to read their own attendance by id', async () => {
    const { tx, service } = setup();
    await service.list(context(['attendance.read']), { employeeId: EMPLOYEE_A });
    expect(recordFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('rejects reading another employee', async () => {
    const { tx, service } = setup();
    await expect(
      service.list(context(['attendance.read']), { employeeId: EMPLOYEE_B }),
    ).rejects.toThrow('Employees may only read their own attendance records');
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it('narrows an unfiltered read to the caller', async () => {
    const { tx, service } = setup();
    await service.list(context(['attendance.read']), {});
    expect(recordFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('lets read.all read another employee', async () => {
    const { tx, service } = setup();
    await service.list(context(['attendance.read', 'attendance.read.all']), {
      employeeId: EMPLOYEE_B,
    });
    expect(recordFilter(tx).employeeId).toBe(EMPLOYEE_B);
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup();
    await service.list(context(['*']), {});
    expect(recordFilter(tx).employeeId).toBeUndefined();
  });

  it('keeps the federation read breadth its grant already carries', async () => {
    const { tx, service } = setup();
    await service.list(
      context(['attendance.read'], {
        accessMode: 'FEDERATION' as AccessMode,
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      { employeeId: EMPLOYEE_B },
    );
    expect(recordFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('scopes every read to the caller organization', async () => {
    const { tx, service } = setup();
    await service.list(
      context(['attendance.read', 'attendance.read.all'], {
        organizationId: OTHER_ORG,
      }),
      { employeeId: EMPLOYEE_B },
    );
    expect(recordFilter(tx)).toMatchObject({ organizationId: OTHER_ORG });
  });

  it('returns nothing when the caller has no employee record', async () => {
    const { tx, service } = setup(null);
    await expect(service.list(context(['attendance.read']), {})).resolves.toEqual({
      records: [],
      nextCursor: undefined,
    });
    expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
