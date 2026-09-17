import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEmsNavigation } from './use-ems-navigation';

/**
 * Choosing a module from Team.
 *
 * Team is one screen with no modules. On a phone it now has the bottom bar, whose tabs are
 * modules — and merging a module into Team changed the URL and nothing on screen. A module chosen
 * from Team is a module of My Space.
 */
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useEmsNavigation.navigateToModule', () => {
  it('leaves Team for My Space when a module is chosen', () => {
    window.history.replaceState(null, '', '/?space=team');
    const { result } = renderHook(() => useEmsNavigation());
    expect(result.current.activeSpace).toBe('Team');

    act(() => result.current.navigateToModule('attendance'));

    expect(result.current.activeSpace).toBe('My Space');
    expect(result.current.activeModule).toBe('attendance');
    expect(new URLSearchParams(window.location.search).get('space')).toBe('my-space');
  });

  it('stays in the space it was called from anywhere else', () => {
    window.history.replaceState(null, '', '/?space=organization');
    const { result } = renderHook(() => useEmsNavigation());

    act(() => result.current.navigateToModule('payroll'));

    expect(result.current.activeSpace).toBe('Organization');
    expect(result.current.activeModule).toBe('payroll');
  });
});
