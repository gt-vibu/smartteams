import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_MISSED_CHECK_OUT_POLICY } from '@smarteam/contracts';
import type * as SmarteamUi from '@smarteam/ui';
import type { useAttendancePreferences } from '../../hooks/use-attendance-preferences';
import { AutoCheckOutSection } from './auto-check-out-section';

vi.mock('@smarteam/ui', async () => {
  const React = await import('react');
  const actual = await vi.importActual<typeof SmarteamUi>('@smarteam/ui');
  const SelectTrigger = () => null;
  const SelectContent = () => null;
  const SelectValue = () => null;
  const SelectItem = ({
    value,
    children,
    disabled,
  }: React.PropsWithChildren<{ value: string; disabled?: boolean }>) => (
    <option disabled={disabled} value={value}>
      {children}
    </option>
  );
  const SelectMenu = ({
    children,
    value,
    disabled,
    onValueChange,
  }: React.PropsWithChildren<{
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
  }>) => {
    const parts = React.Children.toArray(children) as React.ReactElement[];
    const trigger = parts[0];
    const content = parts[1] as React.ReactElement<{ children: React.ReactNode }>;
    const id = (trigger?.props as { id?: string } | undefined)?.id;
    return (
      <select
        disabled={disabled}
        id={id}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        value={value}
      >
        {React.Children.map(content.props.children, (item) => item)}
      </select>
    );
  };
  return { ...actual, SelectMenu, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

function setup() {
  type SavePreferencesInput = Parameters<ReturnType<typeof useAttendancePreferences>['save']>[0];
  const save = vi.fn((input: SavePreferencesInput) => {
    void input;
    return Promise.resolve(true);
  });
  const policy = {
    preferences: { missedCheckOutPolicy: DEFAULT_MISSED_CHECK_OUT_POLICY },
    canWrite: true,
    saving: false,
    save,
    runAutoCheckOut: vi.fn().mockResolvedValue({ closed: 0 }),
  } as unknown as ReturnType<typeof useAttendancePreferences>;
  render(<AutoCheckOutSection policy={policy} />);
  return save;
}

describe('missed check-out policy editor', () => {
  it('explains payroll hold and saves an employee-correction policy', async () => {
    const save = setup();
    expect(screen.getByRole('heading', { name: 'Missed check-outs' })).toBeInTheDocument();
    expect(
      screen.getByText(/held out of finalized attendance and payroll totals/i),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Resolution' }),
      'EMPLOYEE_CORRECTION',
    );

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].missedCheckOutPolicy).toMatchObject({
      resolutionMethod: 'EMPLOYEE_CORRECTION',
      employeeCorrectionsAllowed: true,
    });
    expect(screen.getByLabelText('If the deadline passes')).toBeInTheDocument();
  });

  it('offers a shift-end proposal without a configured-time field', async () => {
    setup();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Resolution' }),
      'PROVISIONAL_AUTO_CLOSE',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Proposed check-out time' }),
      'SHIFT_END',
    );

    expect(screen.queryByLabelText('Configured proposed check-out time')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for due reviews now' })).toBeInTheDocument();
  });
});
