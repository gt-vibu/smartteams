import { LeaveService } from './leave.service';
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

/**
 * `employee.findFirst` here stands in for "which employee is the authenticated caller" — the
 * tenant-scoped lookup the service must use instead of trusting a client-supplied employeeId.
 */
function setup(self: { id: string } | null = { id: EMPLOYEE_A }) {
  const tx = {
    employee: {
      // Balance provisioning re-reads the employee for its branches; the extra fields keep that
      // path working without changing what the self-scoping tests assert.
      findFirst: jest
        .fn()
        .mockResolvedValue(self ? { ...self, primaryBranchId: null, branchAssignments: [] } : null),
    },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    leaveBalance: { findMany: jest.fn().mockResolvedValue([]) },
    leavePolicyAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    organizationSettings: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ leaveYearStartMonth: 1 }),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const stub: unknown = { record: jest.fn(), publish: jest.fn() };
  return { tx, service: new LeaveService(database as never, stub as never, stub as never) };
}

type ListCall = [{ where: { employeeId?: string; organizationId: string } }];

function firstWhere(calls: unknown) {
  const call = (calls as unknown[])[0] as ListCall | undefined;
  if (!call) throw new Error('Expected the list query to have been issued');
  return call[0].where;
}

const requestFilter = (tx: ReturnType<typeof setup>['tx']) =>
  firstWhere(tx.leaveRequest.findMany.mock.calls);
const balanceFilter = (tx: ReturnType<typeof setup>['tx']) =>
  firstWhere(tx.leaveBalance.findMany.mock.calls);

describe('LeaveService.listRequests self-scoping', () => {
  it('allows an employee to read their own requests by id', async () => {
    const { tx, service } = setup();
    await service.listRequests(context(['leave.requests.read']), EMPLOYEE_A);
    expect(requestFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('rejects reading another employee', async () => {
    const { tx, service } = setup();
    await expect(
      service.listRequests(context(['leave.requests.read']), EMPLOYEE_B),
    ).rejects.toThrow('Employees may only read their own leave requests');
    expect(tx.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it('narrows an unfiltered read to the caller', async () => {
    const { tx, service } = setup();
    await service.listRequests(context(['leave.requests.read']));
    expect(requestFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('lets read.all read another employee', async () => {
    const { tx, service } = setup();
    await service.listRequests(
      context(['leave.requests.read', 'leave.requests.read.all']),
      EMPLOYEE_B,
    );
    expect(requestFilter(tx).employeeId).toBe(EMPLOYEE_B);
    expect(tx.employee.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup();
    await service.listRequests(context(['*']));
    expect(requestFilter(tx).employeeId).toBeUndefined();
  });

  it('keeps the federation read breadth its grant already carries', async () => {
    const { tx, service } = setup();
    await service.listRequests(
      context(['leave.requests.read'], {
        accessMode: 'FEDERATION' as AccessMode,
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      EMPLOYEE_B,
    );
    expect(requestFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('scopes every read to the caller organization', async () => {
    const { tx, service } = setup();
    await service.listRequests(
      context(['leave.requests.read', 'leave.requests.read.all'], { organizationId: OTHER_ORG }),
      EMPLOYEE_B,
    );
    expect(requestFilter(tx)).toMatchObject({ organizationId: OTHER_ORG });
  });

  it('returns nothing when the caller has no employee record', async () => {
    const { tx, service } = setup(null);
    await expect(service.listRequests(context(['leave.requests.read']))).resolves.toEqual({
      requests: [],
      nextCursor: undefined,
    });
    expect(tx.leaveRequest.findMany).not.toHaveBeenCalled();
  });
});

describe('LeaveService.listBalances self-scoping', () => {
  it('allows an employee to read their own balances by id', async () => {
    const { tx, service } = setup();
    await service.listBalances(context(['leave.balances.read']), EMPLOYEE_A);
    expect(balanceFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('rejects reading another employee', async () => {
    const { tx, service } = setup();
    await expect(
      service.listBalances(context(['leave.balances.read']), EMPLOYEE_B),
    ).rejects.toThrow('Employees may only read their own leave balances');
    expect(tx.leaveBalance.findMany).not.toHaveBeenCalled();
  });

  it('narrows an unfiltered read to the caller', async () => {
    const { tx, service } = setup();
    await service.listBalances(context(['leave.balances.read']));
    expect(balanceFilter(tx).employeeId).toBe(EMPLOYEE_A);
  });

  it('lets read.all read another employee', async () => {
    const { tx, service } = setup();
    await service.listBalances(
      context(['leave.balances.read', 'leave.balances.read.all']),
      EMPLOYEE_B,
    );
    expect(balanceFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('leaves the wildcard admin unrestricted', async () => {
    const { tx, service } = setup();
    await service.listBalances(context(['*']));
    expect(balanceFilter(tx).employeeId).toBeUndefined();
  });

  it('keeps the federation read breadth its grant already carries', async () => {
    const { tx, service } = setup();
    await service.listBalances(
      context(['leave.balances.read'], {
        accessMode: 'FEDERATION' as AccessMode,
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      EMPLOYEE_B,
    );
    expect(balanceFilter(tx).employeeId).toBe(EMPLOYEE_B);
  });

  it('scopes every read to the caller organization', async () => {
    const { tx, service } = setup();
    await service.listBalances(context(['*'], { organizationId: OTHER_ORG }));
    expect(balanceFilter(tx)).toMatchObject({ organizationId: OTHER_ORG });
  });
});
