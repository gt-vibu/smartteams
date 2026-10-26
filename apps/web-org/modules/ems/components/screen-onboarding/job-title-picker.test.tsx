import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JobTitlePicker } from './job-title-picker';

const mocks = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('../../hooks/use-picklist', () => ({
  usePicklist: () => ({ canAdd: true, saving: false, error: null, add: mocks.add }),
}));
vi.mock('../../hooks/use-employee-directory', () => ({
  useEmployeeDirectory: () => ({ summary: { jobTitles: [] } }),
}));
vi.mock('../common/picklist-select', () => ({
  PicklistSelect: () => <div role="combobox">Choose a title</div>,
}));

describe('JobTitlePicker quick add', () => {
  beforeEach(() => {
    mocks.add.mockReset();
    mocks.add.mockResolvedValue('People Operations Specialist');
  });

  it('puts quick add beside the title picker and selects the new title', async () => {
    const onChange = vi.fn();
    render(<JobTitlePicker value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /quick add/i }));
    fireEvent.change(screen.getByLabelText('Job title'), {
      target: { value: 'People Operations Specialist' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add title' }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith('People Operations Specialist'));
    expect(onChange).toHaveBeenCalledWith('People Operations Specialist');
  });
});
