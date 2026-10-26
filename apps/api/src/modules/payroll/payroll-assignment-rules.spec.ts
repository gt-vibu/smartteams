import { ConflictError } from '../../common/errors/domain-error';
import {
  matchesPayrollAssignmentRule,
  parsePayrollAssignmentCriteria,
  resolvePayrollAssignmentRule,
} from './payroll-assignment-rules';

const date = new Date('2026-10-01T00:00:00.000Z');
const rule = (input: Partial<Parameters<typeof matchesPayrollAssignmentRule>[0]> = {}) => ({
  id: 'rule-1',
  name: 'Engineering',
  priority: 10,
  enabled: true,
  effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
  effectiveTo: null,
  payrollPolicyId: 'policy-1',
  criteria: { departmentIds: ['dept-1'] },
  ...input,
});

describe('salary assignment rules', () => {
  it('validates the supported employee categories and rejects empty or unknown criteria', () => {
    expect(parsePayrollAssignmentCriteria({ employmentTypes: ['FULL_TIME'] })).toEqual({
      employmentTypes: ['FULL_TIME'],
    });
    expect(() => parsePayrollAssignmentCriteria({})).toThrow(ConflictError);
    expect(() => parsePayrollAssignmentCriteria({ accessRoles: ['HR_ADMIN'] })).toThrow(
      ConflictError,
    );
  });

  it('matches all selected dimensions and respects the effective window', () => {
    const target = rule({
      criteria: { departmentIds: ['dept-1'], employmentTypes: ['FULL_TIME'] },
    });
    expect(
      matchesPayrollAssignmentRule(
        target,
        { departmentId: 'dept-1', employmentType: 'FULL_TIME' },
        date,
      ),
    ).toBe(true);
    expect(
      matchesPayrollAssignmentRule(
        target,
        { departmentId: 'dept-1', employmentType: 'CONTRACT' },
        date,
      ),
    ).toBe(false);
    expect(
      matchesPayrollAssignmentRule(
        rule({ effectiveTo: new Date('2026-09-30T00:00:00.000Z') }),
        { departmentId: 'dept-1' },
        date,
      ),
    ).toBe(false);
  });

  it('uses the lowest configured priority and reports a same-priority conflict', () => {
    const lower = rule({ id: 'rule-2', priority: 20, payrollPolicyId: 'policy-2' });
    expect(
      resolvePayrollAssignmentRule([lower, rule()], { departmentId: 'dept-1' }, date)?.id,
    ).toBe('rule-1');
    expect(() =>
      resolvePayrollAssignmentRule(
        [rule(), rule({ id: 'rule-3', name: 'Manager', payrollPolicyId: 'policy-3' })],
        { departmentId: 'dept-1' },
        date,
      ),
    ).toThrow(/conflict/i);
  });
});
