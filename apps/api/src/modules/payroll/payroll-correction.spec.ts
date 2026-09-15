import { PayrollService } from './payroll.service';
import { MetricsService } from '../../common/metrics/metrics.service';

/** Config stub: every lookup falls through to the caller's own default. */
const defaultConfig = {
  get: (_: string, fallback?: unknown) => fallback,
  getOrThrow: () => undefined,
};
import { validTransition } from './payroll-calculation';
import { PayrollRunStatus } from '../../generated/prisma/enums';
import type { DomainContext } from '../../common/context/domain-context';

/**
 * Correcting a released payroll run.
 *
 * `CORRECTED` and `VOIDED` were states nothing could reach: the transition table listed them with
 * no route in, and no service method produced them. A wrong figure that reached release was
 * permanent, against PRD FR-38.
 *
 * The rule these protect is that a released run is never edited. The original keeps its line
 * items, payslips and payments exactly as paid, its status becomes `CORRECTED`, and a fresh draft
 * for the same period is created and linked back to it.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';

function context(permissions: string[] = ['*'], reason = 'Rectifying an overpaid allowance') {
  return {
    organizationId: ORG,
    accessMode: 'NATIVE',
    actor: { type: 'USER', userId: '44444444-4444-4444-8444-444444444444' },
    correlationId: 'c',
    requestId: 'r',
    reason,
    permissions: new Set(permissions),
  } as DomainContext;
}

function setup(options: { status?: PayrollRunStatus; openRun?: unknown } = {}) {
  const original = {
    id: RUN,
    organizationId: ORG,
    status: options.status ?? PayrollRunStatus.RELEASED,
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    payFrequency: 'MONTHLY',
    currencyCode: 'INR',
    approvalPolicyId: null,
    calculationVersion: 'v1',
    inputSnapshotHash: 'a'.repeat(64),
  };

  let findFirstCalls = 0;
  const tx = {
    // The transition and calculation paths take a row lock before reading the state they judge,
    // so concurrent callers serialise instead of both passing the guard. The mock only has to
    // answer it.
    $queryRaw: jest.fn().mockResolvedValue([]),
    payrollRun: {
      findFirst: jest.fn(() => {
        findFirstCalls += 1;
        // First lookup is the run being corrected; the second is the "already open?" check.
        return Promise.resolve(findFirstCalls === 1 ? original : (options.openRun ?? null));
      }),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...original, ...args.data }),
      ),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'replacement', ...args.data }),
      ),
    },
  };
  const database = {
    run: jest.fn((_ctx: unknown, cb: (client: unknown) => unknown) => Promise.resolve(cb(tx))),
  };
  const service = new PayrollService(
    database as never,
    { record: jest.fn() },
    { publish: jest.fn() } as never,
    new MetricsService(),
    defaultConfig as never,
  );
  return { original, service, tx };
}

describe('payroll run transitions', () => {
  it('lets a released run be corrected', () => {
    expect(validTransition(PayrollRunStatus.RELEASED, PayrollRunStatus.CORRECTED)).toBe(true);
    expect(validTransition(PayrollRunStatus.LOCKED, PayrollRunStatus.CORRECTED)).toBe(true);
  });

  it('still refuses to reopen a released run for editing', () => {
    // The point of a correction is that the original is never edited.
    expect(validTransition(PayrollRunStatus.RELEASED, PayrollRunStatus.DRAFT)).toBe(false);
    expect(validTransition(PayrollRunStatus.RELEASED, PayrollRunStatus.CALCULATED)).toBe(false);
    expect(validTransition(PayrollRunStatus.RELEASED, PayrollRunStatus.APPROVED)).toBe(false);
  });

  it('keeps a correction terminal, so chains grow forward', () => {
    for (const target of Object.values(PayrollRunStatus))
      expect(validTransition(PayrollRunStatus.CORRECTED, target)).toBe(false);
  });

  it('lets an unreleased run be abandoned', () => {
    expect(validTransition(PayrollRunStatus.DRAFT, PayrollRunStatus.VOIDED)).toBe(true);
    expect(validTransition(PayrollRunStatus.CALCULATED, PayrollRunStatus.VOIDED)).toBe(true);
  });

  it('never lets a released run be voided', () => {
    // Money has moved. It can be superseded, not erased.
    expect(validTransition(PayrollRunStatus.RELEASED, PayrollRunStatus.VOIDED)).toBe(false);
    expect(validTransition(PayrollRunStatus.LOCKED, PayrollRunStatus.VOIDED)).toBe(false);
  });
});

describe('PayrollService.correct', () => {
  it('supersedes the original rather than editing it', async () => {
    const { service, tx } = setup();
    await service.correct(context(), RUN, 'Rectifying an overpaid allowance');

    const [call] = tx.payrollRun.update.mock.calls as [{ data: { status: string } }][];
    expect(call?.[0].data.status).toBe(PayrollRunStatus.CORRECTED);
    // Nothing else about the released run is touched — no figures, no payslips.
    expect(Object.keys(call?.[0].data ?? {}).sort()).toEqual(['status', 'version']);
  });

  it('creates the replacement as a draft for the same period, linked to the original', async () => {
    const { service, tx } = setup();
    const result = await service.correct(context(), RUN, 'Rectifying an overpaid allowance');

    const [call] = tx.payrollRun.create.mock.calls as [
      { data: { status: string; correctionOfRunId: string; periodStart: Date } },
    ][];
    expect(call?.[0].data.status).toBe(PayrollRunStatus.DRAFT);
    expect(call?.[0].data.correctionOfRunId).toBe(RUN);
    expect(call?.[0].data.periodStart).toEqual(new Date('2026-08-01'));
    expect(result.replacement).toBeDefined();
    expect(result.superseded).toBeDefined();
  });

  it('refuses to correct a run that was never released', async () => {
    const { service } = setup({ status: PayrollRunStatus.DRAFT });
    await expect(
      service.correct(context(), RUN, 'Rectifying an overpaid allowance'),
    ).rejects.toThrow('Only a released or locked payroll run can be corrected');
  });

  it('refuses while another run for the period is still open', async () => {
    // Two open runs for one period would let the same month be paid twice.
    const { service } = setup({ openRun: { id: 'other', status: PayrollRunStatus.DRAFT } });
    await expect(
      service.correct(context(), RUN, 'Rectifying an overpaid allowance'),
    ).rejects.toThrow('already open');
  });

  it('requires the correction permission', async () => {
    const { service } = setup();
    await expect(
      service.correct(context(['payroll.runs.release']), RUN, 'Rectifying an overpaid allowance'),
    ).rejects.toThrow('Missing permission: payroll.runs.correct');
  });

  it('requires a reason, which reaches the audit trail', async () => {
    const { service } = setup();
    await expect(service.correct(context(['*'], ''), RUN, '')).rejects.toThrow('requires a reason');
  });
});
