import { ConflictError } from '../../common/errors/domain-error';
import { assertStatutoryRulesConfigured } from './payroll-salary-structure';

describe('statutory payroll configuration', () => {
  it('allows salary-only payroll when statutory deductions are disabled', () => {
    expect(() =>
      assertStatutoryRulesConfigured({ pf: false, esi: false, pt: false }, []),
    ).not.toThrow();
  });

  it('blocks payroll when an enabled deduction has no configured rule', () => {
    expect(() => assertStatutoryRulesConfigured({ pf: true, esi: false, pt: false }, [])).toThrow(
      ConflictError,
    );
  });

  it('accepts an explicitly configured rule without injecting a hidden default', () => {
    expect(() =>
      assertStatutoryRulesConfigured({ pf: true, esi: false, pt: false }, [{ schemeCode: 'EPF' }]),
    ).not.toThrow();
  });
});
