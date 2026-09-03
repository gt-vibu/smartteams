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
});

describe('DatePicker inside a scrolling dialog', () => {
  it('renders the calendar outside the dialog, so nothing can clip it', () => {
    render(<DialogWithPicker />);
    fireEvent.click(screen.getByLabelText('End date'));

    const panel = screen.getByRole('dialog', { name: 'Choose date' });
    const host = screen.getByTestId('dialog');

    expect(host.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
  });

  it('positions the calendar with fixed coordinates rather than inside the scroll flow', () => {
    render(<DialogWithPicker />);
    fireEvent.click(screen.getByLabelText('End date'));

    const panel = screen.getByRole('dialog', { name: 'Choose date' });
    expect(panel.className).toContain('fixed');
    // A concrete offset means it was measured against the trigger, not left at the default.
    expect(panel.style.top).not.toBe('');
    expect(panel.style.left).not.toBe('');
  });

  it('still selects a day, now that the panel is not a descendant of the trigger', () => {
    // The outside-click handler closes on anything outside the trigger. With the panel portalled,
    // a click on a day is outside it — so without an explicit exemption the calendar would close
    // before the click registered and no date could ever be chosen.
    const onChange = vi.fn();
    render(<DatePicker aria-label="Joining date" onChange={onChange} value="2026-09-10" />);
    fireEvent.click(screen.getByLabelText('Joining date'));

    fireEvent.mouseDown(screen.getByRole('button', { name: '15' }));
    fireEvent.click(screen.getByRole('button', { name: '15' }));

    expect(onChange).toHaveBeenCalledWith('2026-09-15');
  });

  it('closes on Escape and hands focus back to the field', () => {
    render(<DatePicker aria-label="Joining date" value="" />);
    const trigger = screen.getByLabelText('Joining date');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Choose date' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Choose date' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the calendar on screen when the field sits near the right edge', () => {
    // Without a clamp the panel would run off the viewport and take the page's horizontal
    // scrollbar with it — the same defect in a different direction.
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      top: 80,
      left: 380,
      right: 400,
      width: 20,
      height: 20,
      x: 380,
      y: 80,
      toJSON: () => ({}),
    });

    render(<DatePicker aria-label="Joining date" value="" />);
    fireEvent.click(screen.getByLabelText('Joining date'));

    const panel = screen.getByRole('dialog', { name: 'Choose date' });
    expect(Number.parseInt(panel.style.left, 10) + 256).toBeLessThanOrEqual(400);
  });
});
