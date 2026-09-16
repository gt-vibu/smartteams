/**
 * The access-code panel on an employee's record.
 *
 * The panel existed and worked, but nothing rendered it, so there was no way in the product to
 * give an employee a login without an administrator typing their first password. These pin what
 * it shows and who may act on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const repository = vi.hoisted(() => ({
  status: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('../../repositories/access-code.repository', () => ({ accessCodeRepository: repository }));

const session = vi.hoisted(() => ({
  value: { permissions: ['employees.read', 'employees.write'] },
}));
vi.mock('../../hooks/auth-context', () => ({
  useSession: () => ({
    session: { organizationId: 'org-1' },
    persona: { permissions: session.value.permissions },
  }),
}));

const { AccountAccessPanel } = await import('./account-access-panel');

beforeEach(() => {
  session.value.permissions = ['employees.read', 'employees.write'];
  repository.status.mockReset().mockResolvedValue({
    state: 'NO_ACCOUNT',
    expiresAt: null,
    issuedAt: null,
  });
  repository.issue.mockReset().mockResolvedValue({
    code: 'K7QM-3XRT-9WFD',
    expiresAt: '2026-09-18T12:00:00.000Z',
  });
  repository.revoke.mockReset().mockResolvedValue(undefined);
});

describe('account access panel', () => {
  it('shows the code once, for an employee with no login yet', async () => {
    render(<AccountAccessPanel employeeId="emp-1" />);
    expect(await screen.findByText('No login yet')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Generate access code' }));
    expect(await screen.findByText('K7QM-3XRT-9WFD')).toBeInTheDocument();
    expect(repository.issue).toHaveBeenCalledWith('org-1', 'emp-1');
  });

  it('offers no actions without permission to manage employees', async () => {
    session.value.permissions = ['employees.read'];
    render(<AccountAccessPanel employeeId="emp-1" />);
    expect(await screen.findByText('No login yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate/ })).not.toBeInTheDocument();
  });

  it('offers to revoke a code that is still outstanding', async () => {
    repository.status.mockResolvedValue({
      state: 'CODE_ISSUED',
      expiresAt: '2026-09-18T12:00:00.000Z',
      issuedAt: '2026-09-16T12:00:00.000Z',
    });
    render(<AccountAccessPanel employeeId="emp-1" />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Revoke' }));
    expect(repository.revoke).toHaveBeenCalledWith('org-1', 'emp-1');
  });

  it('shows nothing at all for an employee who already signs in', async () => {
    repository.status.mockResolvedValue({ state: 'ACTIVE', expiresAt: null, issuedAt: null });
    const { container } = render(<AccountAccessPanel employeeId="emp-1" />);
    expect(await screen.findByText('Account active')).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
  });
});
