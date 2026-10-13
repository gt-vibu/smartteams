import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportingDirectoryBrowser } from './reporting-directory-browser';
import { useEmployeeDirectory } from '../../hooks/use-employee-directory';
import type { EmployeeDirectoryEntry } from '@smarteam/contracts';

vi.mock('../../hooks/use-employee-directory', () => ({ useEmployeeDirectory: vi.fn() }));

const root = person('10000000-0000-4000-8000-000000000001', 'Asha', 'Rao', null);
const report = person('10000000-0000-4000-8000-000000000002', 'Bala', 'Das', root.id);
const nested = person('10000000-0000-4000-8000-000000000003', 'Chetan', 'Roy', report.id);

function person(id: string, firstName: string, lastName: string, managerEmployeeId: string | null) {
  return {
    id,
    firstName,
    lastName,
    middleName: null,
    preferredName: null,
    employeeNumber: id.slice(-4),
    workEmail: null,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    dateOfJoining: null,
    primaryBranchId: null,
    managerEmployeeId,
    jobTitle: 'Engineer',
    department: 'Product',
    directReportsCount: ['Asha', 'Bala'].includes(firstName) ? 1 : 0,
    departmentId: null,
    hasUserAccount: true,
  } satisfies EmployeeDirectoryEntry;
}

const page = {
  summary: { total: 3 },
  summaryLoading: false,
  summaryError: null,
  paging: { page: 1, previous: vi.fn(), next: vi.fn() },
  nextCursor: undefined,
  refreshing: false,
  departments: [],
  reportingTree: [],
  truncated: false,
  loading: false,
  error: null,
  forbidden: false,
  refetch: vi.fn(),
};

describe('paged reporting directory', () => {
  beforeEach(() => {
    vi.mocked(useEmployeeDirectory).mockImplementation((filters = {}) => {
      const entries =
        filters.reportingManager === 'ROOT'
          ? [root]
          : filters.reportingManager === root.id
            ? [report]
            : filters.reportingManager === report.id
              ? [nested]
              : [];
      return { ...page, entries } as unknown as ReturnType<typeof useEmployeeDirectory>;
    });
  });

  it('drills into manager reports and returns one level at a time', async () => {
    const user = userEvent.setup();
    render(<ReportingDirectoryBrowser />);
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View 1 report for Asha Rao' }));
    expect(await screen.findByText('Bala Das')).toBeInTheDocument();
    expect(screen.getByText(/Direct reports to Asha Rao/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View 1 report for Bala Das' }));
    expect(await screen.findByText('Chetan Roy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to Asha Rao' }));
    await waitFor(() => expect(screen.getByText('Bala Das')).toBeInTheDocument());
  });
});
