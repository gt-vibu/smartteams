import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePicker, Dialog, DialogContent, DialogTitle } from '@smarteam/ui';

/**
 * The calendar must escape whatever is scrolling around it.
 *
 * Inside a dialog, `DialogContent` scrolls vertically. An absolutely-positioned calendar was laid
 * out inside that scroll box, so it was clipped at the dialog edge and widened the scroll area —
 * which is what put a horizontal scrollbar across a form and cut the calendar in half.
 *
 * Rendering it into a portal on `document.body` is the fix. These assert the structural property
 * that makes it true, not the pixels: the panel must not be a descendant of the dialog.
 */

function DialogWithPicker() {
  const [value, setValue] = React.useState('');
  return (
    <Dialog open>
      <DialogContent data-testid="dialog">
        <DialogTitle>New project</DialogTitle>
        <DatePicker aria-label="End date" onChange={setValue} value={value} />
      </DialogContent>
    </Dialog>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function LeaveRangePickers() {
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  return (
    <>
      <DatePicker aria-label="From date" min="2026-10-09" onChange={setStart} value={start} />
      <DatePicker
        aria-label="To date"
        initialMonth={start}
        min={start || undefined}
        onChange={setEnd}
        value={end}
      />
    </>
  );
}

describe('DatePicker inside a scrolling dialog', () => {
  it('disables blocked dates and prevents Today from bypassing range restrictions', () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        aria-label="Leave end"
        value="2026-09-10"
        min="2026-09-10"
        max="2026-09-20"
        disabledDate={(date) => (date === '2026-09-15' ? 'Already requested for leave' : undefined)}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Leave end'));
    expect(screen.getByRole('button', { name: '9' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '15' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '21' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '10' }));
    expect(onChange).toHaveBeenCalledWith('2026-09-10');
  });
  it('renders the calendar outside the dialog, so nothing can clip it', () => {
    render(<DialogWithPicker />);
    fireEvent.click(screen.getByLabelText('End date'));

    const panel = screen.getByRole('dialog', { name: 'Choose date' });
    const host = screen.getByTestId('dialog');

    expect(host.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('renders through floating popover portal with dialog accessibility', () => {
    render(<DialogWithPicker />);
    fireEvent.click(screen.getByLabelText('End date'));

    const panel = screen.getByRole('dialog', { name: 'Choose date' });
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('data-state')).toBe('open');
  });

  it('still selects a day when clicked in the popover', () => {
    const onChange = vi.fn();
    render(<DatePicker aria-label="Joining date" onChange={onChange} value="2026-09-10" />);
    fireEvent.click(screen.getByLabelText('Joining date'));

    fireEvent.click(screen.getByRole('button', { name: '15' }));
    expect(onChange).toHaveBeenCalledWith('2026-09-15');
  });

  it('renders calendar days and month navigation cleanly', () => {
    render(<DatePicker aria-label="Joining date" value="2026-09-08" />);
    const trigger = screen.getByLabelText('Joining date');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeTruthy();
    expect(screen.getByText('September 2026')).toBeTruthy();
  });

  it('opens the end-date calendar on the selected start month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12));
    render(<LeaveRangePickers />);

    fireEvent.click(screen.getByLabelText('From date'));
    fireEvent.click(screen.getByTitle('Next Month'));
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    fireEvent.click(screen.getByLabelText('To date'));

    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByText('October 2026')).toBeNull();
  });
});
