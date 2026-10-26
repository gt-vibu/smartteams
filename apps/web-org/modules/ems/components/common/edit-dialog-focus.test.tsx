import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Project, Team } from '@smarteam/contracts';
import { EditTeamDialog } from '../screen-teams/edit-team-dialog';
import { EditProjectDialog } from '../screen-projects/edit-project-dialog';

const team: Team = {
  id: '00000000-0000-4000-8000-000000000001',
  organizationId: '00000000-0000-4000-8000-000000000002',
  name: 'Northwind Support',
  branchId: '00000000-0000-4000-8000-000000000003',
};

const project: Project = {
  id: '00000000-0000-4000-8000-000000000004',
  organizationId: '00000000-0000-4000-8000-000000000002',
  name: 'Atlas migration',
  code: 'ATL-24',
  branchId: '00000000-0000-4000-8000-000000000003',
};

describe('edit dialog initial focus', () => {
  it('focuses the team heading instead of the existing name field', async () => {
    render(
      <EditTeamDialog
        team={team}
        branches={[]}
        employees={[]}
        otherNames={[]}
        open
        saving={false}
        saveError={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Edit team — Northwind Support' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByLabelText('Name')).not.toBe(document.activeElement);
  });

  it('focuses the project heading instead of the existing name field', async () => {
    render(
      <EditProjectDialog
        project={project}
        branches={[]}
        otherNames={[]}
        open
        saving={false}
        saveError={null}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'Edit project — ATL-24' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByLabelText('Name')).not.toBe(document.activeElement);
  });
});
