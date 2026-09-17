/**
 * What onboarding says when it stops part-way.
 *
 * The failure line reused the completed step's wording, so a refused first step read "Employee
 * record created — failed" — a sentence that says both that the record exists and that it does
 * not. An administrator cannot act on that.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { OnboardingResult } from '../../hooks/use-employee-onboarding';
import { OnboardingOutcome } from './onboarding-outcome';

const base: OnboardingResult = {
  employee: null,
  completed: [],
  failure: null,
  temporaryPassword: null,
  invitationEmailed: false,
  accountEmail: null,
};

describe('onboarding outcome', () => {
  it('says the record could not be created, never that it was', () => {
    render(
      <OnboardingOutcome
        onDismiss={vi.fn()}
        result={{
          ...base,
          failure: {
            step: 'employee',
            message: 'Employee number EMP-105 already belongs to Rohan Das.',
          },
        }}
      />,
    );
    expect(screen.getByText(/The employee record could not be created/)).toBeInTheDocument();
    expect(screen.queryByText(/Employee record created/)).not.toBeInTheDocument();
    // The API's reason is kept: it names the number and who holds it.
    expect(screen.getByText(/EMP-105 already belongs to Rohan Das/)).toBeInTheDocument();
    expect(screen.getByText('Nothing was saved.')).toBeInTheDocument();
  });

  it('separates the steps that did happen from the one that did not', () => {
    render(
      <OnboardingOutcome
        onDismiss={vi.fn()}
        result={{
          ...base,
          completed: ['employee', 'employment'],
          failure: { step: 'account', message: 'That email address already has a login.' },
        }}
      />,
    );
    expect(screen.getByText('Partly onboarded')).toBeInTheDocument();
    // Past tense for what happened...
    expect(screen.getByText('Employee record created')).toBeInTheDocument();
    // ...and a plain statement for what did not.
    expect(screen.getByText(/The login could not be created/)).toBeInTheDocument();
    expect(screen.getByText(/finish it from the employee record/)).toBeInTheDocument();
  });
});
