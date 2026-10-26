import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCursorPages } from './use-cursor-pages';

describe('list filter changes', () => {
  it('clearing a search starts at page one rather than resurrecting an old cursor', () => {
    const { result, rerender } = renderHook(({ filter }) => useCursorPages(filter), {
      initialProps: { filter: 'all' },
    });
    act(() => result.current.next('page-two'));
    expect(result.current.page).toBe(2);
    rerender({ filter: 'Ada' });
    expect(result.current.page).toBe(1);
    rerender({ filter: 'all' });
    expect(result.current.page).toBe(1);
    expect(result.current.cursor).toBeUndefined();
  });
});
