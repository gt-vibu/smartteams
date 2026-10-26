import {
  DEFAULT_MISSED_CHECK_OUT_POLICY,
  missedCheckOutPolicySchema,
  type MissedCheckOutPolicy,
} from '@smarteam/contracts';
import { ConflictError } from '../../common/errors/domain-error';
import { instantAtLocalTime, wallClock } from './attendance-auto-checkout';

const POLICY_KEY = 'missedCheckOutPolicy';
const POLICY_HISTORY_KEY = 'missedCheckOutPolicyHistory';

export function readMissedCheckOutPolicy(
  metadata: unknown,
  legacyMode?: string | null,
  legacyTime?: Date | null,
  effectiveOn?: string,
): MissedCheckOutPolicy {
  const record =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const parsed = missedCheckOutPolicySchema.safeParse(record[POLICY_KEY]);
  if (parsed.success) {
    if (effectiveOn && effectiveOn < parsed.data.effectiveFrom) {
      const history = Array.isArray(record[POLICY_HISTORY_KEY])
        ? (record[POLICY_HISTORY_KEY] as unknown[])
        : [];
      const historical = history
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return undefined;
          const item = entry as Record<string, unknown>;
          const policy = missedCheckOutPolicySchema.safeParse(item.policy);
          return policy.success &&
            typeof item.effectiveTo === 'string' &&
            effectiveOn >= policy.data.effectiveFrom &&
            effectiveOn <= item.effectiveTo
            ? policy.data
            : undefined;
        })
        .find(Boolean);
      return historical ?? { ...DEFAULT_MISSED_CHECK_OUT_POLICY };
    }
    return parsed.data;
  }
  if (legacyMode === 'REVIEW_REQUIRED') {
    return {
      ...DEFAULT_MISSED_CHECK_OUT_POLICY,
      resolutionMethod: 'PROVISIONAL_AUTO_CLOSE',
      correctionDeadline: 'SAME_DAY',
      configuredTime: legacyTime
        ? wallClock(legacyTime)
        : DEFAULT_MISSED_CHECK_OUT_POLICY.configuredTime,
    };
  }
  return { ...DEFAULT_MISSED_CHECK_OUT_POLICY };
}

export function parseMissedCheckOutPolicy(value: unknown): MissedCheckOutPolicy {
  const parsed = missedCheckOutPolicySchema.safeParse(value);
  if (!parsed.success) throw new ConflictError('The missed check-out policy is invalid');
  return parsed.data;
}

export function withMissedCheckOutPolicy(
  metadata: unknown,
  policy: MissedCheckOutPolicy,
  previous?: MissedCheckOutPolicy,
) {
  const existing =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const history = Array.isArray(existing[POLICY_HISTORY_KEY])
    ? [...(existing[POLICY_HISTORY_KEY] as unknown[])]
    : [];
  if (previous && previous.effectiveFrom < policy.effectiveFrom) {
    history.push({
      policy: previous,
      effectiveTo: addLocalDays(policy.effectiveFrom, -1),
    });
  }
  return { ...existing, [POLICY_KEY]: policy, [POLICY_HISTORY_KEY]: history };
}

export function hasScheduledMissedCheckOutPolicy(policy: MissedCheckOutPolicy) {
  return (
    policy.resolutionMethod === 'PROVISIONAL_AUTO_CLOSE' ||
    (policy.resolutionMethod === 'EMPLOYEE_CORRECTION' &&
      policy.deadlineFallback === 'ROUTE_TO_APPROVAL_POLICY')
  );
}

export function hasScheduledMissedCheckOutHistory(metadata: unknown) {
  const record =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const history = Array.isArray(record[POLICY_HISTORY_KEY]) ? record[POLICY_HISTORY_KEY] : [];
  return history.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const policy = missedCheckOutPolicySchema.safeParse((entry as Record<string, unknown>).policy);
    return policy.success && hasScheduledMissedCheckOutPolicy(policy.data);
  });
}

/** Resolve a local policy deadline, including payroll's configured pay day when present. */
export function missedCheckOutDeadline(
  workDateKey: string,
  timeZone: string,
  policy: MissedCheckOutPolicy,
  payrollDayOfMonth?: number | null,
): Date {
  if (policy.correctionDeadline === 'SAME_DAY')
    return instantAtLocalTime(workDateKey, policy.configuredTime, timeZone);

  if (policy.correctionDeadline === 'NEXT_CALENDAR_DAY') {
    return instantAtLocalTime(addLocalDays(workDateKey, 1), policy.configuredTime, timeZone);
  }

  // Allow the payroll team one full local day to resolve an exception before the configured pay
  // day. When no pay day is configured, the safe fallback is the next calendar day.
  if (!payrollDayOfMonth || payrollDayOfMonth < 1 || payrollDayOfMonth > 31)
    return instantAtLocalTime(addLocalDays(workDateKey, 1), policy.configuredTime, timeZone);

  const [year, month, day] = workDateKey.split('-').map(Number);
  const work = new Date(Date.UTC(year!, month! - 1, day));
  let payYear = year!;
  let payMonth = month! - 1;
  let payDay = Math.min(payrollDayOfMonth, daysInMonth(payYear, payMonth));
  let payDate = new Date(Date.UTC(payYear, payMonth, payDay));
  if (payDate <= work) {
    payMonth += 1;
    if (payMonth === 12) {
      payMonth = 0;
      payYear += 1;
    }
    payDay = Math.min(payrollDayOfMonth, daysInMonth(payYear, payMonth));
    payDate = new Date(Date.UTC(payYear, payMonth, payDay));
  }
  payDate.setUTCDate(payDate.getUTCDate() - 1);
  const cutoffKey = payDate.toISOString().slice(0, 10);
  return instantAtLocalTime(cutoffKey, policy.configuredTime, timeZone);
}

export function addLocalDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, zeroBasedMonth: number) {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}
