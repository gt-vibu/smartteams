import { ForbiddenDomainError, NotFoundError } from '../../common/errors/domain-error';
import { EmployeeRecordsService } from './employee-records.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

function context(permissions: string[], organizationId = ORG): DomainContext {
  return {
    organizationId,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

function setup(options: { employeeExists?: boolean; records?: unknown[] } = {}) {
  const tx = {
    employee: {
      findFirst: jest
        .fn()
        .mockResolvedValue((options.employeeExists ?? true) ? { id: EMPLOYEE } : null),
    },
    employeeEmploymentRecord: {
      findMany: jest.fn().mockResolvedValue(options.records ?? []),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return {
    tx,
    service: new EmployeeRecordsService(database as never, { record: jest.fn() }),
  };
}

describe('EmployeeRecordsService.listEmploymentRecords', () => {
  it('returns employment history newest first', async () => {
    const records = [
      { id: 'r2', jobTitle: 'Senior Engineer', effectiveFrom: new Date('2026-01-01') },
      { id: 'r1', jobTitle: 'Engineer', effectiveFrom: new Date('2024-03-15') },
    ];
    const { service, tx } = setup({ records });

    await expect(
      service.listEmploymentRecords(context(['employees.read']), EMPLOYEE),
    ).resolves.toEqual(records);
    expect(tx.employeeEmploymentRecord.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, employeeId: EMPLOYEE },
      orderBy: [{ effectiveFrom: 'desc' }],
    });
  });

  it('requires employees.read', async () => {
    const { service } = setup();
    await expect(service.listEmploymentRecords(context([]), EMPLOYEE)).rejects.toThrow(
      ForbiddenDomainError,
    );
  });

  it('accepts the tenant wildcard', async () => {
    const { service } = setup();
    await expect(service.listEmploymentRecords(context(['*']), EMPLOYEE)).resolves.toEqual([]);
  });

  it('scopes the query to the caller organization, never a caller-supplied one', async () => {
    const { service, tx } = setup();
    await service.listEmploymentRecords(context(['employees.read'], OTHER_ORG), EMPLOYEE);

    // The organization comes from the authenticated context, so tenant A cannot read tenant B.
    expect(tx.employeeEmploymentRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: OTHER_ORG, employeeId: EMPLOYEE } }),
    );
  });

  it('rejects an employee that does not belong to the caller organization', async () => {
    const { service, tx } = setup({ employeeExists: false });
    await expect(
      service.listEmploymentRecords(context(['employees.read']), EMPLOYEE),
    ).rejects.toThrow(NotFoundError);
    // The history query must not run once the employee check fails.
    expect(tx.employeeEmploymentRecord.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty list rather than throwing when there is no history', async () => {
    const { service } = setup({ records: [] });
    await expect(
      service.listEmploymentRecords(context(['employees.read']), EMPLOYEE),
    ).resolves.toEqual([]);
  });
});
