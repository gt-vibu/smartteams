import { act, renderHook } from '@testing-library/react';
import { useBackToClose } from '@smarteam/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useBackToClose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('does not close the underlying overlay when the top overlay closes itself', () => {
    const closeSheet = vi.fn();
    const closeDialog = vi.fn();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    const { rerender, unmount } = renderHook(
      ({ sheetOpen, dialogOpen }) => {
        useBackToClose(sheetOpen, closeSheet);
        useBackToClose(dialogOpen, closeDialog);
      },
      { initialProps: { sheetOpen: true, dialogOpen: true } },
    );

    rerender({ sheetOpen: true, dialogOpen: false });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(closeSheet).not.toHaveBeenCalled();
    expect(closeDialog).not.toHaveBeenCalled();

    // A real Back afterwards, once the step back has settled, closes the sheet.
    act(() => {
      vi.runOnlyPendingTimers();
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(closeSheet).toHaveBeenCalledTimes(1);

    back.mockRestore();
    unmount();
  });

  it('keeps the outer dialog open when the pop from closing the inner one arrives later', () => {
    // Browsers deliver the pop from `history.back()` after the call returns, and do not promise
    // to run a marking listener first. The dialog underneath closed with the one on top.
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
      setTimeout(() => window.dispatchEvent(new PopStateEvent('popstate')), 5);
    });

    const { rerender, unmount } = renderHook(
      ({ outer, inner }) => {
        useBackToClose(outer, closeOuter);
        useBackToClose(inner, closeInner);
      },
      { initialProps: { outer: true, inner: true } },
    );

    rerender({ outer: true, inner: false });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();

    back.mockRestore();
    unmount();
    act(() => {
      vi.runAllTimers();
    });
  });

  it('preserves router-owned history state when it adds an overlay entry', () => {
    window.history.replaceState({ __NA: true, route: '/employees' }, '', '/');

    const { unmount } = renderHook(() => useBackToClose(true, vi.fn()));

    expect(window.history.state).toEqual({
      __NA: true,
      route: '/employees',
      emsOverlay: true,
    });

    window.history.replaceState(null, '', '/');
    unmount();
  });
});
