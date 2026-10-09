import { EmployeeFederationSyncService } from './employee-federation-sync.service';
import type { DomainContext } from '../../common/context/domain-context';

const context: DomainContext = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  accessMode: 'FEDERATION',
  actor: { type: 'FEDERATION_CLIENT', clientId: 'client-1' },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  permissions: new Set(['employees.write']),
};

function setup() {
  let sequence = 0;
  const employees = new Map<string, Record<string, unknown>>();
  let lock = Promise.resolve();
  const database = {
    run: jest.fn(async (_context: DomainContext, work: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = {
        $queryRaw: jest.fn(async () => {
          const previousLock = lock;
          lock = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previousLock;
          return [{ id: context.organizationId }];
        }),
        organization: {
          update: jest.fn(() => Promise.resolve({ employeeNumberSequence: ++sequence })),
        },
        employee: {
          findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(
              [...employees.values()].find((employee) =>
                where.externalId
                  ? employee.externalId === where.externalId
                  : employee.employeeNumber === where.employeeNumber,
              ) ?? null,
            ),
          ),
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            const employee = { id: `id-${employees.size}`, version: 1, ...data };
            employees.set(String(employee.id), employee);
            return Promise.resolve(employee);
          }),
          update: jest.fn(
            ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
              const employee = { ...employees.get(where.id)!, ...data, version: 2 };
              employees.set(where.id, employee);
              return Promise.resolve(employee);
            },
          ),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'user-1' }),
        },
        userOrganization: { upsert: jest.fn().mockResolvedValue({}) },
        employeeFieldOwnership: { upsert: jest.fn().mockResolvedValue({}) },
      };
      try {
        return await work(tx);
      } finally {
        release?.();
      }
    }),
  };
  const service = new EmployeeFederationSyncService(
    database as never,
    { record: jest.fn() },
    { append: jest.fn() } as never,
    {} as never,
  );
  const create = (externalId: string, employeeNumberPrefix = 'EMP', employeeNumber?: string) =>
    service.syncFederated(context, externalId, 'client-1', {
      firstName: 'Ananya',
      lastName: 'Rao',
      employeeNumberPrefix,
      ...(employeeNumber ? { employeeNumber } : {}),
    });
  return { create, employees, sequence: () => sequence };
}

describe('federated employee numbering', () => {
  it('assigns distinct numbers when two employees are created concurrently', async () => {
    const { create } = setup();
    const result = await Promise.all([create('employee-1'), create('employee-2')]);
    expect(result.map((employee) => employee.employeeNumber)).toEqual(['EMP-0001', 'EMP-0002']);
  });

  it('reuses the existing number when onboarding is retried or the prefix changes', async () => {
    const { create, sequence } = setup();
    await create('employee-1', 'HOTEL');
    expect((await create('employee-1', 'NEW')).employeeNumber).toBe('HOTEL-0001');
    expect(sequence()).toBe(1);
    expect((await create('employee-2', 'NEW')).employeeNumber).toBe('NEW-0002');
  });

  it('skips numbers already held by inactive or terminated employees', async () => {
    const { create, employees } = setup();
    employees.set('old', {
      id: 'old',
      externalId: 'old',
      employeeNumber: 'EMP-0001',
      status: 'TERMINATED',
    });
    expect((await create('new')).employeeNumber).toBe('EMP-0002');
  });

  it('preserves legacy manual numbers and leaves the automatic counter alone', async () => {
    const { create, sequence } = setup();
    expect((await create('employee-1', 'EMP', 'LEGACY-77')).employeeNumber).toBe('LEGACY-77');
    expect((await create('employee-1')).employeeNumber).toBe('LEGACY-77');
    expect(sequence()).toBe(0);
  });

  it('rejects unsafe prefixes and normalizes lowercase prefixes', async () => {
    const { create } = setup();
    await expect(create('employee-1', 'hotel$')).rejects.toThrow('employee prefix');
    expect((await create('employee-2', 'hotel')).employeeNumber).toBe('HOTEL-0001');
  });
});
