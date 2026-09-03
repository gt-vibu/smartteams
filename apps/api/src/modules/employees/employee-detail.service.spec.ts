import { EmployeeDetailService } from './employee-detail.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_A = '55555555-5555-4555-8555-555555555555';
const EMPLOYEE_B = '66666666-6666-4666-8666-666666666666';
const MANAGER = '77777777-7777-4777-8777-777777777777';

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

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_A,
    employeeNumber: 'EMP-001',
    firstName: 'Asha',
    middleName: null,
    lastName: 'Rao',
    preferredName: null,
    workEmail: 'asha@example.test',
    phone: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    dateOfJoining: new Date('2024-03-15T00:00:00.000Z'),
    dateOfLeaving: null,
    primaryBranchId: null,
    managerEmployeeId: null,
    userId: CALLER_USER,
    version: 1,
    ...overrides,
  };
}

function setup(
  options: {
    row?: Record<string, unknown> | null;
    self?: { id: string } | null;
    manager?: Record<string, unknown> | null;
    reports?: Array<Record<string, unknown>>;
    employment?: Record<string, unknown> | null;
  } = {},
) {
  const row = options.row === undefined ? employee() : options.row;
  const findFirst = jest
    .fn()
    // detail lookup, then the self lookup, then the manager lookup
    .mockResolvedValueOnce(row)
    .mockResolvedValue(options.self === undefined ? { id: EMPLOYEE_A } : options.self);
  const tx = {
    employee: {
      findFirst,
      findMany: jest.fn().mockResolvedValue(options.reports ?? []),
    },
    employeeEmploymentRecord: {
      findFirst: jest.fn().mockResolvedValue(options.employment ?? null),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new EmployeeDetailService(database as never) };
}

describe('EmployeeDetailService', () => {
  it('returns the joining date the create route accepted but no read exposed', async () => {
    const { service } = setup();
    const detail = await service.detail(
      context(['employees.read', 'employees.read.all']),
      EMPLOYEE_A,
    );

    expect(detail.dateOfJoining).toEqual(new Date('2024-03-15T00:00:00.000Z'));
  });

  it('returns the job title and department from the current employment record', async () => {
    // Both live on the employment record, not the employee, so this is the only place to read
    // them without a per-employee round trip.
    const { service } = setup({ employment: { jobTitle: 'Engineer', department: 'Product' } });
    const detail = await service.detail(context(['*']), EMPLOYEE_A);

    expect(detail.jobTitle).toBe('Engineer');
    expect(detail.department).toBe('Product');
  });

  it('reports a missing employment record as unknown rather than blank strings', async () => {
    const { service } = setup({ employment: null });
    const detail = await service.detail(context(['*']), EMPLOYEE_A);

    expect(detail.jobTitle).toBeNull();
    expect(detail.department).toBeNull();
  });

  it('derives direct reports from the manager relation rather than a second table', async () => {
    const { tx, service } = setup({
      reports: [{ id: EMPLOYEE_B, employeeNumber: 'EMP-002', firstName: 'Bala', lastName: 'S' }],
    });
    const detail = await service.detail(context(['*']), EMPLOYEE_A);

    expect(detail.directReports).toHaveLength(1);
    const [call] = tx.employee.findMany.mock.calls as [
      { where: { managerEmployeeId: string; organizationId: string } },
    ][];
    expect(call?.[0].where.managerEmployeeId).toBe(EMPLOYEE_A);
    expect(call?.[0].where.organizationId).toBe(ORG);
  });

  it('returns no manager when none is assigned, without a lookup', async () => {
    const { service } = setup({ row: employee({ managerEmployeeId: null }) });
    const detail = await service.detail(context(['*']), EMPLOYEE_A);

    expect(detail.manager).toBeNull();
  });

  it('exposes whether a login is attached without leaking the user id', async () => {
    const { service } = setup({ row: employee({ userId: CALLER_USER }) });
    const detail = await service.detail(context(['*']), EMPLOYEE_A);

    expect(detail.hasUserAccount).toBe(true);
    expect(detail).not.toHaveProperty('userId');
  });

  it('lets an employee read their own record with the plain permission', async () => {
    const { service } = setup({ self: { id: EMPLOYEE_A } });
    await expect(service.detail(context(['employees.read']), EMPLOYEE_A)).resolves.toMatchObject({
      id: EMPLOYEE_A,
    });
  });

  it("refuses another employee's record without the broader permission", async () => {
    const { service } = setup({ row: employee({ id: EMPLOYEE_B }), self: { id: EMPLOYEE_A } });
    await expect(service.detail(context(['employees.read']), EMPLOYEE_B)).rejects.toThrow(
      'only read their own record',
    );
  });

  it('refuses when the caller has no employee record of their own', async () => {
    const { service } = setup({ self: null });
    await expect(service.detail(context(['employees.read']), EMPLOYEE_A)).rejects.toThrow(
      'only read their own record',
    );
  });

  it('scopes the lookup to the caller organization', async () => {
    const { tx, service } = setup();
    await service.detail(context(['*']), EMPLOYEE_A);

    const [call] = tx.employee.findFirst.mock.calls as [{ where: { organizationId: string } }][];
    expect(call?.[0].where.organizationId).toBe(ORG);
  });

  it('reports an employee from another tenant as missing', async () => {
    const { service } = setup({ row: null });
    await expect(service.detail(context(['*']), MANAGER)).rejects.toThrow('Employee');
  });
});
