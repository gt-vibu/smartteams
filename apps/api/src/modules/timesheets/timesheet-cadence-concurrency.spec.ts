import { TimesheetEntriesService } from './timesheet-entries.service';
import { derivePeriodBounds, decodeEntry, encodeEntryDescription } from './timesheet-shared';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../federation/outbox.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function testContext(permissions: string[] = ['*']): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: USER },
    correlationId: 'corr-1',
    requestId: 'req-1',
    permissions: new Set(permissions),
  };
}

describe('Timesheet Cadence & Period Derivation', () => {
  it('derives WEEKLY period bounds (Monday to Sunday)', () => {
    // 2026-09-09 is a Wednesday
    const date = new Date(Date.UTC(2026, 8, 9));
    const result = derivePeriodBounds(date, 'WEEKLY');

    expect(result.periodType).toBe('WEEKLY');
    expect(result.periodStart.toISOString().slice(0, 10)).toBe('2026-09-07'); // Monday
    expect(result.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-13'); // Sunday
  });

  it('derives BIWEEKLY period bounds (14-day window)', () => {
    const date = new Date(Date.UTC(2026, 8, 9));
    const result = derivePeriodBounds(date, 'BIWEEKLY');

    expect(result.periodType).toBe('BIWEEKLY');
    const start = result.periodStart.getTime();
    const end = result.periodEnd.getTime();
    const days = (end - start) / (24 * 60 * 60 * 1000) + 1;
    expect(days).toBe(14);
    expect(result.periodStart.getUTCDay()).toBe(1); // Monday start
  });

  it('derives SEMIMONTHLY period bounds (1-15 or 16-end)', () => {
    const dateEarly = new Date(Date.UTC(2026, 8, 5));
    const resultEarly = derivePeriodBounds(dateEarly, 'SEMIMONTHLY');
    expect(resultEarly.periodStart.toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(resultEarly.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-15');

    const dateLate = new Date(Date.UTC(2026, 8, 20));
    const resultLate = derivePeriodBounds(dateLate, 'SEMIMONTHLY');
    expect(resultLate.periodStart.toISOString().slice(0, 10)).toBe('2026-09-16');
    expect(resultLate.periodEnd.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('derives MONTHLY period bounds (1st to last day of month)', () => {
    const date = new Date(Date.UTC(2026, 1, 14)); // Feb 2026
    const result = derivePeriodBounds(date, 'MONTHLY');

    expect(result.periodType).toBe('MONTHLY');
    expect(result.periodStart.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(result.periodEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

describe('JobType Concurrency & Row Locking', () => {
  it('acquires row lock FOR UPDATE on organizationSettings and appends custom job types', async () => {
    let currentMetadata: { jobTypes?: string[] } = { jobTypes: ['Architecture'] };

    const mockTx = {
      organizationSettings: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ metadata: currentMetadata })),
        update: jest
          .fn()
          .mockImplementation((args: { data: { metadata: { jobTypes: string[] } } }) => {
            currentMetadata = args.data.metadata;
            return Promise.resolve({ metadata: currentMetadata });
          }),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ organization_id: ORG }]),
    };

    const mockDatabase = {
      run: jest
        .fn()
        .mockImplementation((_ctx: unknown, callback: (tx: typeof mockTx) => Promise<unknown>) =>
          callback(mockTx),
        ),
    } as unknown as TenantDatabaseService;

    const mockAudit = {
      record: jest.fn().mockResolvedValue({}),
    } as unknown as AuditService;

    const mockOutbox = {
      append: jest.fn().mockResolvedValue({}),
    } as unknown as OutboxService;

    const service = new TimesheetEntriesService(mockDatabase, mockAudit, mockOutbox);

    const res1 = await service.createJobType(testContext(), 'Security Review');
    expect(res1).toEqual({ id: 'Security Review', name: 'Security Review' });

    // Verify row lock was requested
    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.organizationSettings.update).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      data: {
        metadata: {
          jobTypes: ['Architecture', 'Security Review'],
        },
      },
    });

    // Simulate second concurrent write after lock release
    const res2 = await service.createJobType(testContext(), 'Performance Profiling');
    expect(res2).toEqual({ id: 'Performance Profiling', name: 'Performance Profiling' });

    expect(currentMetadata.jobTypes).toEqual([
      'Architecture',
      'Security Review',
      'Performance Profiling',
    ]);
  });
});

describe('Timesheet Entry Auto-Provisioning & Project Logging', () => {
  it('reuses existing admin-created period covering the work date', async () => {
    const existingPeriod = {
      id: 'period-weekly-1',
      periodType: 'WEEKLY',
      periodStart: new Date('2026-09-07T00:00:00.000Z'),
      periodEnd: new Date('2026-09-13T00:00:00.000Z'),
      status: 'DRAFT',
    };

    const mockTx = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE, primaryBranchId: 'branch-1' }),
      },
      timesheetPeriod: {
        findFirst: jest.fn().mockResolvedValue(existingPeriod),
        upsert: jest.fn(),
      },
      organizationSettings: {
        findUnique: jest.fn(),
      },
      timesheet: {
        upsert: jest.fn().mockResolvedValue({ id: 'sheet-1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'sheet-1',
          status: 'DRAFT',
        }),
        update: jest.fn().mockResolvedValue({ id: 'sheet-1' }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prj-1', name: 'Core Engine' }),
      },
      timesheetEntry: {
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'entry-1', ...args.data }),
          ),
      },
    };

    const mockDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (_ctx: DomainContext, callback: (tx: typeof mockTx) => Promise<unknown>) =>
            callback(mockTx),
        ),
    } as unknown as TenantDatabaseService;

    const mockAudit = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const mockOutbox = { append: jest.fn().mockResolvedValue({}) } as unknown as OutboxService;

    const service = new TimesheetEntriesService(mockDatabase, mockAudit, mockOutbox);

    const result = await service.addManualEntry(testContext(), undefined, {
      workDate: '2026-09-09',
      minutes: 480,
      projectId: 'prj-1',
      jobName: 'Development',
      workItem: 'SMAR-101',
    });

    expect(result).toBeDefined();
    // Verify existing period was reused and no new period upsert occurred
    expect(mockTx.timesheetPeriod.upsert).not.toHaveBeenCalled();
    expect(mockTx.timesheet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          employeeId_timesheetPeriodId: {
            employeeId: EMPLOYEE,
            timesheetPeriodId: 'period-weekly-1',
          },
        },
      }),
    );
  });

  it('provisions WEEKLY period when no period exists and organization has WEEKLY cadence', async () => {
    const mockTx = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE, primaryBranchId: 'branch-1' }),
      },
      timesheetPeriod: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((args: { create: Record<string, unknown> }) => {
          return Promise.resolve({ id: 'new-period-weekly', ...args.create });
        }),
      },
      organizationSettings: {
        findUnique: jest.fn().mockResolvedValue({ payrollFrequency: 'WEEKLY' }),
      },
      timesheet: {
        upsert: jest.fn().mockResolvedValue({ id: 'sheet-weekly-1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'sheet-weekly-1',
          status: 'DRAFT',
        }),
        update: jest.fn().mockResolvedValue({ id: 'sheet-weekly-1' }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prj-1', name: 'Core Engine' }),
      },
      timesheetEntry: {
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'entry-1', ...args.data }),
          ),
      },
    };

    const mockDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (_ctx: DomainContext, callback: (tx: typeof mockTx) => Promise<unknown>) =>
            callback(mockTx),
        ),
    } as unknown as TenantDatabaseService;

    const mockAudit = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const mockOutbox = { append: jest.fn().mockResolvedValue({}) } as unknown as OutboxService;

    const service = new TimesheetEntriesService(mockDatabase, mockAudit, mockOutbox);

    await service.addManualEntry(testContext(), undefined, {
      workDate: '2026-09-09',
      minutes: 240,
      projectId: 'prj-1',
      jobName: 'Code Review',
    });

    expect(mockTx.timesheetPeriod.upsert).toHaveBeenCalledTimes(1);
    const firstCall = (
      mockTx.timesheetPeriod.upsert.mock.calls as [
        { create: { periodType: string; periodStart: Date; periodEnd: Date } },
      ][]
    )[0]?.[0];
    expect(firstCall?.create.periodType).toBe('WEEKLY');
    expect(firstCall?.create.periodStart).toEqual(new Date(Date.UTC(2026, 8, 7)));
    expect(firstCall?.create.periodEnd).toEqual(new Date(Date.UTC(2026, 8, 13)));
  });

  it('correctly encodes and decodes project, job, and metadata roundtrip', () => {
    const raw = {
      description: 'Worked on auth service',
      projectId: 'prj-99',
      projectName: 'Security Shield',
      jobName: 'Bug Fixing',
      workItem: 'SEC-404',
      billable: false,
      startTime: '09:00',
      endTime: '17:00',
    };

    const encoded = encodeEntryDescription(raw);
    expect(encoded).toBeDefined();

    const decoded = decodeEntry({
      id: 'entry-id',
      description: encoded ?? null,
    });

    expect(decoded.description).toBe('Worked on auth service');
    expect(decoded.projectId).toBe('prj-99');
    expect(decoded.projectName).toBe('Security Shield');
    expect(decoded.jobName).toBe('Bug Fixing');
    expect(decoded.workItem).toBe('SEC-404');
    expect(decoded.billable).toBe(false);
    expect(decoded.startTime).toBe('09:00');
    expect(decoded.endTime).toBe('17:00');
  });
});
