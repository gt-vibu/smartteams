import { TimesheetEntriesService } from './timesheet-entries.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../federation/outbox.service';

/**
 * Creating a project from the Log Time form is creating a project.
 *
 * The route used to check only `timesheets.write`, which every seeded employee holds, while the
 * Projects module requires `projects.write` to create the very same row. So the timesheet form
 * was a way for anyone to add organization-wide projects that the Projects screen would refuse
 * them. It is held to the Projects rule now; these pin both sides of it.
 */
const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function contextWith(permissions: string[]): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: USER },
    correlationId: 'corr-1',
    requestId: 'req-1',
    permissions: new Set(permissions),
  };
}

function setup() {
  const tx = {
    project: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          branchId: null,
          startDate: null,
          endDate: null,
          createdAt: new Date('2026-09-14T00:00:00Z'),
          ...data,
        }),
      ),
    },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: EMPLOYEE }) },
    projectMember: { create: jest.fn().mockResolvedValue({}) },
  };
  const database = {
    run: jest
      .fn()
      .mockImplementation((_context: DomainContext, callback: (t: typeof tx) => unknown) =>
        callback(tx),
      ),
  } as unknown as TenantDatabaseService;
  const audit = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
  const outbox = { append: jest.fn().mockResolvedValue({}) } as unknown as OutboxService;
  return { tx, service: new TimesheetEntriesService(database, audit, outbox) };
}

describe('TimesheetEntriesService.quickCreateProject', () => {
  it('refuses an employee who can log time but not create projects', async () => {
    const { tx, service } = setup();
    // The seeded EMPLOYEE role: timesheet self-service and project read, nothing more.
    const employee = contextWith(['timesheets.read', 'timesheets.write', 'projects.read']);

    await expect(service.quickCreateProject(employee, 'Website Redesign')).rejects.toThrow();
    expect(tx.project.create).not.toHaveBeenCalled();
  });

  it('creates the project for someone the Projects module would let create it', async () => {
    const { tx, service } = setup();
    const manager = contextWith(['timesheets.write', 'projects.write']);

    const created = await service.quickCreateProject(manager, 'Website Redesign');

    expect(tx.project.create).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({ name: 'Website Redesign', organizationId: ORG });
  });

  it('allows an organization administrator', async () => {
    const { tx, service } = setup();
    await service.quickCreateProject(contextWith(['*']), 'Mobile App');
    expect(tx.project.create).toHaveBeenCalledTimes(1);
  });
});
