'use client';

import { useEffect, useRef } from 'react';
import type { HolidayConflict } from '@smarteam/contracts';

/**
 * "The server changed this; read it again", across hooks that do not share state.
 *
 * Each screen loads through its own hook, so a decision recorded on the Approvals screen left the
 * attendance, holiday and payroll hooks mounted elsewhere showing what they read before it. A
 * topic here is only a signal to refetch — it carries no data, so nothing is ever shown that the
 * server did not return.
 */
export type DataTopic = 'attendance' | 'holidays' | 'approvals' | 'payroll';

const EVENT = 'smarteam:data-changed';

export function emitDataChanged(...topics: DataTopic[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DataTopic[]>(EVENT, { detail: topics }));
}

/** Calls `refetch` whenever one of `topics` is announced as changed. */
export function useDataChanged(topics: readonly DataTopic[], refetch: () => unknown) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const key = topics.join(',');
  useEffect(() => {
    const wanted = new Set(key.split(','));
    const listener = (event: Event) => {
      const changed = (event as CustomEvent<DataTopic[]>).detail;
      if (changed.some((topic) => wanted.has(topic))) void refetchRef.current();
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [key]);
}

const HOLIDAY_CHECK_IN_EVENT = 'smarteam:holiday-check-in';

/** A check-in the API reported as landing on the employee's approved optional holiday. */
export function announceHolidayCheckIn(conflict: HolidayConflict) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<HolidayConflict>(HOLIDAY_CHECK_IN_EVENT, { detail: conflict }),
  );
}

export function useHolidayCheckInAnnouncements(onCheckIn: (conflict: HolidayConflict) => void) {
  const handlerRef = useRef(onCheckIn);
  handlerRef.current = onCheckIn;
  useEffect(() => {
    const listener = (event: Event) =>
      handlerRef.current((event as CustomEvent<HolidayConflict>).detail);
    window.addEventListener(HOLIDAY_CHECK_IN_EVENT, listener);
    return () => window.removeEventListener(HOLIDAY_CHECK_IN_EVENT, listener);
  }, []);
}
