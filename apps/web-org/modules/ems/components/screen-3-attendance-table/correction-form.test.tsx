import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CorrectionForm } from './correction-form';

// Built in the test's own time zone, as the form reads and writes the viewer's local time.
const at = (hh: number, mm: number) => new Date(2026, 8, 22, hh, mm).toISOString();

function form(onSubmit = vi.fn().mockResolvedValue({})) {
  render(
    <CorrectionForm
      checkInAt={at(9, 25)}
      checkOutAt={at(18, 35)}
      onDone={vi.fn()}
      onSubmit={onSubmit}
      workDate="2026-09-22"
    />,
  );
  return onSubmit;
}

describe('CorrectionForm', () => {
  it('starts from the day’s own punches', () => {
    form();
    expect(screen.getByLabelText('Check-in should be')).toHaveValue('09:25');
    expect(screen.getByLabelText('Check-out should be')).toHaveValue('18:35');
  });

  it('sends only the time that was changed', async () => {
    const onSubmit = form();
    fireEvent.change(screen.getByLabelText('Check-out should be'), { target: { value: '20:00' } });
    await userEvent.type(
      screen.getByLabelText('Reason for the correction'),
      'Stayed for a client call',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit Correction Request' }));
    expect(onSubmit).toHaveBeenCalledWith('Stayed for a client call', {
      correctedCheckOut: at(20, 0),
    });
  });

  it('sends the reason alone when no time changed', async () => {
    const onSubmit = form();
    await userEvent.type(screen.getByLabelText('Reason for the correction'), 'Marked as corrected');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Correction Request' }));
    expect(onSubmit).toHaveBeenCalledWith('Marked as corrected', undefined);
  });

  it('will not send a check-out before the check-in', async () => {
    const onSubmit = form();
    fireEvent.change(screen.getByLabelText('Check-out should be'), { target: { value: '08:00' } });
    await userEvent.type(screen.getByLabelText('Reason for the correction'), 'Left early that day');
    expect(screen.getByRole('alert')).toHaveTextContent(/after the check-in/);
    expect(screen.getByRole('button', { name: 'Submit Correction Request' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
