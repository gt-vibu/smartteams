import { capabilityForScope } from './federation-grant.service';

describe('federation capability mapping', () => {
  it('maps workforce scopes to their organization capability', () => {
    expect(capabilityForScope('employees.write')).toBe('employees');
    expect(capabilityForScope('attendance.webauthn.assert')).toBe('device_verification');
    expect(capabilityForScope('payroll.compliance.write')).toBe('compliance');
    expect(capabilityForScope('payroll.runs.read')).toBe('payroll');
  });

  it('does not gate infrastructure scopes on workforce capabilities', () => {
    expect(capabilityForScope('tenants.write')).toBeUndefined();
    expect(capabilityForScope('capabilities.read')).toBeUndefined();
  });
});
