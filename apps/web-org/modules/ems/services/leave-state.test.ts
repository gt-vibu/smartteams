import { describe, expect, it } from 'vitest';
import {
  availableDays,
  dateKey,
  entitlementOf,
  isCancellable,
  isPending,
  parseLeaveBalanceList,
  parseLeaveRequestPage,
  parseLeaveTypeList,
  type LeaveBalance,
} from '@smarteam/contracts';

const ORG = '99999999-9999-4999-8999-999999999999';
const EMPLOYEE = '33333333-3333-4333-8333-333333333333';
const TYPE = '44444444-4444-4444-8444-444444444444';

function balance(overrides: Partial<LeaveBalance> = {}): LeaveBalance {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: ORG,
    employeeId: EMPLOYEE,
    leaveTypeId: TYPE,
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    openingAmount: 0,
    accruedAmount: 12,
    usedAmount: 0,
    reservedAmount: 0,
    availableAmount: 12,
    ...overrides,
  };
}

/**
 * Leave amounts arrive as Prisma `Decimal`, which serialises to a string. Parsing has to coerce
 * them: a balance rendered as `NaN` would read as "no entitlement" to someone deciding whether
 * they can take a day off.
 */
describe('leave contract parsing', () => {
  it('coerces decimal strings on balances', () => {
    const parsed = parseLeaveBalanceList([
      { ...balance(), accruedAmount: '12.00', usedAmount: '3.50', availableAmount: '8.50' },
    ]);

    expect(parsed?.[0]?.accruedAmount).toBe(12);
    expect(parsed?.[0]?.usedAmount).toBe(3.5);
    expect(parsed?.[0]?.availableAmount).toBe(8.5);
  });

  it('coerces requestedDays on a request page', () => {
    const parsed = parseLeaveRequestPage({
      requests: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          organizationId: ORG,
          employeeId: EMPLOYEE,
          leaveTypeId: TYPE,
          startDate: '2026-09-07',
          endDate: '2026-09-09',
          requestedDays: '3.00',
          status: 'PENDING',
        },
      ],
    });

    expect(parsed?.requests[0]?.requestedDays).toBe(3);
  });

  it('coerces allowance fields on a leave type', () => {
    const parsed = parseLeaveTypeList([
      {
        id: TYPE,
        code: 'CL',
        name: 'Casual Leave',
        paid: true,
        accrualType: 'FIXED_ANNUAL',
        annualAllowance: '12.00',
      },
    ]);

    expect(parsed?.[0]?.annualAllowance).toBe(12);
  });

  it('rejects a payload that is not a leave balance rather than yielding undefined fields', () => {
    expect(parseLeaveBalanceList([{ id: 'not-a-uuid' }])).toBeNull();
  });
});

describe('balance derivation', () => {
  it('uses the server figure and does not recompute from entitled minus used', () => {
    // A pending request is already excluded from availableAmount. Recomputing as
    // entitled - used would show 12 here and let the employee overspend.
    const withPending = balance({ usedAmount: 0, reservedAmount: 3, availableAmount: 9 });

    expect(availableDays(withPending)).toBe(9);
    expect(availableDays(withPending)).not.toBe(
      entitlementOf(withPending) - withPending.usedAmount,
    );
  });

  it('reports zero available when everything is used', () => {
    expect(availableDays(balance({ usedAmount: 12, availableAmount: 0 }))).toBe(0);
  });
});

/**
 * `LeaveService.cancel` accepts PENDING and APPROVED with no date restriction. The predicate has
 * to mirror that: a stricter rule would hide a cancellation the API would have accepted, and a
 * looser one would offer a button that always errors.
 */
describe('request state', () => {
  it('treats only PENDING as pending', () => {
    expect(isPending({ status: 'PENDING' })).toBe(true);
    expect(isPending({ status: 'APPROVED' })).toBe(false);
  });

  it('allows cancelling pending and approved requests', () => {
    expect(isCancellable({ status: 'PENDING' })).toBe(true);
    expect(isCancellable({ status: 'APPROVED' })).toBe(true);
  });

  it('does not offer cancellation for a decided or already cancelled request', () => {
    expect(isCancellable({ status: 'REJECTED' })).toBe(false);
    expect(isCancellable({ status: 'CANCELLED' })).toBe(false);
  });

  it('normalises a timestamp to a date key', () => {
    expect(dateKey('2026-09-07T00:00:00.000Z')).toBe('2026-09-07');
    expect(dateKey('2026-09-07')).toBe('2026-09-07');
  });
});
