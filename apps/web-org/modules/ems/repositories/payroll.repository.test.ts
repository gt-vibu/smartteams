import { afterEach, describe, expect, it, vi } from 'vitest';
import { payrollRepository } from './payroll.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';

/** Money arrives as a serialised Decimal — a string — which is what the API actually sends. */
function payslip(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    employeeId: EMPLOYEE,
    employeeNumber: 'EMP-001',
    status: 'PENDING_UPLOAD',
    issuedAt: '2026-08-31T00:00:00.000Z',
    run: {
      id: RUN,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status: 'RELEASED',
      currencyCode: 'INR',
    },
    totals: { grossAmount: '57750.00', deductionAmount: '2000.00', netAmount: '55750.00' },
    components: [
      {
        componentCode: 'BASE',
        componentName: 'Base salary',
        componentType: 'EARNING',
        amount: '28000.00',
      },
    ],
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    headers: { getSetCookie: () => [] },
    json: () => Promise.resolve(body),
  };
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('payrollRepository', () => {
  it('requests the tenant-scoped payslips endpoint with credentials', async () => {
    const spy = mockFetch(200, [payslip()]);
    await payrollRepository.listPayslips(ORG);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/v1/organizations/${ORG}/payroll/payslips`);
    expect(init.credentials).toBe('include');
  });

  it('omits employeeId entirely when none is given, so the API self-scopes the read', async () => {
    const spy = mockFetch(200, []);
    await payrollRepository.listPayslips(ORG);

    const [url] = spy.mock.calls[0] as [string];
    expect(url).not.toContain('employeeId');
  });

  it('reads money as the serialised decimal the API sends', async () => {
    mockFetch(200, [payslip()]);
    const [result] = await payrollRepository.listPayslips(ORG);

    // The figure is the backend's, converted for display only — never recomputed.
    expect(result?.totals.netAmount).toBe(55750);
    expect(result?.components[0]?.amount).toBe(28000);
  });

  it('keeps an empty component list empty rather than inventing a breakdown', async () => {
    // An empty list means the salary-slip mode withholds the detail, not that pay was zero.
    mockFetch(200, [payslip({ components: [] })]);
    const [result] = await payrollRepository.listPayslips(ORG);

    expect(result?.components).toEqual([]);
    expect(result?.totals.grossAmount).toBe(57750);
  });

  it('rejects a payslip whose shape does not match the contract', async () => {
    mockFetch(200, [{ id: 'not-a-uuid', totals: {} }]);
    await expect(payrollRepository.listPayslips(ORG)).rejects.toThrow('was not valid');
  });

  it('surfaces the stale marker on a calculated run', async () => {
    mockFetch(200, [
      {
        id: RUN,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        status: 'CALCULATED',
        calculatedAt: '2026-09-01T00:00:00.000Z',
        calculationStaleAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    const [run] = await payrollRepository.listRuns(ORG);

    expect(run?.calculationStaleAt).toBe('2026-09-02T00:00:00.000Z');
  });

  it('posts a run transition with the reason the audit trail records', async () => {
    const spy = mockFetch(200, {
      id: RUN,
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      status: 'APPROVED',
    });
    await payrollRepository.advanceRun(ORG, RUN, 'APPROVED', 'Approved for release');

    const [url, init] = spy.mock.calls[0] as [string, { body: string }];
    expect(url).toContain(`/payroll/runs/${RUN}/action`);
    expect(JSON.parse(init.body)).toEqual({
      target: 'APPROVED',
      comment: 'Approved for release',
    });
  });
});
