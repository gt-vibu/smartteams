import type { DomainContext } from '../../common/context/domain-context';
import { authorizeWorkforce, workforceFilter } from './workforce-selection';

const context: DomainContext = {
  organizationId: 'organization',
  accessMode: 'NATIVE',
  actor: { type: 'USER', userId: 'admin' },
  requestId: 'request',
  correlationId: 'correlation',
  permissions: new Set(['employees.read.all', 'payroll.employee-profile.write']),
};
describe('large workforce selection boundaries', () => {
  it('requires an explicit group or all-employees choice', () => {
    expect(() => workforceFilter(context, {})).toThrow('explicitly choose');
    expect(() => workforceFilter(context, { employeeIds: [] })).toThrow();
  });
  it('always scopes an all-employees selection to the active tenant', () => {
    expect(workforceFilter(context, { allEmployees: true })).toEqual({
      organizationId: 'organization',
      status: 'ACTIVE',
    });
  });
  it('refuses a conflicting branch even when individual IDs are supplied', () => {
    expect(() =>
      workforceFilter(
        { ...context, branchId: 'north' },
        { branchId: 'south', employeeIds: ['employee'] },
      ),
    ).toThrow('administrative scope');
  });
  it('combines branch, department and role filters rather than widening selection', () => {
    const where = workforceFilter(context, {
      branchId: 'north',
      departmentId: 'engineering',
      roleId: 'staff',
    });
    expect(where).toMatchObject({
      organizationId: 'organization',
      status: 'ACTIVE',
      primaryBranchId: 'north',
      departmentId: 'engineering',
      user: {
        is: {
          isActive: true,
          organizationRoleAssignments: {
            some: { roleId: 'staff', organizationId: 'organization' },
          },
        },
      },
    });
  });
  it('requires the operation-specific permission as well as directory access', () => {
    expect(() => authorizeWorkforce(context, 'PAYROLL_POLICY')).not.toThrow();
    expect(() => authorizeWorkforce(context, 'SHIFT')).toThrow();
    expect(() =>
      authorizeWorkforce(
        { ...context, permissions: new Set(['payroll.employee-profile.write']) },
        'PAYROLL_POLICY',
      ),
    ).toThrow();
  });
});
