import { describe, expect, it } from 'vitest';
import {
  currentEmploymentRecord,
  joiningDateFrom,
  type EmploymentRecord,
} from '@smarteam/contracts';

function record(overrides: Partial<EmploymentRecord>): EmploymentRecord {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    employeeId: '33333333-3333-4333-8333-333333333333',
    jobTitle: null,
    department: null,
    managerEmployeeId: null,
    employmentType: 'FULL_TIME',
    effectiveFrom: '2024-03-15',
    effectiveTo: null,
    ...overrides,
  };
}

/**
 * These derivations decide what the profile screen shows for job title, department and joining
 * date. Getting them wrong is how a screen quietly displays a stale or invented value.
 */
describe('employment record derivation', () => {
  it('takes the open record as current', () => {
    const history = [
      record({
        id: '11111111-1111-4111-8111-111111111111',
        jobTitle: 'Engineer',
        effectiveFrom: '2024-03-15',
        effectiveTo: '2025-12-31',
      }),
      record({
        id: '22222222-2222-4222-8222-222222222222',
        jobTitle: 'Senior Engineer',
        effectiveFrom: '2026-01-01',
      }),
    ];
    expect(currentEmploymentRecord(history)?.jobTitle).toBe('Senior Engineer');
  });

  it('prefers the newest open record when several are open', () => {
    const history = [
      record({
        id: '11111111-1111-4111-8111-111111111111',
        jobTitle: 'Old',
        effectiveFrom: '2024-01-01',
      }),
      record({
        id: '22222222-2222-4222-8222-222222222222',
        jobTitle: 'New',
        effectiveFrom: '2026-01-01',
      }),
    ];
    expect(currentEmploymentRecord(history)?.jobTitle).toBe('New');
  });

  it('falls back to the newest closed record when none are open', () => {
    const history = [
      record({ jobTitle: 'Contractor', effectiveFrom: '2023-01-01', effectiveTo: '2023-12-31' }),
    ];
    expect(currentEmploymentRecord(history)?.jobTitle).toBe('Contractor');
  });

  it('returns null with no history, so the UI shows unavailable rather than a guess', () => {
    expect(currentEmploymentRecord([])).toBeNull();
    expect(joiningDateFrom([])).toBeNull();
  });

  it('derives the joining date from the earliest record, not the current one', () => {
    const history = [
      record({ id: '22222222-2222-4222-8222-222222222222', effectiveFrom: '2026-01-01' }),
      record({
        id: '11111111-1111-4111-8111-111111111111',
        effectiveFrom: '2024-03-15',
        effectiveTo: '2025-12-31',
      }),
    ];
    // A promotion must not reset the joining date.
    expect(joiningDateFrom(history)).toBe('2024-03-15');
  });

  it('keeps a null job title null instead of substituting a placeholder', () => {
    const history = [record({ jobTitle: null, department: null })];
    const current = currentEmploymentRecord(history);
    expect(current?.jobTitle).toBeNull();
    expect(current?.department).toBeNull();
  });
});
