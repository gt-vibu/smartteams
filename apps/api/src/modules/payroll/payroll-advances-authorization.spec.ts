import { PayrollAdvancesService } from './payroll-advances.service';
import type { DomainContext } from '../../common/context/domain-context';
import type { AccessMode } from '../../generated/prisma/enums';
import { ForbiddenDomainError } from '../../common/errors/domain-error';

/**
 * Who may raise and decide a salary advance.
 *
 * An advance is money paid out ahead of payroll and recovered from later runs. `decideAdvance`
 * checked only `payroll.advances.approve`, so a payroll officer could approve an advance to
 * themselves; and raising one for a colleague was refused as a conflict (409) rather than as the
 * forbidden act (403) every other self-service write reports.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const ADVANCE = '22222222-2222-4222-8222-222222222222';
const CALLER_USER = '44444444-4444-4444-8444-444444444444';
const CALLER_EMPLOYEE = '55555555-5555-4555-8555-555555555555';
const COLLEAGUE_EMPLOYEE = '66666666-6666-4666-8666-666666666666';
const COLLEAGUE_USER = '77777777-7777-4777-8777-777777777777';

function context(permissions: string[], overrides: Partial<DomainContext> = {}): DomainContext {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: CALLER_USER },
    correlationId: 'c',
    requestId: 'r',
    permissions: new Set(permissions),
    ...overrides,
  };
}

function decideSetup(requesterUserId: string | null) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    salaryAdvance: {
      findFirst: jest.fn().mockResolvedValue({
        id: ADVANCE,
        status: 'REQUESTED',
        requestedAmount: 5000,
        employee: { userId: requesterUserId },
      }),
      update: jest.fn().mockResolvedValue({ id: ADVANCE }),
    },
    payrollRun: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new PayrollAdvancesService(database as never) };
}

const approve = { status: 'APPROVED' as const, comment: 'Within policy for the month' };

describe('PayrollAdvancesService.decideAdvance', () => {
  it('refuses the approver deciding their own advance', async () => {
    const { tx, service } = decideSetup(CALLER_USER);
    await expect(
      service.decideAdvance(context(['payroll.advances.approve']), ADVANCE, approve),
    ).rejects.toThrow('You cannot decide your own salary advance');
    expect(tx.salaryAdvance.update).not.toHaveBeenCalled();
  });

  it('refuses it even for the wildcard administrator', async () => {
    const { tx, service } = decideSetup(CALLER_USER);
    await expect(service.decideAdvance(context(['*']), ADVANCE, approve)).rejects.toThrow(
      'You cannot decide your own salary advance',
    );
    expect(tx.salaryAdvance.update).not.toHaveBeenCalled();
  });

  it("approves a colleague's advance", async () => {
    const { tx, service } = decideSetup(COLLEAGUE_USER);
    await service.decideAdvance(context(['payroll.advances.approve']), ADVANCE, approve);
    const [call] = tx.salaryAdvance.update.mock.calls as [{ data: { status: string } }][];
    expect(call?.[0].data.status).toBe('APPROVED');
  });

  it('approves an advance for an employee with no login', async () => {
    const { tx, service } = decideSetup(null);
    await service.decideAdvance(context(['payroll.advances.approve']), ADVANCE, approve);
    expect(tx.salaryAdvance.update).toHaveBeenCalled();
  });
});

function createdFor(tx: ReturnType<typeof requestSetup>['tx']) {
  const [call] = tx.salaryAdvance.create.mock.calls as [{ data: { employeeId: string } }][];
  return call?.[0].data.employeeId;
}

function requestSetup() {
  const tx = {
    employee: {
      findFirst: jest.fn((args: { where: { id?: string; userId?: string } }) =>
        Promise.resolve(
          args.where.userId === CALLER_USER || args.where.id === CALLER_EMPLOYEE
            ? { id: CALLER_EMPLOYEE, userId: CALLER_USER }
            : args.where.id === COLLEAGUE_EMPLOYEE
              ? { id: COLLEAGUE_EMPLOYEE, userId: COLLEAGUE_USER }
              : null,
        ),
      ),
    },
    salaryAdvance: { create: jest.fn().mockResolvedValue({ id: ADVANCE }) },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  return { tx, service: new PayrollAdvancesService(database as never) };
}

const request = (employeeId: string = CALLER_EMPLOYEE) => ({
  employeeId,
  amount: 2500,
  reason: 'Medical bill due before payday',
});

describe('PayrollAdvancesService.requestAdvance', () => {
  it('raises an advance for the caller, who names themselves', async () => {
    const { tx, service } = requestSetup();
    await service.requestAdvance(context(['payroll.advances.request']), request());
    expect(createdFor(tx)).toBe(CALLER_EMPLOYEE);
  });

  it('refuses raising one for a colleague as forbidden, not as a conflict', async () => {
    const { tx, service } = requestSetup();
    const attempt = service.requestAdvance(
      context(['payroll.advances.request']),
      request(COLLEAGUE_EMPLOYEE),
    );
    await expect(attempt).rejects.toThrow('You may only act on your own records');
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenDomainError);
    expect(tx.salaryAdvance.create).not.toHaveBeenCalled();
  });

  it('lets payroll raise one on an employee’s behalf', async () => {
    const { tx, service } = requestSetup();
    await service.requestAdvance(
      context(['payroll.advances.request', 'payroll.employee-profile.read.all']),
      request(COLLEAGUE_EMPLOYEE),
    );
    expect(createdFor(tx)).toBe(COLLEAGUE_EMPLOYEE);
  });

  it('keeps the federation breadth its grant already carries', async () => {
    const { tx, service } = requestSetup();
    await service.requestAdvance(
      context(['payroll.advances.request'], {
        accessMode: 'FEDERATION' as AccessMode,
        actor: { type: 'FEDERATION_CLIENT', clientId: 'partner' },
      }),
      request(COLLEAGUE_EMPLOYEE),
    );
    expect(tx.salaryAdvance.create).toHaveBeenCalled();
  });
});
