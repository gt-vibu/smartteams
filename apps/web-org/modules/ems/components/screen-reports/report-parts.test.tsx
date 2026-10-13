import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportTable } from './report-parts';

const download = vi.hoisted(() => vi.fn<(fileName: string, content: string) => void>());
vi.mock('../../lib/csv', () => ({
  downloadFile: download,
  toCsv: (rows: unknown) => JSON.stringify(rows),
}));

describe('large reports', () => {
  it('pages all rows, searches the complete result and exports the visible filtered rows', async () => {
    const rows = Array.from({ length: 121 }, (_, i) => [`Employee ${i}`, i]);
    render(
      <ReportTable title="Staff" fileName="staff.csv" columns={['Employee', 'Days']} rows={rows} />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(51);
    await userEvent.click(screen.getByRole('button', { name: 'Next report page' }));
    expect(screen.getByText('Employee 50')).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Search Staff' }), 'Employee 120');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Employee 120')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(JSON.parse(download.mock.calls.at(-1)![1])).toEqual([
      ['Employee', 'Days'],
      ['Employee 120', 120],
    ]);
  });
});
