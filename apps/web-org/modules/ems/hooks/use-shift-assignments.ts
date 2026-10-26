'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShiftAssignment } from '@smarteam/contracts';
import { useSession } from './auth-context';
import { shiftsRepository } from '../repositories/shifts.repository';

/**
 * Who is on one shift, a page at a time, and ending an assignment.
 *
 * Every list shown is what the server returned; after an assignment is ended the first page is
 * read again rather than edited in place, so the row shows the server's new end date and state.
 */
export function useShiftAssignments(shiftId: string | null, includeEnded: boolean) {
  const { session } = useSession();
  const organizationId = session?.organizationId || null;
  const [items, setItems] = useState<ShiftAssignment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A late reply for a shift or filter no longer on screen must not overwrite the current one.
  const requestKey = useRef('');

  const load = useCallback(
    async (cursor?: string) => {
      if (!organizationId || !shiftId) return;
      const key = `${shiftId}:${includeEnded}`;
      requestKey.current = key;
      setLoading(true);
      setError(null);
      try {
        const page = await shiftsRepository.assignments(organizationId, {
          shiftId,
          includeEnded,
          ...(cursor ? { cursor } : {}),
        });
        if (requestKey.current !== key) return;
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (caught) {
        if (requestKey.current !== key) return;
        setError(caught instanceof Error ? caught.message : 'Assignments could not be loaded.');
      } finally {
        if (requestKey.current === key) setLoading(false);
      }
    },
    [organizationId, shiftId, includeEnded],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load();
  }, [load]);

  /** Ends an assignment; rejects with the API's reason so the form can show it. */
  const end = useCallback(
    async (assignmentId: string, endsOn: string, reason: string) => {
      if (!organizationId) throw new Error('No organization is selected.');
      try {
        await shiftsRepository.endAssignment(organizationId, assignmentId, { endsOn, reason });
      } finally {
        await load();
      }
    },
    [organizationId, load],
  );

  return {
    items,
    loading,
    error,
    hasMore: nextCursor !== null,
    loadMore: () => (nextCursor ? load(nextCursor) : Promise.resolve()),
    refetch: () => load(),
    end,
  };
}
