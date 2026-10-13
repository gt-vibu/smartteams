import type { StatutoryRule } from '@smarteam/contracts';
import { localDateKey } from '../../lib/local-date';
import { payrollRepository } from '../../repositories/payroll.repository';
import { stateStatutoryRuleDefaults } from './statutory-rule-presets';

type EnsureRulesResult = {
  created: string[];
  unsupported: string[];
  notify: boolean;
  error?: unknown;
};
const inFlightSetup = new Map<string, Promise<EnsureRulesResult>>();

/** Create missing verified rules without overwriting an organization's custom rates. */
export function ensureStateStatutoryRules(
  organizationId: string,
  jurisdiction: string,
  enabled: { epf: boolean; esic: boolean; pt: boolean },
): Promise<EnsureRulesResult> {
  const normalizedJurisdiction = jurisdiction.trim().toUpperCase();
  if (!normalizedJurisdiction)
    return Promise.resolve({ created: [], unsupported: [], notify: false });

  // React Strict Mode and screen refreshes can run this effect twice. Share one request so both
  // calls do not race to create overlapping rows for the same tenant and jurisdiction.
  const key = `${organizationId}:${normalizedJurisdiction}:${Number(enabled.epf)}:${Number(enabled.esic)}:${Number(enabled.pt)}`;
  const pending = inFlightSetup.get(key);
  if (pending) return pending.then((result) => ({ ...result, notify: false }));

  const operation = createMissingStateRules(organizationId, normalizedJurisdiction, enabled).then(
    (result) => ({ ...result, notify: true }),
    (error: unknown) => ({ created: [], unsupported: [], notify: true, error }),
  );
  inFlightSetup.set(key, operation);
  const cleanup = () => {
    if (inFlightSetup.get(key) === operation) inFlightSetup.delete(key);
  };
  void operation.then(cleanup, cleanup);
  return operation;
}

async function createMissingStateRules(
  organizationId: string,
  jurisdiction: string,
  enabled: { epf: boolean; esic: boolean; pt: boolean },
): Promise<Omit<EnsureRulesResult, 'notify' | 'error'>> {
  const { rules: defaults, unsupported } = stateStatutoryRuleDefaults(jurisdiction, enabled);
  if (!defaults.length) return { created: [], unsupported };

  const existingRules = await payrollRepository.listStatutoryRules(organizationId, jurisdiction);
  const today = localDateKey();
  const created: string[] = [];

  for (const rule of defaults) {
    const sameSchemeAndState = existingRules.filter(
      (existing) =>
        existing.schemeCode === rule.schemeCode &&
        existing.jurisdiction.trim().toUpperCase() === jurisdiction,
    );
    const alreadyEffective = sameSchemeAndState.some((existing) => {
      const start = existing.effectiveFrom.slice(0, 10);
      const end = existing.effectiveTo?.slice(0, 10);
      return start <= today && (!end || end >= today);
    });

    // A currently effective row may be a company-reviewed custom rule. Preserve it.
    if (alreadyEffective) continue;

    // Do not backdate a rule while onboarding a tenant. This also keeps expired custom ranges
    // from overlapping the new defaults. If a future company rule exists, end the default the
    // day before that rule starts.
    const effectiveFrom = rule.effectiveFrom > today ? rule.effectiveFrom : today;
    const exactRuleExists = sameSchemeAndState.some(
      (existing) => existing.effectiveFrom.slice(0, 10) === effectiveFrom,
    );
    if (exactRuleExists) continue;

    const nextRuleStart = sameSchemeAndState
      .map((existing) => existing.effectiveFrom.slice(0, 10))
      .filter((date) => date > effectiveFrom)
      .sort()[0];
    const effectiveTo = nextRuleStart
      ? new Date(new Date(`${nextRuleStart}T00:00:00Z`).getTime() - 86_400_000)
          .toISOString()
          .slice(0, 10)
      : undefined;
    if (effectiveTo && effectiveTo < effectiveFrom) continue;

    const datedRule: Omit<StatutoryRule, 'id'> = {
      ...rule,
      effectiveFrom,
      ...(effectiveTo ? { effectiveTo } : {}),
    };

    try {
      await payrollRepository.saveStatutoryRule(organizationId, datedRule);
    } catch (error) {
      // Another tab or request may have saved the same rule between the list and create calls.
      // Treat that as success only if the persisted row now covers the intended period.
      const refreshedRules = await payrollRepository.listStatutoryRules(
        organizationId,
        jurisdiction,
      );
      const concurrentlySaved = refreshedRules.some(
        (existing) =>
          existing.schemeCode === rule.schemeCode &&
          existing.jurisdiction.trim().toUpperCase() === jurisdiction &&
          existing.effectiveFrom.slice(0, 10) <= effectiveFrom &&
          (!existing.effectiveTo || existing.effectiveTo.slice(0, 10) >= effectiveFrom),
      );
      if (!concurrentlySaved) throw error;
      existingRules.splice(0, existingRules.length, ...refreshedRules);
      continue;
    }
    created.push(rule.schemeCode);
    existingRules.push(datedRule);
  }

  return { created, unsupported };
}
