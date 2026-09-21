import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmployeePicker } from './employee-picker';

const person = (id: string, firstName: string, status = 'ACTIVE') => ({
  id,
  firstName,
  lastName: 'Rao',
  middleName: null,
  preferredName: null,
  employeeNumber: `EMP-${id}`,
  workEmail: `${firstName.toLowerCase()}@x.test`,
  status,
});

const people = [
  person('3', 'Chitra'),
  person('1', 'Asha'),
  person('2', 'Bala', 'INACTIVE'),
  person('4', 'Dev'),
];

const shown = () => screen.getAllByRole('option').map((option) => option.textContent);

describe('EmployeePicker', () => {
  it('offers current employees only, A to Z, leaving out existing members', () => {
    render(
      <EmployeePicker employees={people} excludeIds={['4']} onChange={vi.fn()} selected={[]} />,
    );
    const names = shown();
    expect(names).toHaveLength(2);
    expect(names[0]).toContain('Asha');
    expect(names[1]).toContain('Chitra');
  });

  it('searches by name, ID or email', async () => {
    render(<EmployeePicker employees={people} onChange={vi.fn()} selected={[]} />);
    await userEvent.type(screen.getByLabelText('Search employees'), 'emp-3');
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toContain('Chitra');
  });

  it('adds and removes people from the selection', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <EmployeePicker employees={people} onChange={onChange} selected={[]} />,
    );
    await userEvent.click(screen.getByText('Asha Rao'));
    expect(onChange).toHaveBeenLastCalledWith(['1']);
    rerender(<EmployeePicker employees={people} onChange={onChange} selected={['1']} />);
    await userEvent.click(screen.getByText('Asha Rao'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('says so when everyone is already a member', () => {
    render(
      <EmployeePicker
        employees={people}
        excludeIds={['1', '3', '4']}
        onChange={vi.fn()}
        selected={[]}
      />,
    );
    expect(screen.getByText('Everyone is already here.')).toBeTruthy();
  });
});
