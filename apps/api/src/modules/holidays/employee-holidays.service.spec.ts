import { EmployeeHolidaysService } from './employee-holidays.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../federation/outbox.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '44444444-4444-4444-8444-444444444444';
const EMP = '55555555-5555-4555-8555-555555555555';
const HOL_OPT_1 = '66666666-6666-4666-8666-666666666666';
const HOL_OPT_2 = '77777777-7777-4777-8777-777777777777';
const HOL_OPT_3 = '88888888-8888-4888-8888-888888888888';
const HOL_MANDATORY = '99999999-9999-4999-8999-999999999999';

function context(permissions: string[] = ['organizations.read']): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
  };
}

type HolidayMock = {
  id: string;
  organizationId: string;
  branchId: string | null;
  holidayDate: Date;
  name: string;
  isOptional: boolean;
  isActive: boolean;
};
type SelectionMock = {
  id: string;
  employeeId: string;
  holidayId: string;
  year: number;
  status: string;
  selectedAt: Date;
  cancelledAt?: Date | null;
  organizationId: string;
  holiday?: Partial<HolidayMock> & { holidayDate: Date };
};
function setup(
  overrides: {
    allowance?: number;
    existingSelections?: SelectionMock[];
    holidays?: HolidayMock[];
  } = {},
) {
  const allowance = overrides.allowance ?? 2;
  const selections = overrides.existingSelections ?? [];
  const holidays = overrides.holidays ?? [
    {
      id: HOL_MANDATORY,
      organizationId: ORG,
      branchId: null,
      holidayDate: new Date('2029-01-26T00:00:00.000Z'),
      name: 'Republic Day',
      isOptional: false,
      isActive: true,
    },
    {
      id: HOL_OPT_1,
      organizationId: ORG,
      branchId: null,
      holidayDate: new Date('2029-01-15T00:00:00.000Z'),
      name: 'Pongal',
      isOptional: true,
      isActive: true,
    },
    {
      id: HOL_OPT_2,
      organizationId: ORG,
      branchId: null,
      holidayDate: new Date('2029-04-14T00:00:00.000Z'),
      name: 'Tamil New Year',
      isOptional: true,
      isActive: true,
    },
    {
      id: HOL_OPT_3,
      organizationId: ORG,
      branchId: null,
      holidayDate: new Date('2029-08-27T00:00:00.000Z'),
      name: 'Onam',
      isOptional: true,
      isActive: true,
    },
  ];

  const empRecord = {
    id: EMP,
    userId: USER,
    organizationId: ORG,
    primaryBranchId: null,
    status: 'ACTIVE',
  };

  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: EMP }]),
    employee: {
      findFirst: jest.fn().mockResolvedValue(empRecord),
      findUniqueOrThrow: jest.fn().mockResolvedValue(empRecord),
    },
    organizationSettings: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        organizationId: ORG,
        optionalHolidayAllowance: allowance,
      }),
    },
    holiday: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where?: { id?: { in?: string[] } } }) => {
          if (where?.id?.in) {
            const ids = where.id.in;
            return Promise.resolve(holidays.filter((h) => ids.includes(h.id)));
          }
          return Promise.resolve(holidays);
        }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where?: { id?: string } }) =>
          Promise.resolve(holidays.find((h) => h.id === where?.id) ?? null),
        ),
    },
    employeeHolidaySelection: {
      findMany: jest.fn().mockResolvedValue(selections),
      findUnique: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { employeeId_holidayId: { employeeId: string; holidayId: string } };
          }) => {
            const found =
              selections.find(
                (s) =>
                  s.employeeId === where.employeeId_holidayId.employeeId &&
                  s.holidayId === where.employeeId_holidayId.holidayId,
              ) ?? null;
            return Promise.resolve(found);
          },
        ),
      upsert: jest
        .fn()
        .mockImplementation(({ create }: { create: Record<string, unknown> }) =>
          Promise.resolve({ id: 'sel-uuid', ...create }),
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: { status: string; cancelledAt: Date | null } }) =>
          Promise.resolve({
            id: 'sel-uuid',
            status: data.status,
            cancelledAt: data.cancelledAt,
          }),
        ),
    },
    // Default: no per-employee policy override (null → fall back to org global)
    employeeHolidayPolicy: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };

  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const outbox = { append: jest.fn().mockResolvedValue(undefined) };

  return {
    tx,
    service: new EmployeeHolidaysService(
      database as unknown as TenantDatabaseService,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      audit as unknown as AuditService,
      outbox as unknown as OutboxService,
    ),
  };
}

describe('EmployeeHolidaysService', () => {
  it('returns summary with allowance, usedCount, remainingCount, and categorized lists', async () => {
    const { service } = setup({ allowance: 3 });
    const summary = await service.getMyHolidaySummary(context(), 2026);

    expect(summary.allowance).toBe(3);
    expect(summary.usedCount).toBe(0);
    expect(summary.remainingCount).toBe(3);
    expect(summary.mandatory.length).toBe(1);
    expect(summary.optionalPool.length).toBe(3);
  });

  it('allows employee to select optional holidays within allowance', async () => {
    const { tx, service } = setup({ allowance: 2 });
    await service.selectHolidays(context(), [HOL_OPT_1, HOL_OPT_2]);

    expect(tx.employeeHolidaySelection.upsert).toHaveBeenCalledTimes(2);
  });

  it('refuses selection if total selections would exceed allowance', async () => {
    const { service } = setup({
      allowance: 1,
      existingSelections: [
        {
          id: 'existing-1',
          organizationId: ORG,
          employeeId: EMP,
          holidayId: HOL_OPT_1,
          year: 2026,
          status: 'CONFIRMED',
          selectedAt: new Date(),
          holiday: { holidayDate: new Date('2026-01-15') },
        },
      ],
    });

    await expect(service.selectHolidays(context(), [HOL_OPT_2])).rejects.toThrow(
      'Selection exceeds annual allowance',
    );
  });

  it('refuses to select a mandatory holiday as an optional holiday', async () => {
    const { service } = setup({ allowance: 2 });
    await expect(service.selectHolidays(context(), [HOL_MANDATORY])).rejects.toThrow(
      'is already a mandatory holiday',
    );
  });

  it('allows employee to cancel a future optional holiday selection', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30); // 30 days in future

    const { tx, service } = setup({
      existingSelections: [
        {
          id: 'sel-1',
          organizationId: ORG,
          employeeId: EMP,
          holidayId: HOL_OPT_1,
          year: 2026,
          status: 'CONFIRMED',
          selectedAt: new Date(),
          holiday: { id: HOL_OPT_1, holidayDate: futureDate },
        },
      ],
    });

    await service.cancelSelection(context(), HOL_OPT_1, 'Changed festival preference');

    expect(tx.employeeHolidaySelection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('refuses to cancel a past holiday selection', async () => {
    const pastDate = new Date('2020-01-01T00:00:00.000Z');

    const { service } = setup({
      existingSelections: [
        {
          id: 'sel-1',
          organizationId: ORG,
          employeeId: EMP,
          holidayId: HOL_OPT_1,
          year: 2020,
          status: 'CONFIRMED',
          selectedAt: new Date(),
          holiday: { id: HOL_OPT_1, holidayDate: pastDate },
        },
      ],
    });

    await expect(service.cancelSelection(context(), HOL_OPT_1)).rejects.toThrow(
      'Cannot cancel an optional holiday that has already passed',
    );
  });

  it('refuses to select an optional holiday that is in the past', async () => {
    const { service } = setup({
      holidays: [
        {
          id: 'past-hol',
          organizationId: ORG,
          branchId: null,
          holidayDate: new Date('2020-01-01T00:00:00.000Z'),
          name: 'Old Festival',
          isOptional: true,
          isActive: true,
        },
      ],
    });

    await expect(service.selectHolidays(context(), ['past-hol'])).rejects.toThrow(
      'has already passed',
    );
  });

  it('refuses to select a branch-specific holiday if employee belongs to a different branch', async () => {
    const { service } = setup({
      holidays: [
        {
          id: 'branch-hol',
          organizationId: ORG,
          branchId: 'diff-branch-uuid',
          holidayDate: new Date('2029-05-01T00:00:00.000Z'),
          name: 'Regional Day',
          isOptional: true,
          isActive: true,
        },
      ],
    });

    await expect(service.selectHolidays(context(), ['branch-hol'])).rejects.toThrow(
      'is not applicable to your assigned branch',
    );
  });

  it('refuses selection if selected holidays belong to different calendar years', async () => {
    const { service } = setup({
      holidays: [
        {
          id: 'hol-2028',
          organizationId: ORG,
          branchId: null,
          holidayDate: new Date('2028-05-01T00:00:00.000Z'),
          name: 'Festival 2028',
          isOptional: true,
          isActive: true,
        },
        {
          id: 'hol-2029',
          organizationId: ORG,
          branchId: null,
          holidayDate: new Date('2029-05-01T00:00:00.000Z'),
          name: 'Festival 2029',
          isOptional: true,
          isActive: true,
        },
      ],
    });

    await expect(service.selectHolidays(context(), ['hol-2028', 'hol-2029'])).rejects.toThrow(
      'must belong to the same calendar year',
    );
  });

  it('acquires an exclusive row-level lock on employee to prevent race conditions', async () => {
    const { tx, service } = setup({ allowance: 2 });
    await service.selectHolidays(context(), [HOL_OPT_1]);

    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      EMP,
      ORG,
    );
  });
});
