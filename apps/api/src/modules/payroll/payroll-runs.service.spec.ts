import { PayrollRunsService } from './payroll-runs.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { AuditService } from '../audit/audit.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('PayrollRunsService.createRun', () => {
  const context: DomainContext = {
    organizationId: ORGANIZATION_ID,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '22222222-2222-4222-8222-222222222222' },
    correlationId: 'correlation',
    requestId: 'request',
    permissions: new Set(['payroll.runs.write']),
  };

  it('requires an existing period run to be continued or corrected instead of creating a duplicate', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'existing-run' });
    const organizationFind = jest.fn();
    const tx = {
      payrollRun: { findFirst },
      organization: { findUniqueOrThrow: organizationFind },
    };
    const database = {
      run: jest.fn((_context: unknown, callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    } as unknown as TenantDatabaseService;
    const service = new PayrollRunsService(database, {} as AuditService);

    await expect(
      service.createRun(context, { periodStart: '2026-10-01', periodEnd: '2026-10-31' }),
    ).rejects.toThrow(/already exists for this period/i);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        periodStart: new Date('2026-10-01T00:00:00.000Z'),
        periodEnd: new Date('2026-10-31T00:00:00.000Z'),
        status: { not: 'VOIDED' },
      },
      select: { id: true },
    });
    expect(organizationFind).not.toHaveBeenCalled();
  });
});
