import { ForbiddenDomainError } from '../errors/domain-error';
import { requirePermission, requireReason } from './domain-context';

const context = {
  organizationId: '00000000-0000-0000-0000-000000000001',
  accessMode: 'NATIVE' as const,
  actor: { type: 'USER' as const, userId: '00000000-0000-0000-0000-000000000002' },
  correlationId: '00000000-0000-0000-0000-000000000003',
  requestId: '00000000-0000-0000-0000-000000000004',
  permissions: new Set<string>(['employees.read']),
};

describe('domain authorization context', () => {
  it('rejects a missing permission at the domain boundary', () => {
    expect(() => requirePermission(context, 'employees.write')).toThrow(ForbiddenDomainError);
  });
  it('accepts an explicit wildcard permission', () => {
    expect(() =>
      requirePermission({ ...context, permissions: new Set(['*']) }, 'payroll.runs.lock'),
    ).not.toThrow();
  });
  it('rejects empty reasons for audited operations', () => {
    expect(() => requireReason({ ...context, reason: '  ' }, 'A reason is required')).toThrow(
      'A reason is required',
    );
  });
});
