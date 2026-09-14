/**
 * Adding a project from the Log Time form, and ending up with it selected.
 *
 * Three things were wrong at once. The Log Time dialog raised itself to `z-[60]`, so the Add
 * Project dialog opened underneath it. The hook resolved quick-add with `true` rather than the
 * project, and the form ran `'id' in true` — which throws — so a project that had been created
 * was reported as an error and never selected. And the button was offered to everyone, while
 * creating a project needs `projects.write`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JobType, Project } from '@smarteam/contracts';
import { LogTimeModal } from './logtime-modal';

const existing = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Payroll Revamp' } as Project;
const created = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Website Redesign' } as Project;
const jobTypes = [{ id: 'dev', name: 'Development' }] as JobType[];

function renderModal(props: Partial<React.ComponentProps<typeof LogTimeModal>> = {}) {
  const view = render(
    <LogTimeModal
      isOpen
      onClose={vi.fn()}
      saving={false}
      saveError={null}
      projects={[existing]}
      jobTypes={jobTypes}
      onSubmit={vi.fn().mockResolvedValue(true)}
      {...props}
    />,
  );
  return view;
}

// The project picker is the form's first field; a Radix select shows its choice on the trigger.
// `hidden: true` because while Add Project is open, the form beneath it is (rightly) hidden from
// assistive technology by the nested modal.
const projectSelect = () => screen.getAllByRole('combobox', { hidden: true })[0]!;

describe('Log Time quick-add project', () => {
  it('creates the project and selects it in the dropdown', async () => {
    let projects = [existing];
    const onCreateProject = vi.fn(() => {
      projects = [existing, created];
      return Promise.resolve(created);
    });
    const { rerender } = renderModal({ onCreateProject });

    await userEvent.click(screen.getByRole('button', { name: /add a new project/i }));
    const dialog = await screen.findByRole('dialog', { name: /add project/i });
    await userEvent.type(within(dialog).getByLabelText(/project name/i), created.name);
    await userEvent.click(within(dialog).getByRole('button', { name: /add project/i }));

    expect(onCreateProject).toHaveBeenCalledWith(created.name, undefined);
    // The hook refetches before resolving, which the parent passes back down as `projects`.
    rerender(
      <LogTimeModal
        isOpen
        onClose={vi.fn()}
        saving={false}
        saveError={null}
        projects={projects}
        jobTypes={jobTypes}
        onSubmit={vi.fn().mockResolvedValue(true)}
        onCreateProject={onCreateProject}
      />,
    );
    await waitFor(() => expect(projectSelect()).toHaveTextContent(created.name));
    expect(screen.queryByRole('dialog', { name: /add project/i })).not.toBeInTheDocument();
  });

  it('keeps the dialog open and shows why when creation is refused', async () => {
    const onCreateProject = vi
      .fn()
      .mockRejectedValue(new Error('You lack permission projects.write'));
    renderModal({ onCreateProject });

    await userEvent.click(screen.getByRole('button', { name: /add a new project/i }));
    const dialog = await screen.findByRole('dialog', { name: /add project/i });
    await userEvent.type(within(dialog).getByLabelText(/project name/i), created.name);
    await userEvent.click(within(dialog).getByRole('button', { name: /add project/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'You lack permission projects.write',
    );
    expect(projectSelect()).toHaveTextContent(existing.name);
  });

  it('does not offer to add a project to someone who may not create one', () => {
    renderModal({ onCreateProject: undefined });
    expect(screen.queryByRole('button', { name: /add a new project/i })).not.toBeInTheDocument();
  });
});
