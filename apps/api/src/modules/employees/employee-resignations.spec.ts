import { EmployeeResignationsService } from './employee-resignations.service';

function setup(rows: Array<{ id: string; employeeId: string; status: string }>) {
  const completed: string[] = [];
  const tx = {
    employeeResignation: {
      findMany: jest.fn().mockResolvedValue(
        rows.map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          lastWorkingDay: new Date('2026-09-20T00:00:00Z'),
          employee: { status: row.status },
        })),
      ),
      update: jest.fn(({ where }: { where: { id: string } }) => {
        completed.push(where.id);
        return Promise.resolve({});
      }),
    },
  };
  const database = {
    runSystem: jest.fn().mockResolvedValue([{ id: 'org' }]),
    run: jest.fn((_context: unknown, callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const employees = { deactivate: jest.fn().mockResolvedValue({}) };
  const service = new EmployeeResignationsService(
    database as never,
    {} as never,
    employees as never,
  );
  return { service, employees, completed };
}

describe('off-boarding after the last working day', () => {
  it('deactivates the person the ordinary way and closes the resignation', async () => {
    const { service, employees, completed } = setup([
      { id: 'r1', employeeId: 'e1', status: 'ACTIVE' },
    ]);
    expect(await service.completeDue()).toBe(1);
    expect(employees.deactivate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org' }),
      'e1',
      'Resigned; last working day 2026-09-20',
    );
    expect(completed).toEqual(['r1']);
  });
  it('closes it without deactivating someone already deactivated by hand', async () => {
    const { service, employees, completed } = setup([
      { id: 'r2', employeeId: 'e2', status: 'INACTIVE' },
    ]);
    await service.completeDue();
    expect(employees.deactivate).not.toHaveBeenCalled();
    expect(completed).toEqual(['r2']);
  });
  it('leaves a resignation open when off-boarding fails, to try again', async () => {
    const { service, employees, completed } = setup([
      { id: 'r3', employeeId: 'e3', status: 'ACTIVE' },
    ]);
    employees.deactivate.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await service.completeDue()).toBe(0);
    expect(completed).toEqual([]);
  });
});

describe('resignation authorization', () => {
  it.each([['*'], ['employees.write']])(
    'rejects self-service resignation for elevated permission %s before reading employee data',
    (permission) => {
      const database = { run: jest.fn() };
      const service = new EmployeeResignationsService(database as never, {} as never, {} as never);
      const context = { permissions: new Set([permission]) } as never;

      expect(() =>
        service.submit(context, {
          reason: 'Leaving the organization',
          requestedLastDay: '2026-11-12',
        }),
      ).toThrow('Organization administrators cannot submit a self-service resignation.');
      expect(database.run).not.toHaveBeenCalled();
    },
  );
});
