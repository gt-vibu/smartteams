import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useScreenTab } from './use-screen-tab';

/**
 * Back should step through tabs.
 *
 * Tabs were local state, so three deliberate tab changes produced one history entry and Back
 * left the screen entirely instead of returning to the previous tab.
 *
 * jsdom implements pushState but not Back, so these drive `history.back()` through a small
 * stack and dispatch `popstate` the way a browser would.
 */

const TABS = ['structure', 'payslips', 'advances'] as const;

function search() {
  return window.location.search;
}

/** Applies a URL and fires popstate, which is what pressing Back does. */
function goTo(url: string) {
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useScreenTab', () => {
  it('starts on the default with a clean URL', () => {
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    expect(result.current[0]).toBe('structure');
    expect(search()).toBe('');
  });

  it('writes the tab to the query string so it can be linked and reloaded', () => {
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    act(() => result.current[1]('payslips'));

    expect(result.current[0]).toBe('payslips');
    expect(search()).toContain('payrollTab=payslips');
  });

  it('adds a history entry per tab, so Back returns to the previous tab', () => {
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));
    const before = window.history.length;

    act(() => result.current[1]('payslips'));
    act(() => result.current[1]('advances'));

    expect(window.history.length).toBe(before + 2);
  });

  it('follows Back to the previous tab rather than leaving the screen', () => {
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    act(() => result.current[1]('payslips'));
    act(() => result.current[1]('advances'));
    expect(result.current[0]).toBe('advances');

    act(() => goTo('/?payrollTab=payslips'));
    expect(result.current[0]).toBe('payslips');

    act(() => goTo('/'));
    expect(result.current[0]).toBe('structure');
  });

  it('follows Forward as well', () => {
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    act(() => goTo('/?payrollTab=advances'));

    expect(result.current[0]).toBe('advances');
  });

  it('restores the tab from a pasted link', () => {
    window.history.replaceState(null, '', '/?payrollTab=advances');
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    expect(result.current[0]).toBe('advances');
  });

  it('falls back to the default for a tab this screen does not have', () => {
    // The query string is user input. A stale or hand-edited link must not render an empty view.
    window.history.replaceState(null, '', '/?payrollTab=nonsense');
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    expect(result.current[0]).toBe('structure');
  });

  it('keeps the other navigation parameters intact', () => {
    // The space and module live in the same query string; rebuilding it from this hook alone
    // would drop them and throw the workspace back to its default screen.
    window.history.replaceState(null, '', '/?space=my-space&module=payroll');
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    act(() => result.current[1]('payslips'));

    expect(search()).toContain('space=my-space');
    expect(search()).toContain('module=payroll');
    expect(search()).toContain('payrollTab=payslips');
  });

  it('drops its parameter again when the default is reselected', () => {
    window.history.replaceState(null, '', '/?space=my-space');
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));

    act(() => result.current[1]('payslips'));
    act(() => result.current[1]('structure'));

    expect(search()).toContain('space=my-space');
    expect(search()).not.toContain('payrollTab');
  });

  it('does not confuse two screens sharing a page', () => {
    const payroll = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));
    const leave = renderHook(() =>
      useScreenTab('leaveTab', ['requests', 'balances'] as const, 'requests'),
    );

    act(() => payroll.result.current[1]('advances'));

    expect(leave.result.current[0]).toBe('requests');
    expect(payroll.result.current[0]).toBe('advances');
  });

  it('returns to its default when another navigation clears the parameter', () => {
    // Leaving a module and coming back must not resurrect the tab from last time.
    const { result } = renderHook(() => useScreenTab('payrollTab', TABS, 'structure'));
    act(() => result.current[1]('advances'));

    act(() => {
      window.history.replaceState(null, '', '/?space=my-space&module=payroll');
    });
    // No popstate — this is another hook rewriting the query string in place.
    act(() => result.current[1]('advances'));

    expect(search()).toContain('module=payroll');
  });
});
