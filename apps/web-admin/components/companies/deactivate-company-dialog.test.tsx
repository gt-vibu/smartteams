import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeactivateCompanyDialog } from './deactivate-company-dialog';
import type { OrganizationSummary } from '../../lib/api-client';

const company = { id: 'test-company', name: 'People Operations' } as OrganizationSummary;

describe('company deactivation', () => {
  it('requires a reason and lets the operator cancel without changing access', async () => {
    const confirm = vi.fn();
    const close = vi.fn();
    render(<DeactivateCompanyDialog company={company} onClose={close} onConfirm={confirm} />);
    expect(screen.getByRole('button', { name: 'Deactivate company' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });
  it('preserves the reason and offers another attempt after a failed request', async () => {
    const confirm = vi.fn().mockRejectedValue(new Error('Connection unavailable'));
    const close = vi.fn();
    render(<DeactivateCompanyDialog company={company} onClose={close} onConfirm={confirm} />);
    await userEvent.type(screen.getByLabelText('Reason (required)'), 'Contract ended');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate company' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable'),
    );
    expect(screen.getByLabelText('Reason (required)')).toHaveValue('Contract ended');
    expect(screen.getByRole('button', { name: 'Deactivate company' })).toBeEnabled();
    expect(close).not.toHaveBeenCalled();
  });
});
