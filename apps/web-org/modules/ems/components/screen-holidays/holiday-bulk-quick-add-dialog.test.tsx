import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HolidayBulkQuickAddDialog } from './holiday-bulk-quick-add-dialog';

vi.mock('./holiday-dialogs-shared', () => ({
  ShadcnDatePicker: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => <input aria-label={id} onChange={(event) => onChange(event.target.value)} value={value} />,
}));

describe('HolidayBulkQuickAddDialog', () => {
  it('creates multiple named holiday dates and closes when all succeed', async () => {
    const createHoliday = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(
      <HolidayBulkQuickAddDialog
        holidays={{ createHoliday, saving: false, saveError: null } as never}
        open
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Holiday 1'), { target: { value: 'Founders Day' } });
    fireEvent.change(screen.getByLabelText('holiday-bulk-date-1'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByLabelText('Holiday 2'), { target: { value: 'Spring Festival' } });
    fireEvent.change(screen.getByLabelText('holiday-bulk-date-2'), {
      target: { value: '2026-03-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 holidays' }));
    await waitFor(() => expect(createHoliday).toHaveBeenCalledTimes(2));
    expect(createHoliday).toHaveBeenNthCalledWith(1, {
      name: 'Founders Day',
      holidayDate: '2026-02-01',
      isOptional: false,
    });
    expect(createHoliday).toHaveBeenNthCalledWith(2, {
      name: 'Spring Festival',
      holidayDate: '2026-03-01',
      isOptional: false,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
