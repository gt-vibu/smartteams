import { EmployeesService } from './employees.service';
import { EmployeeRecordsService } from './employee-records.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * The employee read boundary.
 *
 * These exist because seeding a least-privilege EMPLOYEE role made a latent defect reachable:
 * `employees.read` was in that role, and the employee services read it as "read everyone" while
 * every other module read it as "read your own". An ordinary employee could pull the whole
 * directory — `personalEmail` and `phone` included — from `GET /organizations/:id/employees`.
 *
 * The assertions are on the response shape, not just on whether a call throws, because the
 * failure mode was a successful response carrying too much.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
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

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: ORG,
    employeeNumber: id === EMPLOYEE_A ? 'EMP-001' : 'EMP-002',
    firstName: id === EMPLOYEE_A ? 'Asha' : 'Bala',
    middleName: null,
    lastName: id === EMPLOYEE_A ? 'Rao' : 'Subramanian',
    preferredName: null,
    workEmail: `${id.slice(0, 4)}@example.test`,
    personalEmail: `${id.slice(0, 4)}.personal@example.test`,
    phone: '+91 90000 00000',
    identitySource: 'NATIVE',
    externalId: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    primaryBranchId: null,
    userId: id === EMPLOYEE_A ? CALLER_USER : null,
    version: 1,
    fieldOwnership: [],
    branchAssignments: [],
    ...overrides,
  };
}

/**
 * `findFirst` is used for three different lookups (the directory's self lookup, the single-record
 * read, and the self lookup behind the boundary check), so the double is driven by the shape of
 * the `where` clause rather than by call order.
 */
function database(options: { rows?: Array<ReturnType<typeof row>>; self?: string | null } = {}) {
  const rows = options.rows ?? [row(EMPLOYEE_A), row(EMPLOYEE_B)];
  const selfId = options.self === undefined ? EMPLOYEE_A : options.self;

  const findFirst = jest.fn(({ where }: { where: Record<string, unknown> }) => {
    if ('userId' in where) return Promise.resolve(selfId ? { id: selfId } : null);
    const match = rows.find(
      (entry) => entry.id === where.id && entry.organizationId === where.organizationId,
    );
    return Promise.resolve(match ?? null);
  });

  const tx = {
    employee: {
      findFirst,
      // Typed so the assertions below can read `take` and `orderBy` off `mock.calls`.
      findMany: jest.fn((args: { take?: number; orderBy?: Array<Record<string, string>> }) => {
        void args;
        return Promise.resolve(rows);
      }),
    },
    employeeEmergencyContact: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'contact', name: 'Next of kin' }])),
    },
    employeeEmploymentRecord: {
      findMany: jest.fn(() => Promise.resolve([{ id: 'record', jobTitle: 'Engineer' }])),
    },
  };

  return {
    tx,
    database: {
      run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
    },
  };
}

function employees(options?: Parameters<typeof database>[0]) {
  const { tx, database: db } = database(options);
  const audit = { record: jest.fn() };
  const records = new EmployeeRecordsService(db as never, audit);
  return {
    tx,
    service: new EmployeesService(
      db as never,
      audit,
      { publish: jest.fn() } as never,
      { revokeAllForUser: jest.fn() } as never,
      records,
    ),
    records,
  };
}

describe('employee directory self-scoping', () => {
  it('returns only the caller to a holder of plain employees.read', async () => {
    const { service } = employees();
    const { items } = await service.list(context(['employees.read']));

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(EMPLOYEE_A);
  });

  it('does not leak another employee, including personal email and phone', async () => {
    const { service } = employees();
    const { items } = await service.list(context(['employees.read']));

    const serialised = JSON.stringify(items);
    expect(serialised).not.toContain(EMPLOYEE_B);
    expect(serialised).not.toContain('6666.personal@example.test');
    expect(items.every((entry) => entry.id === EMPLOYEE_A)).toBe(true);
  });

  it('never runs the tenant-wide query for a self-scoped caller', async () => {
    // The strongest form of this assertion: the unbounded read must not happen at all, so a
    // future change to the projection cannot quietly reintroduce the exposure.
    const { tx, service } = employees();
    await service.list(context(['employees.read']));

    expect(tx.employee.findMany).not.toHaveBeenCalled();
  });

  it('returns the whole directory to employees.read.all', async () => {
    const { service } = employees();
    const { items } = await service.list(context(['employees.read', 'employees.read.all']));

    expect(items).toHaveLength(2);
    expect(items.map((entry) => entry.id).sort()).toEqual([EMPLOYEE_A, EMPLOYEE_B].sort());
  });

  it('returns the whole directory to the tenant wildcard', async () => {
    const { service } = employees();
    expect((await service.list(context(['*']))).items).toHaveLength(2);
  });

  it('keeps federation breadth, which has no own record to narrow to', async () => {
    const { service } = employees({ self: null });
    const federated = context([], {
      accessMode: 'FEDERATION',
      actor: { type: 'FEDERATION_CLIENT', clientId: 'blizbooks' },
      permissions: new Set(['employees.read']),
    });

    expect((await service.list(federated)).items).toHaveLength(2);
  });

  it('returns nothing when the caller has no employee record of their own', async () => {
    // Not "everyone" — an administrator without an employee row must not fall through to the
    // unscoped branch.
    const { service } = employees({ self: null });
    await expect(service.list(context(['employees.read']))).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
  });

  it('caps the page and reports a cursor rather than returning the tenant', async () => {
    // The directory was unbounded: every employee row loaded into memory and serialised in one
    // response, with the RLS transaction open throughout.
    const many = Array.from({ length: 250 }, (_, index) =>
      row(`${index}`.padStart(8, '0') + '-0000-4000-8000-000000000000'),
    );
    const { tx, service } = employees({ rows: many });
    const page = await service.list(context(['*']));

    expect(page.items).toHaveLength(200);
    expect(page.nextCursor).toBeDefined();
    expect(tx.employee.findMany.mock.calls[0]?.[0]?.take).toBe(201);
  });

  it('clamps a caller-supplied limit instead of trusting it', async () => {
    const { tx, service } = employees();
    await service.list(context(['*']), { limit: 100_000 });

    expect(tx.employee.findMany.mock.calls[0]?.[0]?.take).toBe(201);
  });

  it('orders by a unique tiebreaker so paging cannot skip or repeat a row', async () => {
    // (lastName, firstName) is not unique; two people sharing a name would make the cursor
    // ambiguous.
    const { tx, service } = employees();
    await service.list(context(['*']));

    expect(tx.employee.findMany.mock.calls[0]?.[0]?.orderBy?.at(-1)).toEqual({ id: 'asc' });
  });

  it('refuses the read without the permission at all', async () => {
    const { service } = employees();
    await expect(service.list(context([]))).rejects.toThrow('Missing permission: employees.read');
  });
});

describe('single employee read', () => {
  it('lets an employee read their own record', async () => {
    const { service } = employees();
    await expect(service.get(context(['employees.read']), EMPLOYEE_A)).resolves.toMatchObject({
      id: EMPLOYEE_A,
    });
  });

  it("refuses another employee's record", async () => {
    const { service } = employees();
    await expect(service.get(context(['employees.read']), EMPLOYEE_B)).rejects.toThrow(
      'only read their own record',
    );
  });

  it('reports an employee in another tenant as missing, not as refused', async () => {
    // Existence must not be inferable from the error: a foreign id and a nonexistent id look
    // the same.
    const { service } = employees({ rows: [row(EMPLOYEE_A)] });
    await expect(service.get(context(['*']), EMPLOYEE_B)).rejects.toThrow('Employee');
  });

  it('scopes every lookup to the calling organization', async () => {
    const { tx, service } = employees();
    await service.get(context(['*']), EMPLOYEE_A);

    for (const [call] of tx.employee.findFirst.mock.calls as Array<
      [{ where: { organizationId?: string } }]
    >) {
      expect(call.where.organizationId).toBe(ORG);
    }
  });

  it('cannot be bypassed by passing an id from another organization', async () => {
    const { service } = employees({ rows: [row(EMPLOYEE_B, { organizationId: OTHER_ORG })] });
    await expect(service.get(context(['employees.read']), EMPLOYEE_B)).rejects.toThrow('Employee');
  });
});

describe('employment history and emergency contacts', () => {
  it('lets an employee read their own employment history', async () => {
    const { records } = employees();
    await expect(
      records.listEmploymentRecords(context(['employees.read']), EMPLOYEE_A),
    ).resolves.toHaveLength(1);
  });

  it("refuses another employee's employment history", async () => {
    const { records } = employees();
    await expect(
      records.listEmploymentRecords(context(['employees.read']), EMPLOYEE_B),
    ).rejects.toThrow('only read their own record');
  });

  it("refuses another employee's emergency contacts", async () => {
    const { records } = employees();
    await expect(
      records.listEmergencyContacts(context(['employees.read']), EMPLOYEE_B),
    ).rejects.toThrow('only read their own record');
  });

  it('allows both to an administrator', async () => {
    const { records } = employees();
    await expect(records.listEmergencyContacts(context(['*']), EMPLOYEE_B)).resolves.toHaveLength(
      1,
    );
    await expect(
      records.listEmploymentRecords(context(['employees.read', 'employees.read.all']), EMPLOYEE_B),
    ).resolves.toHaveLength(1);
  });

  it('still requires the base permission — `.all` widens a read, it does not grant one', async () => {
    const { records } = employees();
    await expect(
      records.listEmploymentRecords(context(['employees.read.all']), EMPLOYEE_B),
    ).rejects.toThrow('Missing permission: employees.read');
  });
});
