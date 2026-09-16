import { EmployeeDetailService } from './employee-detail.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * The directory projection.
 *
 * It exists so the Organization workspace can show departments and a reporting tree without a
 * request per employee. Two properties matter and are asserted here: it stays two queries no
 * matter how many people it returns, and it is bounded by the same self-scoping as every other
 * employee read.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const A = '55555555-5555-4555-8555-555555555555';
const B = '66666666-6666-4666-8666-666666666666';

function context(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function employee(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    employeeNumber: id === A ? 'EMP-001' : 'EMP-002',
    firstName: id === A ? 'Asha' : 'Bala',
    middleName: null,
    lastName: id === A ? 'Rao' : 'Subramanian',
    preferredName: null,
    workEmail: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    dateOfJoining: new Date('2026-08-03T00:00:00.000Z'),
    primaryBranchId: null,
    managerEmployeeId: null,
    userId: null,
    ...overrides,
  };
}

function setup(
  options: {
    rows?: Array<ReturnType<typeof employee>>;
    records?: Array<{ employeeId: string; jobTitle: string | null; department: string | null }>;
    self?: string | null;
  } = {},
) {
  const rows = options.rows ?? [employee(A), employee(B, { managerEmployeeId: A })];
  const tx = {
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.self === undefined ? { id: A } : options.self ? { id: options.self } : null,
        ),
      findMany: jest.fn((args: { where?: Record<string, unknown>; take?: number }) => {
        void args;
        return Promise.resolve(rows);
      }),
    },
    employeeEmploymentRecord: {
      findMany: jest.fn(() => Promise.resolve(options.records ?? [])),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new EmployeeDetailService(database as never) };
}

describe('employee directory projection', () => {
  it('returns the reporting line and department the shared DTO omits', async () => {
    const { service } = setup({
      records: [{ employeeId: B, jobTitle: 'Engineer', department: 'Product' }],
    });
    const { items } = await service.directory(context(['*']));

    const bala = items.find((entry) => entry.id === B);
    expect(bala?.managerEmployeeId).toBe(A);
    expect(bala?.jobTitle).toBe('Engineer');
    expect(bala?.department).toBe('Product');
  });

  it('resolves employment records in one query for the whole page, not one each', async () => {
    // This is the entire reason the route exists: the alternative was a detail request per
    // employee, which grows with the tenant.
    const { tx, service } = setup();
    await service.directory(context(['*']));

    expect(tx.employeeEmploymentRecord.findMany).toHaveBeenCalledTimes(1);
    expect(tx.employee.findMany).toHaveBeenCalledTimes(1);
  });

  it('reports a missing employment record as unknown rather than blank', async () => {
    const { service } = setup({ records: [] });
    const { items } = await service.directory(context(['*']));

    expect(items[0]?.jobTitle).toBeNull();
    expect(items[0]?.department).toBeNull();
  });

  it('sends the joining date as a plain date, not a timestamp', async () => {
    // A `@db.Date` has no meaningful time, and shipping one invites an off-by-one across zones.
    const { service } = setup();
    const { items } = await service.directory(context(['*']));

    expect(items[0]?.dateOfJoining).toBe('2026-08-03');
  });

  it('never exposes the user id, only whether a login exists', async () => {
    const { service } = setup({ rows: [employee(A, { userId: CALLER_USER })] });
    const { items } = await service.directory(context(['*']));

    expect(items[0]?.hasUserAccount).toBe(true);
    expect(items[0]).not.toHaveProperty('userId');
  });

  it('narrows to the caller with only the plain permission', async () => {
    const { tx, service } = setup({ self: A });
    await service.directory(context(['employees.read']));

    const where = tx.employee.findMany.mock.calls[0]?.[0]?.where;
    expect(where?.id).toBe(A);
    expect(where?.organizationId).toBe(ORG);
  });

  it('returns nothing when a self-scoped caller has no employee record', async () => {
    const { tx, service } = setup({ self: null });
    const result = await service.directory(context(['employees.read']));

    expect(result.items).toEqual([]);
    expect(tx.employee.findMany).not.toHaveBeenCalled();
  });

  it('caps the page and clamps a caller-supplied limit', async () => {
    const { tx, service } = setup();
    await service.directory(context(['*']), { limit: 100_000 });

    expect(tx.employee.findMany.mock.calls[0]?.[0]?.take).toBe(201);
  });

  it('refuses without the permission', async () => {
    const { service } = setup();
    await expect(service.directory(context([]))).rejects.toThrow(
      'Missing permission: employees.read',
    );
  });
});
