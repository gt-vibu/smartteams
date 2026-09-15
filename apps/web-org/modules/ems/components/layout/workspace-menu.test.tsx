/**
 * The app-bar menu is the only way a phone user can change space.
 *
 * The desktop space tabs are hidden below `md`, and the bottom bar only exists in My Space and
 * Organization — so a manager whose Employee workspace has My Space *and* Team had no way to
 * reach Team from a phone. These cases pin the menu to offering the spaces, and to staying out
 * of the way for someone with nothing to choose between.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceMenu } from './workspace-menu';

type Auth = {
  workspaceContext: 'ADMIN' | 'EMPLOYEE';
  canSwitchWorkspace: boolean;
  switchWorkspace: (target: 'ADMIN' | 'EMPLOYEE') => void;
  visibleSpaces: { id: string }[];
};
let auth: Auth;
vi.mock('../../hooks/use-auth', () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth = {
    workspaceContext: 'EMPLOYEE',
    canSwitchWorkspace: false,
    switchWorkspace: vi.fn(),
    visibleSpaces: [{ id: 'My Space' }, { id: 'Team' }],
  };
});

const trigger = () => screen.getByRole('button', { name: /my space|team|employee|admin/i });

describe('WorkspaceMenu', () => {
  it('lets a team member reach Team without the desktop tabs', async () => {
    const onSelectSpace = vi.fn();
    render(<WorkspaceMenu activeSpace="My Space" onSelectSpace={onSelectSpace} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitemradio', { name: /team/i }));

    expect(onSelectSpace).toHaveBeenCalledWith('Team');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('marks the space the person is in', async () => {
    render(<WorkspaceMenu activeSpace="Team" onSelectSpace={vi.fn()} />);
    await userEvent.click(trigger());
    expect(screen.getByRole('menuitemradio', { name: /team/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: /my space/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('switches workspace and lands on that workspace’s home space', async () => {
    auth.canSwitchWorkspace = true;
    const onSelectSpace = vi.fn();
    render(<WorkspaceMenu activeSpace="My Space" onSelectSpace={onSelectSpace} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitemradio', { name: /admin workspace/i }));

    expect(auth.switchWorkspace).toHaveBeenCalledWith('ADMIN');
    expect(onSelectSpace).toHaveBeenCalledWith('Organization');
  });

  it('closes on Escape', async () => {
    render(<WorkspaceMenu activeSpace="My Space" onSelectSpace={vi.fn()} />);
    await userEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders nothing for someone with one space and one workspace', () => {
    auth.visibleSpaces = [{ id: 'My Space' }];
    const { container } = render(<WorkspaceMenu activeSpace="My Space" onSelectSpace={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
