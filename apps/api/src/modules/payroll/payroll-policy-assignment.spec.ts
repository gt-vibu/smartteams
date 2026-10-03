import type { DomainContext } from '../../common/context/domain-context';
import type { TenantTransaction } from '../../infrastructure/database/tenant-database.service';
import { Prisma } from '../../generated/prisma/client';
import type { PayComponent } from '../../generated/prisma/client';
import { findPolicy } from './payroll-policy-access';
import { saveEmployeePolicyInTransaction } from './payroll-policy-shared';
import { effectivePolicyComponents, validatePolicyComponents } from './payroll-policy-components';
import { PayrollPolicySettingsService } from './payroll-policy-settings.service';
import { DEFAULT_PAYROLL_POLICY } from './payroll-policy-defaults';
import type { EmployeePolicyInput, PolicyInput } from './payroll-policy.types';

const context: DomainContext = {
  organizationId: 'org',
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: 'admin' },
  permissions: new Set(['*']),
  correlationId: 'c',
  requestId: 'r',
};
const policy = (overrides: Record<string, unknown> = {}) => ({
  id: 'policy',
  organizationId: 'org',
  name: 'Custom structure',
  isDefault: false,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
  components: [],
  ...DEFAULT_PAYROLL_POLICY,
  basePercentage: new Prisma.Decimal(DEFAULT_PAYROLL_POLICY.basePercentage),
  baseMinimum: new Prisma.Decimal(DEFAULT_PAYROLL_POLICY.baseMinimum),
  hraPercentage: new Prisma.Decimal(DEFAULT_PAYROLL_POLICY.hraPercentage),
  ...overrides,
});
const employeeInput: EmployeePolicyInput = {
  employeeId: 'employee',
  effectiveFrom: '2026-09-01',
  payrollEnabled: true,
  salarySlipMode: 'ENABLED',
  pfEnabled: false,
  esiEnabled: false,
  ptEnabled: false,
  payrollPolicyId: 'policy',
};
function setup() {
  const tx = {
    payrollPolicy: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(policy({ isDefault: true })),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'saved', ...data }),
      ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'policy', ...data }),
      ),
      findUniqueOrThrow: jest.fn().mockResolvedValue(policy()),
    },
    employeePayrollPolicy: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((value: unknown) => Promise.resolve(value)),
      update: jest.fn((value: unknown) => Promise.resolve(value)),
    },
    payrollPolicyComponent: { deleteMany: jest.fn(), createMany: jest.fn() },
    payComponent: { findMany: jest.fn().mockResolvedValue([]) },
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const database = {
    run: jest.fn((_context: unknown, callback: (value: unknown) => unknown) => callback(tx)),
  };
  const audit = { record: jest.fn() };
  return {
    tx,
    client: tx as unknown as TenantTransaction,
    audit,
    settings: new PayrollPolicySettingsService(database as never, audit),
  };
}

describe('selected payroll structure', () => {
  it('persists the selected structure instead of discarding its ID', async () => {
    const { tx, client } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(policy());
    await saveEmployeePolicyInTransaction(client, context, employeeInput);
    expect(tx.employeePayrollPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payrollPolicyId: 'policy',
          payrollEnabled: true,
        }) as unknown,
      }),
    );
    expect(tx.payrollPolicy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          id: 'policy',
          effectiveFrom: { lte: new Date('2026-09-01') },
        }) as unknown,
      }),
    );
  });
  it('preserves the link when an existing profile update omits it', async () => {
    const { tx, client } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(policy());
    tx.employeePayrollPolicy.findUnique.mockResolvedValue({
      id: 'employee-policy',
      payrollPolicyId: 'policy',
    });
    await saveEmployeePolicyInTransaction(client, context, {
      ...employeeInput,
      payrollPolicyId: undefined,
    });
    expect(tx.employeePayrollPolicy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payrollPolicyId: 'policy' }) as unknown,
      }),
    );
  });
  it('allows explicit setup later and clears the structure link', async () => {
    const { tx, client } = setup();
    await saveEmployeePolicyInTransaction(client, context, {
      ...employeeInput,
      payrollEnabled: false,
    });
    expect(tx.payrollPolicy.findFirst).not.toHaveBeenCalled();
    expect(tx.employeePayrollPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payrollPolicyId: null, payrollEnabled: false }) as unknown,
      }),
    );
  });
  it('rejects an unavailable tenant/date-scoped structure without writing', async () => {
    const { tx, client } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(null);
    await expect(saveEmployeePolicyInTransaction(client, context, employeeInput)).rejects.toThrow(
      'Selected payroll policy is unavailable',
    );
    expect(tx.employeePayrollPolicy.create).not.toHaveBeenCalled();
  });
  it('uses custom rules, not the organization fallback', async () => {
    const { tx, client } = setup();
    const selected = policy({ basePercentage: 70 });
    tx.payrollPolicy.findFirst.mockResolvedValue(selected);
    await expect(findPolicy(client, 'org', new Date('2026-09-01'), 'policy')).resolves.toBe(
      selected,
    );
    expect(tx.payrollPolicy.findFirst).toHaveBeenCalledTimes(1);
  });
  it('allows a structure beginning when an employee joins during the run period', async () => {
    const { tx, client } = setup();
    const selected = policy({ effectiveFrom: new Date('2026-09-15') });
    tx.payrollPolicy.findFirst.mockResolvedValue(selected);
    await expect(
      findPolicy(client, 'org', new Date('2026-09-01'), 'policy', new Date('2026-09-15')),
    ).resolves.toBe(selected);
  });
  it.each(['2025-12-31', '2027-01-01'])(
    'refuses custom rules outside their effective window (%s)',
    async (date) => {
      const { tx, client } = setup();
      tx.payrollPolicy.findFirst.mockResolvedValue(policy({ effectiveTo: new Date('2026-12-31') }));
      await expect(findPolicy(client, 'org', new Date(date), 'policy')).rejects.toThrow(
        'not effective',
      );
    },
  );
  it('keeps selected default on the current effective-dated organization rules', async () => {
    const { tx, client } = setup();
    const current = policy({ id: 'new-default', isDefault: true, basePercentage: 60 });
    tx.payrollPolicy.findFirst
      .mockResolvedValueOnce(policy({ isDefault: true, effectiveTo: new Date('2026-08-31') }))
      .mockResolvedValueOnce(current);
    await expect(findPolicy(client, 'org', new Date('2026-09-01'), 'policy')).resolves.toBe(
      current,
    );
    expect(tx.payrollPolicy.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDefault: true, organizationId: 'org' }) as unknown,
      }),
    );
  });
  it('leaves previously unassigned employees on organization defaults', async () => {
    const { tx, client } = setup();
    const current = policy({ isDefault: true });
    tx.payrollPolicy.findFirst.mockResolvedValue(current);
    await expect(findPolicy(client, 'org', new Date('2026-09-01'))).resolves.toBe(current);
  });
});

describe('payroll policy list and safe save', () => {
  const input: PolicyInput = {
    ...DEFAULT_PAYROLL_POLICY,
    statutoryJurisdiction: undefined,
    effectiveFrom: '2026-09-01',
    basePercentage: 60,
    baseMinimum: 15000,
    hraPercentage: 40,
  };
  it('materializes the old default with a real selectable ID', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(null);
    await settings.listPolicies(context);
    expect(tx.payrollPolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          name: 'Standard payroll',
          isDefault: true,
          effectiveFrom: new Date('1970-01-01'),
          basePercentage: 50,
        }) as unknown,
      }),
    );
  });
  it('does not recreate or overwrite an existing default', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(policy({ isDefault: true }));
    await settings.listPolicies(context);
    expect(tx.payrollPolicy.upsert).not.toHaveBeenCalled();
  });
  it('preserves component details and stable ordering for existing policy-list clients', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(policy({ isDefault: true }));
    await settings.listPolicies(context);
    expect(tx.payrollPolicy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          components: {
            include: { payComponent: true },
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    );
  });
  it('keeps explicitly named Standard payroll saves compatible with older clients', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(null);
    await settings.savePolicy(context, { ...input, name: 'Standard payroll' });
    expect(tx.payrollPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) as unknown }),
    );
  });
  it('can configure organization policy after default onboarding', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(
      policy({
        isDefault: true,
        name: 'Standard payroll',
        effectiveFrom: new Date('1970-01-01'),
      }),
    );
    await settings.savePolicy(context, input);
    expect(tx.payrollPolicy.update).toHaveBeenCalledWith({
      where: { id: 'policy' },
      data: { effectiveTo: new Date('2026-08-31') },
    });
    expect(tx.payrollPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDefault: true,
          effectiveFrom: new Date('2026-09-01'),
        }) as unknown,
      }),
    );
  });
  it('does not auto-close a configured organization policy', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(policy({ isDefault: true }));
    await expect(settings.savePolicy(context, input)).rejects.toThrow('periods must not overlap');
    expect(tx.payrollPolicy.update).not.toHaveBeenCalled();
  });
  it('prevents promoting an assigned named policy to the organization default', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValue(policy());
    await expect(
      settings.savePolicy(context, { ...input, id: 'policy', isDefault: true }),
    ).rejects.toThrow('cannot change its default role');
    expect(tx.payrollPolicy.update).not.toHaveBeenCalled();
  });
  it('prevents moving a structure beyond its assigned employee periods', async () => {
    const { tx, settings } = setup();
    tx.payrollPolicy.findFirst.mockResolvedValueOnce(policy()).mockResolvedValueOnce(null);
    tx.employeePayrollPolicy.count.mockResolvedValue(1);
    await expect(settings.savePolicy(context, { ...input, id: 'policy' })).rejects.toThrow(
      'cannot exclude assigned',
    );
    expect(tx.payrollPolicy.update).not.toHaveBeenCalled();
  });
});

describe('policy component defaults', () => {
  const component = {
    id: 'component',
    calculationType: 'FIXED',
    formulaDefinition: {},
    isActive: true,
  } as PayComponent;
  const assignment = {
    id: 'default-assignment',
    payComponentId: 'component',
    amount: new Prisma.Decimal(500),
    percentage: null,
    payComponent: component,
  };
  it('applies template components and preserves explicit employee overrides', () => {
    const own = { ...assignment, id: 'employee-assignment', amount: new Prisma.Decimal(800) };
    expect(effectivePolicyComponents([assignment], [own])).toEqual([own]);
    expect(effectivePolicyComponents([assignment], [])).toEqual([assignment]);
  });
  it('rejects duplicates', async () => {
    const { client } = setup();
    await expect(
      validatePolicyComponents(client, 'org', [
        { payComponentId: 'component', amount: 10 },
        { payComponentId: 'component', amount: 10 },
      ]),
    ).rejects.toThrow('same component twice');
  });
  it('rejects inactive or foreign-tenant components', async () => {
    const { client } = setup();
    await expect(
      validatePolicyComponents(client, 'org', [{ payComponentId: 'component', amount: 10 }]),
    ).rejects.toThrow('unavailable');
  });
  it('rejects ambiguous amount and percentage', async () => {
    const { tx, client } = setup();
    tx.payComponent.findMany.mockResolvedValue([component]);
    await expect(
      validatePolicyComponents(client, 'org', [
        { payComponentId: 'component', amount: 10, percentage: 5 },
      ]),
    ).rejects.toThrow('both an amount and a percentage');
  });
});
