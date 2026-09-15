/**
 * Log Time asks for the hours; it does not assume them.
 *
 * The form opened with 08:00 already entered (and 09:00–17:00 in start/end mode), so saving it
 * without looking recorded a full day whatever had been worked — and logged time feeds approvals
 * and pay. It also filled in a job called "Development" when the organization had none.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JobType } from '@smarteam/contracts';
import { LogTimeModal } from './logtime-modal';

const jobTypes = [{ id: 'dev', name: 'Bug Fixing' }] as JobType[];

function renderModal(props: Partial<React.ComponentProps<typeof LogTimeModal>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <LogTimeModal
      isOpen
      onClose={vi.fn()}
      saving={false}
      saveError={null}
      projects={[]}
      jobTypes={jobTypes}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

describe('Log Time hours', () => {
  it('opens with no hours entered', () => {
    renderModal();
    expect(screen.getByRole('textbox', { name: /hours worked/i })).toHaveValue('');
  });

  it('will not save until hours are entered', async () => {
    const onSubmit = renderModal();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/enter the hours you worked/i)).toBeInTheDocument();
  });

  it('saves exactly the hours entered', async () => {
    const onSubmit = renderModal();
    await userEvent.type(screen.getByRole('textbox', { name: /hours worked/i }), '2:30');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ minutes: 150 }));
  });
});

describe('Log Time without permission to add projects', () => {
  it('says who can add one instead of leaving a dead end', () => {
    renderModal({ onCreateProject: undefined, projects: [] });
    expect(screen.getByText(/an admin or project manager can add them/i)).toBeInTheDocument();
  });

  it('stays quiet when there are projects to pick from', () => {
    renderModal({
      onCreateProject: undefined,
      projects: [{ id: 'p1', name: 'Payroll Revamp' }] as React.ComponentProps<
        typeof LogTimeModal
      >['projects'],
    });
    expect(screen.queryByText(/an admin or project manager can add them/i)).not.toBeInTheDocument();
  });
});

/**
 * The attachment control was decorative: the chosen file was never uploaded, and the entry was
 * saved with `https://storage.local/<file name>` as though it had been. Time entries have no
 * attachment flow, so the form no longer pretends to offer one.
 */
describe('Log Time attachments', () => {
  it('offers no attachment it cannot store', () => {
    renderModal();
    expect(screen.queryByText(/upload from/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/workdrive/i)).not.toBeInTheDocument();
  });

  it('never sends an attachment address', async () => {
    const onSubmit = renderModal();
    await userEvent.type(screen.getByRole('textbox', { name: /hours worked/i }), '1:00');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    const [sent] = onSubmit.mock.calls[0] as [Record<string, unknown>];
    expect(sent).not.toHaveProperty('attachmentUrl');
  });
});
