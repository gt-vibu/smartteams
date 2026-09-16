import { EmployeeNativeService } from './employee-native.service';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Creating an employee whose number is already taken.
 *
 * Left to the database's unique index this answered "That value is already in use", which names
 * neither the value nor who holds it. Onboarding is where it lands: a second attempt after a
 * half-finished one reuses the same number, and the administrator is told nothing they can act on.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

const context: DomainContext = {
  organizationId: ORG,
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: 'admin-1' },
  correlationId: 'c',
  requestId: 'r',
  permissions: new Set(['employees.write']),
};

const input = {
  employeeNumber: 'EMP-105',
  firstName: 'Nikhil',
  lastName: 'Menon',
  employmentType: 'FULL_TIME' as const,
};

function setup(existing: { firstName: string; lastName: string } | null) {
  const tx = {
    employee: {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'employee-1', ...args.data }),
      ),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
    employeeFieldOwnership: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };
  const sessions = { revokeAllForUser: jest.fn() };
  return {
    tx,
    service: new EmployeeNativeService(
      database as never,
      audit,
      outbox as never,
      sessions as never,
    ),
  };
}

describe('a duplicate employee number', () => {
  it('names the number and who already holds it', async () => {
    const { tx, service } = setup({ firstName: 'Rohan', lastName: 'Das' });
    await expect(service.createNative(context, input)).rejects.toThrow(
      'Employee number EMP-105 already belongs to Rohan Das. Use a different number.',
    );
    expect(tx.employee.create).not.toHaveBeenCalled();
  });

  it('creates the employee when the number is free', async () => {
    const { tx, service } = setup(null);
    await service.createNative(context, input);
    expect(tx.employee.create).toHaveBeenCalled();
  });
});
