import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAsyncResource } from './use-async-resource';
import { ApiError } from '../lib/api-client';

describe('useAsyncResource', () => {
  it('loads data and clears the loading flag', async () => {
    const load = vi.fn().mockResolvedValue(['a', 'b']);
    const { result } = renderHook(() => useAsyncResource(load, []));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
  });

  it('surfaces an error and leaves data null — it never substitutes fallback data', async () => {
    const load = vi.fn().mockRejectedValue(new ApiError('Server unavailable', 500));
    const { result } = renderHook(() => useAsyncResource(load, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // The critical assertion: a failed request must not leave the screen with content to show.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Server unavailable');
    expect(result.current.forbidden).toBe(false);
  });

  it('distinguishes a 403 so the UI can say "not authorized" rather than "failed"', async () => {
    const load = vi.fn().mockRejectedValue(new ApiError('Not authorized', 403));
    const { result } = renderHook(() => useAsyncResource(load, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forbidden).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('does not request while disabled', async () => {
    const load = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useAsyncResource(load, [], { enabled: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('refetches on demand without blanking already-rendered data', async () => {
    const load = vi.fn().mockResolvedValueOnce(['first']).mockResolvedValueOnce(['second']);
    const { result } = renderHook(() => useAsyncResource(load, []));
    await waitFor(() => expect(result.current.data).toEqual(['first']));

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual(['second']);
    // A refetch uses `refreshing`, not `loading`, so the screen does not flash a skeleton.
    expect(result.current.loading).toBe(false);
  });

  it('clears stale data when a refetch fails', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(['first'])
      .mockRejectedValueOnce(new ApiError('gone', 500));
    const { result } = renderHook(() => useAsyncResource(load, []));
    await waitFor(() => expect(result.current.data).toEqual(['first']));

    await act(async () => {
      await result.current.refetch();
    });

    // Showing the previous response after a failure would misrepresent server state.
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('gone');
  });

  it('reloads when a dependency changes', async () => {
    const load = vi.fn().mockResolvedValue([]);
    const { rerender } = renderHook(({ id }) => useAsyncResource(load, [id]), {
      initialProps: { id: 'org-a' },
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    rerender({ id: 'org-b' });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
