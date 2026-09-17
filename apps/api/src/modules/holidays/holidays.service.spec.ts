import { HolidaysService } from './holidays.service';
import type { DomainContext } from '../../common/context/domain-context';

const ORG = '11111111-1111-4111-8111-111111111111';
const BRANCH = '22222222-2222-4222-8222-222222222222';
const HOLIDAY = '33333333-3333-4333-8333-333333333333';

function context(permissions: string[], branchId?: string): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    ...(branchId ? { branchId } : {}),
  };
}

/**
 * A stored holiday. Spelled out rather than partial because the service maps its result through
 * a response DTO now, so a double missing `holidayDate` fails in the mapper rather than in the
 * behaviour under test.
 */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: HOLIDAY,
    organizationId: ORG,
    branchId: null,
    holidayDate: new Date('2026-01-26T00:00:00.000Z'),
    name: 'Republic Day',
    isOptional: false,
    isActive: true,
    ...overrides,
  };
}

function setup(existing: Record<string, unknown> | null = null) {
  const tx = {
    holiday: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(stored(args.data)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(stored({ ...existing, ...args.data })),
      ),
    },
    branch: { findFirst: jest.fn().mockResolvedValue({ id: BRANCH }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit: unknown = { record: jest.fn().mockResolvedValue(undefined) };
  return { tx, service: new HolidaysService(database as never, audit as never) };
}

describe('HolidaysService', () => {
  it('requires the organization read permission to list', async () => {
    const { service } = setup();
    await expect(service.list(context([]))).rejects.toThrow(
      'Missing permission: organizations.read',
    );
  });

  it('requires the organization update permission to create', async () => {
    const { service } = setup();
    await expect(
      service.create(context(['organizations.read']), {
        name: 'Republic Day',
        holidayDate: '2026-01-26',
      }),
    ).rejects.toThrow('Missing permission: organizations.update');
  });

  it('scopes every list to the caller organization', async () => {
    const { tx, service } = setup();
    await service.list(context(['organizations.read']));

    const [call] = tx.holiday.findMany.mock.calls as [{ where: { organizationId: string } }][];
    expect(call?.[0].where.organizationId).toBe(ORG);
  });

  it('bounds the list by date when a range is given', async () => {
    const { tx, service } = setup();
    await service.list(context(['organizations.read']), { from: '2026-01-01', to: '2026-12-31' });

    const [call] = tx.holiday.findMany.mock.calls as [
      { where: { holidayDate?: { gte: Date; lte: Date } } },
    ][];
    expect(call?.[0].where.holidayDate?.gte).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('refuses a range that ends before it starts', async () => {
    const { service } = setup();
    await expect(
      service.list(context(['organizations.read']), { from: '2026-12-31', to: '2026-01-01' }),
    ).rejects.toThrow('range end must not precede start');
  });

  it('stores an organization-wide holiday with a null branch', async () => {
    const { tx, service } = setup();
    await service.create(context(['organizations.update']), {
      name: 'Republic Day',
      holidayDate: '2026-01-26',
    });

    const [call] = tx.holiday.create.mock.calls as [{ data: { branchId: string | null } }][];
    expect(call?.[0].data.branchId).toBeNull();
  });

  it('refuses a second holiday on the same date and scope', async () => {
    // The database enforces this too; the service turns it into an actionable message.
    const { service } = setup(stored());
    await expect(
      service.create(context(['organizations.update']), {
        name: 'Duplicate',
        holidayDate: '2026-01-26',
      }),
    ).rejects.toThrow('already exists on that date');
  });

  it('refuses an invalid calendar date', async () => {
    const { service } = setup();
    await expect(
      service.create(context(['organizations.update']), {
        name: 'Nonsense',
        holidayDate: '2026-02-30',
      }),
    ).rejects.toThrow('Invalid calendar date');
  });

  it('pins a federated branch scope over a branch supplied in the body', async () => {
    const { tx, service } = setup();
    await service.create(context(['organizations.update'], BRANCH), {
      name: 'Branch day',
      holidayDate: '2026-03-01',
      branchId: '99999999-9999-4999-8999-999999999999',
    });

    const [call] = tx.holiday.create.mock.calls as [{ data: { branchId: string | null } }][];
    expect(call?.[0].data.branchId).toBe(BRANCH);
  });

  /**
   * Retiring rather than deleting keeps the record of why past leave was charged as it was.
   * Nothing already persisted is recomputed.
   */
  it('retires a holiday instead of deleting it', async () => {
    const { tx, service } = setup(stored({ isActive: true }));
    await service.deactivate(context(['organizations.update']), HOLIDAY, 'Declared a working day');

    const [call] = tx.holiday.update.mock.calls as [{ data: { isActive: boolean } }][];
    expect(call?.[0].data.isActive).toBe(false);
  });

  it('refuses to retire a holiday twice', async () => {
    const { service } = setup(stored({ isActive: false }));
    await expect(
      service.deactivate(context(['organizations.update']), HOLIDAY, 'Already done'),
    ).rejects.toThrow('already retired');
  });

  it('requires a reason to retire', async () => {
    const { service } = setup(stored({ isActive: true }));
    await expect(
      service.deactivate(context(['organizations.update']), HOLIDAY, '  '),
    ).rejects.toThrow('requires a reason');
  });

  it('does not move a holiday, because the date decides what leave was charged', async () => {
    const { tx, service } = setup(stored({ name: 'Old', isActive: true }));
    await service.update(context(['organizations.update']), HOLIDAY, { name: 'New name' });

    const [call] = tx.holiday.update.mock.calls as [{ data: Record<string, unknown> }][];
    expect(call?.[0].data).toEqual({ name: 'New name' });
    expect(call?.[0].data).not.toHaveProperty('holidayDate');
  });
});
