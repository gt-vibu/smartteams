'use client';

import React from 'react';
import { Button } from '@smarteam/ui';
import { employeeDisplayName } from '@smarteam/contracts';
import type { OnboardingResult, OnboardingStep } from '../../hooks/use-employee-onboarding';

/**
 * What actually happened.
 *
 * Onboarding is several server calls with no transaction across them, so "it worked" and "it
 * failed" are both often wrong. This states which steps completed and which one did not, because
 * an administrator who is told "failed" after the employee record was created will try again and
 * hit a duplicate employee number, and one who is told "done" after the login failed will wait
 * for a person who cannot sign in.
 */

const STEP_LABELS: Record<OnboardingStep, string> = {
  employee: 'Employee record created',
  employment: 'Job title, department and reporting line recorded',
  manager: 'Manager assigned',
  account: 'Login created with the Employee role',
  link: 'Login linked to the employee record',
};

export function OnboardingOutcome({
  onDismiss,
  result,
}: {
  onDismiss: () => void;
  result: OnboardingResult;
}) {
  const failed = result.failure !== null;
  const partial = failed && result.completed.length > 0;

  return (
    <section
      className={`rounded-lg border p-4 ${
        failed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card'
      }`}
      role={failed ? 'alert' : 'status'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">
            {!failed
              ? `${result.employee ? employeeDisplayName(result.employee) : 'The employee'} is onboarded`
              : partial
                ? 'Partly onboarded'
                : 'Onboarding did not start'}
          </p>
          {failed && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {partial
                ? 'The steps below succeeded and are saved. The remaining one did not — finish it from the employee record rather than starting again.'
                : 'Nothing was saved.'}
            </p>
          )}
        </div>
        <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
          Dismiss
        </Button>
      </div>

      {result.completed.length > 0 && (
        <ul className="mt-3 space-y-1">
          {result.completed.map((step) => (
            <li className="flex items-start gap-2 text-xs text-foreground" key={step}>
              <span
                aria-hidden="true"
                className="mt-[1px] font-bold text-[var(--color-success,#46684F)]"
              >
                ✓
              </span>
              <span>{STEP_LABELS[step]}</span>
            </li>
          ))}
        </ul>
      )}

      {result.failure && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span className="font-bold">{STEP_LABELS[result.failure.step]} — failed.</span>{' '}
          {result.failure.message}
        </p>
      )}
    </section>
  );
}
