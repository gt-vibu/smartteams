import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { CreateProjectModal } from './create-project-modal';
import type { CreateProjectInput } from '../../repositories/teams-projects.repository';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

const branchId = '11111111-1111-4111-8111-111111111111';
const branches = [{ id: branchId, organizationId: branchId, name: 'Headquarters', code: 'HQ' }];

function RetryableProjectForm({ attempts }: { attempts: CreateProjectInput[] }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const onCreate = (input: CreateProjectInput) => {
    attempts.push(input);
    if (attempts.length === 1) {
      setSaveError('The response was lost. Retry safely.');
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  };
  return (
    <CreateProjectModal
      isOpen
      onClose={() => undefined}
      branches={branches}
      employees={[]}
      existingNames={[]}
      saving={false}
      saveError={saveError}
      onCreate={onCreate}
    />
  );
}

describe('project create retry', () => {
  it('retains one request ID after a lost response and retries the same payload', async () => {
    const attempts: CreateProjectInput[] = [];
    render(<RetryableProjectForm attempts={attempts} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Migration');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Branch' }), { key: 'ArrowDown' });
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Headquarters' }), {
      key: 'Enter',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByText('The response was lost. Retry safely.');

    expect(screen.getByText(/Retry keeps the same request ID/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry create project' }));
    await waitFor(() => expect(attempts).toHaveLength(2));
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]?.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
