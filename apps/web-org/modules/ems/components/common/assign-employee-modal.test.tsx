import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AssignmentsState } from '../../hooks/use-assignments';
import type { ProjectMembership, TeamMembership } from '../../services/membership-state';
import { AssignEmployeeModal } from './assign-employee-modal';

const applyChanges = vi.fn().mockResolvedValue(true);

function teamMembership(overrides: Partial<TeamMembership> = {}): TeamMembership {
  return {
    team: {
      id: 'team-a',
      organizationId: 'org-1',
      name: 'Platform Core',
      branchId: null,
      teamLeadEmployeeId: null,
      members: [],
    },
    state: 'NOT_A_MEMBER',
    memberId: null,
    endedOn: null,
    ...overrides,
  };
}

function projectMembership(overrides: Partial<ProjectMembership> = {}): ProjectMembership {
  return {
    project: {
      id: 'project-a',
      organizationId: 'org-1',
      name: 'Smarteam EMS',
      code: 'SMAR-EMS',
      status: 'ACTIVE',
      members: [],
    },
    state: 'NOT_A_MEMBER',
    memberId: null,
    allocationPercentage: null,
    endedOn: null,
    ...overrides,
  };
}

function assignmentsState(overrides: Partial<AssignmentsState> = {}): AssignmentsState {
  return {
    teamMemberships: [],
    projectMemberships: [],
    loading: false,
    refreshing: false,
    error: null,
    forbidden: false,
    refetch: vi.fn(),
    saving: false,
    saveError: null,
    applyChanges,
    canWriteTeams: true,
    canWriteProjects: true,
    ...overrides,
  };
}

function renderModal(overrides: Partial<AssignmentsState> = {}) {
  return render(
    <AssignEmployeeModal
      assignments={assignmentsState(overrides)}
      employeeName="Test Employee"
      isOpen
      onClose={vi.fn()}
    />,
  );
}

/**
 * These tests guard the translation from "what the user ticked" to "what we ask the API to do".
 * The dangerous failure is an unticked box turning into anything other than an end-date, since
 * membership history is not recoverable once it is wrong.
 */
describe('AssignEmployeeModal', () => {
  beforeEach(() => {
    applyChanges.mockClear();
  });

  it('sends nothing and keeps save disabled when nothing changed', async () => {
    renderModal({ teamMemberships: [teamMembership({ state: 'ACTIVE', memberId: 'member-1' })] });

    await screen.findByText('Platform Core');
    expect(screen.getByRole('button', { name: /save assignments/i })).toBeDisabled();
    expect(screen.getByText('No changes to save.')).toBeInTheDocument();
  });

  it('ticking a team the employee never joined produces an add', async () => {
    renderModal({ teamMemberships: [teamMembership()] });

    await screen.findByText('Platform Core');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save assignments/i }));

    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(applyChanges).toHaveBeenCalledWith([{ kind: 'ADD_TEAM', teamId: 'team-a' }]);
  });

  it('unticking an active team ends the membership rather than deleting it', async () => {
    renderModal({ teamMemberships: [teamMembership({ state: 'ACTIVE', memberId: 'member-1' })] });

    await screen.findByText('Platform Core');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save assignments/i }));

    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(applyChanges).toHaveBeenCalledWith([
      { kind: 'END_TEAM', teamId: 'team-a', memberId: 'member-1' },
    ]);
  });

  it('shows an ended membership as previously held, unticked but distinct from never', async () => {
    renderModal({ teamMemberships: [teamMembership({ state: 'ENDED', endedOn: '2026-06-30' })] });

    expect(await screen.findByText(/previously a member until 2026-06-30/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('re-adding an ended team is an add, not a resurrection of the old row', async () => {
    renderModal({ teamMemberships: [teamMembership({ state: 'ENDED', endedOn: '2026-06-30' })] });

    await screen.findByText('Platform Core');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save assignments/i }));

    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(applyChanges).toHaveBeenCalledWith([{ kind: 'ADD_TEAM', teamId: 'team-a' }]);
  });

  it('adds a project with the drafted allocation', async () => {
    renderModal({ projectMemberships: [projectMembership()] });

    await screen.findByText('Smarteam EMS');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /save assignments/i }));

    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(applyChanges).toHaveBeenCalledWith([
      { kind: 'ADD_PROJECT', projectId: 'project-a', allocationPercentage: 50 },
    ]);
  });

  it('states that allocation cannot be changed on an existing assignment', async () => {
    renderModal({
      projectMemberships: [
        projectMembership({ state: 'ACTIVE', memberId: 'member-2', allocationPercentage: 60 }),
      ],
    });

    expect(await screen.findByText(/allocation cannot be changed/i)).toBeInTheDocument();
    // No slider is offered, because there is no API route behind it.
    expect(screen.queryByLabelText(/^allocation \(/i)).not.toBeInTheDocument();
  });

  it('disables team checkboxes without write permission', async () => {
    renderModal({ canWriteTeams: false, teamMemberships: [teamMembership()] });

    await screen.findByText('Platform Core');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/you cannot change team membership/i)).toBeInTheDocument();
  });

  it('filters the lists by the search box', async () => {
    renderModal({
      teamMemberships: [teamMembership()],
      projectMemberships: [projectMembership()],
    });

    await screen.findByText('Platform Core');
    await userEvent.type(screen.getByPlaceholderText(/search teams and projects/i), 'smarteam');

    expect(screen.queryByText('Platform Core')).not.toBeInTheDocument();
    expect(screen.getByText('Smarteam EMS')).toBeInTheDocument();
  });
});
