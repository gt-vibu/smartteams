import { capabilityForScope, effectiveFederationPermissions } from './federation-grant.service';

describe('federation capability mapping', () => {
  it('maps workforce scopes to their organization capability', () => {
    expect(capabilityForScope('employees.write')).toBe('employees');
    expect(capabilityForScope('attendance.webauthn.assert')).toBe('device_verification');
    expect(capabilityForScope('approval-policies.write')).toBe('approval_policies');
    expect(capabilityForScope('files.write')).toBe('leave');
    expect(capabilityForScope('payroll.compliance.write')).toBe('compliance');
    expect(capabilityForScope('payroll.runs.read')).toBe('payroll');
  });

  it('does not gate infrastructure scopes on workforce capabilities', () => {
    expect(capabilityForScope('tenants.write')).toBeUndefined();
    expect(capabilityForScope('capabilities.read')).toBeUndefined();
  });

  it('preserves all granted scopes for multi-scope payroll authorization', () => {
    const permissions = effectiveFederationPermissions([
      {
        effect: 'ALLOW',
        scopes: [
          { scope: { code: 'payroll.advances.read' } },
          { scope: { code: 'payroll.advances.read.all' } },
        ],
      },
    ]);

    expect(permissions).toEqual(new Set(['payroll.advances.read', 'payroll.advances.read.all']));
  });

  it('does not reintroduce a denied scope into the federation context', () => {
    const permissions = effectiveFederationPermissions([
      {
        effect: 'ALLOW',
        scopes: [{ scope: { code: 'payroll.advances.read.all' } }],
      },
      {
        effect: 'DENY',
        scopes: [{ scope: { code: 'payroll.advances.read.all' } }],
      },
    ]);

    expect(permissions).not.toContain('payroll.advances.read.all');
  });
});
