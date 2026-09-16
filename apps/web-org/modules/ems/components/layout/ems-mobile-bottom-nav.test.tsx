/**
 * The mobile bar, and the difference between a tab and a shrunken button.
 *
 * Every failure asserted here was visible on a phone. The bar was built out of the shared `Button`,
 * whose base sets `h-8` and `[&_svg]:size-3.5`: the fixed height cropped the labels out of the bar
 * so tabs were icon-only, and the descendant selector out-specified each icon's own size class so
 * every icon drew at 14px. Separately, the icon set was copied into both item files and had drifted
 * — `Time Off` was a cloud, `Timesheet` and `Shifts` were the same clock — so the icons that were
 * left could not be relied on either.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmsMobileBottomNav } from './ems-mobile-bottom-nav';
import { employeeNavItems } from './navigation-employee-items';
import { adminNavItems } from './navigation-admin-items';

const canAccessModule = vi.fn<(moduleId: string) => boolean>();
vi.mock('../../hooks/use-auth', () => ({ useAuth: () => ({ canAccessModule }) }));

beforeEach(() => {
  canAccessModule.mockReset();
  canAccessModule.mockReturnValue(true);
});

const renderNav = (activeModule = 'home', onSelectModule = vi.fn()) => {
  render(
    <EmsMobileBottomNav
      activeModule={activeModule}
      onSelectModule={onSelectModule}
      activeSpace="Employee"
    />,
  );
  return onSelectModule;
};

const bar = () => screen.getByRole('navigation', { name: 'Sections' });
const tab = (name: string) => within(bar()).getByRole('button', { name: new RegExp(name, 'i') });

describe('EmsMobileBottomNav', () => {
  it('labels every tab, rather than leaving a row of unexplained glyphs', () => {
    renderNav();
    for (const item of employeeNavItems.slice(0, 4)) {
      expect(within(bar()).getByText(item.label)).toBeInTheDocument();
    }
    expect(within(bar()).getByText('More')).toBeInTheDocument();
  });

  it('draws icons at the size the tab asks for', () => {
    renderNav();
    const icon = tab('Home').querySelector('svg');
    expect(icon).toHaveClass('h-6', 'w-6');
  });

  it('marks the current section with a tint the whole target carries, not an edge rule', () => {
    renderNav('time-off');
    const active = tab('Time Off');
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('bg-primary/12');
    expect(tab('Home')).not.toHaveAttribute('aria-current');
    // The old marker was a 2px absolutely-positioned rule along the top of the bar.
    expect(bar().querySelectorAll('span.absolute')).toHaveLength(0);
  });

  it('gives every tab a target big enough to hit', () => {
    renderNav();
    for (const item of employeeNavItems.slice(0, 4)) {
      expect(tab(item.label).className).toContain('min-h-[52px]');
    }
  });

  it('reaches an overflow section through More and reports it as current', async () => {
    const onSelect = renderNav('files');
    const more = tab('More');
    // The active section lives behind More, so More itself has to say so.
    expect(more).toHaveAttribute('aria-current', 'page');

    await userEvent.click(more);
    const sheet = screen.getByRole('dialog', { name: 'More sections' });
    await userEvent.click(within(sheet).getByRole('button', { name: /^Files$/i }));

    expect(onSelect).toHaveBeenCalledWith('files');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the More sheet on Escape', async () => {
    renderNav();
    await userEvent.click(tab('More'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers only the modules the session may reach', () => {
    canAccessModule.mockImplementation((id: string) => id === 'home' || id === 'timesheet');
    renderNav();
    expect(within(bar()).getByText('Timesheet')).toBeInTheDocument();
    expect(within(bar()).queryByText('Payroll')).not.toBeInTheDocument();
    // Two items fit as primary tabs, so nothing overflows and More is not offered.
    expect(within(bar()).queryByText('More')).not.toBeInTheDocument();
  });
});

describe('navigation icons', () => {
  it('gives each module its own icon in both spaces', () => {
    for (const items of [employeeNavItems, adminNavItems]) {
      const shapes = items.map((item) => {
        const { container } = render(<div>{item.icon('h-6 w-6')}</div>);
        return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d')).join('|');
      });
      const duplicated = shapes.filter((shape, index) => shapes.indexOf(shape) !== index);
      expect(duplicated).toEqual([]);
    }
  });
});
