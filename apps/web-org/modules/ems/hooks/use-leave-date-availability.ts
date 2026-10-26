'use client';

import { useEffect, useMemo, useState } from 'react';
import { leaveRepository } from '../repositories/leave.repository';
import { useDataChanged } from '../lib/data-events';

export function leaveEndLimit(
  start: string,
  month: number,
  dates: Array<{ date: string; reason: string | null }>,
  maximum: string,
) {
  if (!start) return maximum;
  const year = Number(start.slice(0, 4)) - (Number(start.slice(5, 7)) < month ? 1 : 0);
  const periodEnd = new Date(Date.UTC(year + 1, month - 1, 0)).toISOString().slice(0, 10);
  const blocked = dates.find(
    (day) => day.date > start && day.reason === 'Already requested for leave',
  );
  const beforeBlocked = blocked
    ? new Date(new Date(`${blocked.date}T00:00:00Z`).getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
    : maximum;
  return [maximum, periodEnd, beforeBlocked].sort()[0]!;
}

export function useLeaveDateAvailability(
  open: boolean,
  organizationId: string | undefined,
  employeeId: string | null | undefined,
  start: string,
) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof leaveRepository.dateAvailability>
  > | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useDataChanged(['work-week', 'leave', 'holidays'], () => setAttempt((value) => value + 1));
  const bounds = useMemo(() => {
    const today = new Date();
    const from = new Date(today),
      to = new Date(today);
    from.setUTCFullYear(today.getUTCFullYear() - 2);
    to.setUTCFullYear(today.getUTCFullYear() + 2);
    return { min: from.toISOString().slice(0, 10), max: to.toISOString().slice(0, 10) };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    if (!open || !organizationId || !employeeId) return;
    void leaveRepository
      .dateAvailability(organizationId, bounds.min, bounds.max)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Could not load available leave dates.',
          );
      });
    return () => {
      active = false;
    };
  }, [open, organizationId, employeeId, bounds, attempt]);
  const reasons = useMemo(() => new Map(data?.dates.map((day) => [day.date, day.reason])), [data]);
  return {
    ...bounds,
    ready: Boolean(data),
    revision: data,
    error,
    retry: () => setAttempt((value) => value + 1),
    disabledDate: (date: string) =>
      !data
        ? 'Loading available dates'
        : reasons.has(date)
          ? (reasons.get(date) ?? undefined)
          : 'Outside the available calendar',
    endMax: data
      ? leaveEndLimit(start, data.leaveYearStartMonth, data.dates, bounds.max)
      : bounds.max,
  };
}
