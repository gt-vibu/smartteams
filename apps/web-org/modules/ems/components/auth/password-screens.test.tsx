/**
 * The screens for choosing, resetting and changing a password.
 *
 * What is pinned: the invitation link opens its screen and is removed from the address bar; the
 * forgot-password copy never says whether an address has an account; nothing is submitted until
 * the password meets the rule and matches; and each flow hands the right address back to sign-in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const repository = vi.hoisted(() => ({
  previewSetup: vi.fn(),
  completeSetup: vi.fn(),
  requestResetCode: vi.fn(),
  resetWithCode: vi.fn(),
  change: vi.fn(),
}));
vi.mock('../../repositories/password.repository', () => ({ passwordRepository: repository }));

const { SignedOutScreens } = await import('./signed-out-screens');
const { ForgotPasswordScreen } = await import('./forgot-password-screen');
const { ChangePasswordSection } = await import('../profile/change-password-section');

const TOKEN = 'a'.repeat(43);
const GOOD = 'a long enough password';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('the invitation link', () => {
  it('opens the set-password screen, clears the token from the address bar, then returns to sign-in', async () => {
    repository.previewSetup.mockResolvedValue({ email: 'ada@acme.test', displayName: 'Ada' });
    repository.completeSetup.mockResolvedValue({ email: 'ada@acme.test' });
    window.history.replaceState(null, '', `/#setup=${TOKEN}`);

    render(<SignedOutScreens onLogin={vi.fn()} />);
    expect(await screen.findByDisplayValue('ada@acme.test')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(repository.previewSetup).toHaveBeenCalledWith(TOKEN);

    const user = userEvent.setup();
    const save = screen.getByRole('button', { name: 'Set password' });
    expect(save).toBeDisabled();
    await user.click(screen.getByLabelText('New password'));
    await user.paste(GOOD);
    await user.click(screen.getByLabelText('Confirm new password'));
    await user.paste(GOOD);
    await user.click(save);

    expect(repository.completeSetup).toHaveBeenCalledWith(TOKEN, GOOD);
    expect(
      await screen.findByText('Your password is set. Sign in with it now.'),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('ada@acme.test')).toBeInTheDocument();
  });

  it('never takes an email or password from the link', async () => {
    repository.previewSetup.mockResolvedValue({ email: 'ada@acme.test', displayName: 'Ada' });
    window.history.replaceState(
      null,
      '',
      `/#setup=${TOKEN}&email=eve%40evil.test&temp=ST!leaked9aA`,
    );
    render(<SignedOutScreens onLogin={vi.fn()} />);
    // The address shown is the one the token belongs to, read from the server.
    expect(await screen.findByDisplayValue('ada@acme.test')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('eve@evil.test')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('ST!leaked9aA')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('says plainly when a link is spent', async () => {
    repository.previewSetup.mockRejectedValue(
      new Error('This link has expired or was already used.'),
    );
    window.history.replaceState(null, '', `/#setup=${TOKEN}`);
    render(<SignedOutScreens onLogin={vi.fn()} />);
    expect(
      await screen.findByText('This link has expired or was already used.'),
    ).toBeInTheDocument();
  });
});

describe('forgot password', () => {
  it('never says whether the address has an account, then resets with the code', async () => {
    repository.requestResetCode.mockResolvedValue(undefined);
    repository.resetWithCode.mockResolvedValue({ email: 'ada@acme.test' });
    const onDone = vi.fn();
    render(
      <ForgotPasswordScreen initialEmail="ada@acme.test" onDone={onDone} onSignIn={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(
      await screen.findByText(/has an account, a six-digit code is on its way/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code from the email'), '12a3456');
    // Only digits are kept.
    expect(screen.getByLabelText('Code from the email')).toHaveValue('123456');
    await user.click(screen.getByLabelText('New password'));
    await user.paste(GOOD);
    await user.click(screen.getByLabelText('Confirm new password'));
    await user.paste(GOOD);
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(repository.resetWithCode).toHaveBeenCalledWith('ada@acme.test', '123456', GOOD);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('ada@acme.test'));
  });

  it('keeps the form and shows why when a code is wrong', async () => {
    repository.requestResetCode.mockResolvedValue(undefined);
    repository.resetWithCode.mockRejectedValue(new Error('That code is wrong or has expired.'));
    render(
      <ForgotPasswordScreen initialEmail="ada@acme.test" onDone={vi.fn()} onSignIn={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await user.type(await screen.findByLabelText('Code from the email'), '000000');
    await user.click(screen.getByLabelText('New password'));
    await user.paste(GOOD);
    await user.click(screen.getByLabelText('Confirm new password'));
    await user.paste(GOOD);
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is wrong or has expired.',
    );
  });
});

describe('changing a password from the profile', () => {
  it('needs the current password and a matching new one', async () => {
    repository.change.mockResolvedValue(undefined);
    render(<ChangePasswordSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    const update = screen.getByRole('button', { name: 'Update password' });
    await user.click(screen.getByLabelText('New password'));
    await user.paste(GOOD);
    await user.click(screen.getByLabelText('Confirm new password'));
    await user.paste(`${GOOD}!`);
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
    expect(update).toBeDisabled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.paste(GOOD);
    // Still waiting on the current password.
    expect(update).toBeDisabled();
    await user.click(screen.getByLabelText('Current password'));
    await user.paste('the old password');
    await user.click(update);

    expect(repository.change).toHaveBeenCalledWith('the old password', GOOD);
    expect(
      await screen.findByText('Password changed. You are still signed in here.'),
    ).toBeInTheDocument();
  });
});
