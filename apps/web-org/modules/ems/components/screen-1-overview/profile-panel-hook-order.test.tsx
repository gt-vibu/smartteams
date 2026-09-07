import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An administrator can gain an employee record while these panels are already mounted — that is
 * exactly what "Add myself as employee" does, and the session is re-read without a reload. The
 * panels therefore re-render with `hasEmployeeRecord` flipping false -> true, which moves them
 * from the "no employee profile" state to real content.
 *
 * Both panels used to call some of their hooks *below* that branch, so those hooks existed only
 * on the second render. React aborts on that ("Rendered more hooks than during the previous
 * render"), and the whole Employee Workspace failed to load for a self-enrolled administrator.
 *
 * These tests drive that exact transition. They fail with the hooks below the early return and
 * pass with the hooks hoisted above it.
 */

const employeeState = {
  employee: null as unknown,
  loading: false,
  error: null as string | null,
  forbidden: false,
  hasEmployeeRecord: false,
  refetch: () => {},
};

// The mock consumes a hook of its own, exactly as the real `useEmployee` does. That detail
// matters: React compares hook order against the previous render only when that render recorded
// at least one hook. A hook-free mock makes the first render look hookless, React falls back to
// the mount dispatcher on the update, and the very bug under test goes unnoticed.
vi.mock('../../hooks/use-employee', () => ({
  useEmployee: () => {
    React.useRef(null);
    return employeeState;
  },
}));

vi.mock('../../hooks/use-attendance', () => ({
  useAttendance: () => {
    React.useRef(null);
    return {
      isCheckedIn: false,
      timerDisplay: { hrs: '00', mins: '00', secs: '00' },
      checkIn: () => Promise.resolve(),
      checkOut: () => Promise.resolve(),
    };
  },
}));

vi.mock('../../hooks/use-timesheet', () => ({
  useTimesheet: () => {
    React.useRef(null);
    return { approvedTimesheet: null };
  },
}));

vi.mock('../profile/photo-upload-modal', () => ({
  PhotoUploadModal: () => null,
}));

vi.mock('../profile/profile-edit-drawer', () => ({
  ProfileEditDrawer: () => null,
}));

// Only the fields these two panels actually read. Kept minimal on purpose: this test is about
// hook ordering across a re-render, not about the profile view model.
const employee = {
  id: 'emp-1',
  employeeNumber: 'ADM-001',
  firstName: 'Rahul',
  lastName: 'Admin',
  jobTitle: null,
  avatarUrl: null,
  manager: null,
  departmentMembers: [],
};

function asNoEmployee() {
  employeeState.employee = null;
  employeeState.hasEmployeeRecord = false;
}

function asEnrolledEmployee() {
  employeeState.employee = employee;
  employeeState.hasEmployeeRecord = true;
}

describe('profile panels survive gaining an employee record while mounted', () => {
  beforeEach(() => {
    asNoEmployee();
  });

  it('EmployeeProfilePanel renders content after self-enrollment without a remount', async () => {
    const { EmployeeProfilePanel } = await import('./employee-profile-panel');

    const view = render(<EmployeeProfilePanel />);
    expect(screen.getByText('No employee profile')).toBeTruthy();

    // The same component instance re-renders — no unmount — which is what makes the hook order
    // observable to React.
    asEnrolledEmployee();
    view.rerender(<EmployeeProfilePanel />);

    expect(screen.queryByText('No employee profile')).toBeNull();
    expect(screen.getByText(/ADM-001/)).toBeTruthy();
  });

  it('GreetingActivityCard renders content after self-enrollment without a remount', async () => {
    const { GreetingActivityCard } = await import('./greeting-activity-card');

    const view = render(<GreetingActivityCard />);
    expect(screen.getByText('No employee profile')).toBeTruthy();

    asEnrolledEmployee();
    view.rerender(<GreetingActivityCard />);

    expect(screen.queryByText('No employee profile')).toBeNull();
  });
});
