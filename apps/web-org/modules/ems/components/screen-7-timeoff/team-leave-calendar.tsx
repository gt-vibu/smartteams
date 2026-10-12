'use client';

import React, { useMemo, useState } from 'react';
import { LoadingIndicator, Badge, Button } from '@smarteam/ui';
import { formatDateRange } from '@smarteam/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession } from '../../hooks/auth-context';
import { useAsyncResource } from '../../hooks/use-async-resource';
import { PersonAvatar } from '../common/person-avatar';
import { leaveRepository } from '../../repositories/leave.repository';
import { localDateKey } from '../../lib/local-date';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const key = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Who is off this month, among the people you work with.
 *
 * Today's absences come first — the question most people open this to answer — then the month as
 * a list, which reads the same on a phone as on a desktop. Pending requests are shown and marked,
 * so a team sees a clash coming before it is approved.
 */
export function TeamLeaveCalendar() {
  const { session } = useSession();
  const organizationId = session?.organizationId ?? null;
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const from = new Date(Date.UTC(month.year, month.month, 1));
  const to = new Date(Date.UTC(month.year, month.month + 1, 0));

  const calendar = useAsyncResource(
    () => leaveRepository.calendar(organizationId!, key(from), key(to)),
    [organizationId, month.year, month.month],
    { enabled: Boolean(organizationId) },
  );
  const entries = useMemo(() => calendar.data ?? [], [calendar.data]);
  const today = localDateKey(now);
  const offToday = entries.filter(
    (entry) => entry.status === 'APPROVED' && entry.startDate <= today && entry.endDate >= today,
  );
  const step = (by: number) =>
    setMonth(({ year, month: m }) => {
      const next = new Date(Date.UTC(year, m + by, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });

  return (
    <section aria-label="Team leave calendar" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-foreground">Who&apos;s off</h2>
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous month"
            onClick={() => step(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-xs font-semibold tabular-nums text-foreground">
            {MONTHS[month.month]} {month.year}
          </span>
          <Button
            aria-label="Next month"
            onClick={() => step(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {offToday.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Off today
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {offToday.map((entry) => (
              <li
                className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
                key={entry.id}
              >
                <PersonAvatar name={entry.name} size="sm" />
                {entry.isYou ? 'You' : entry.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {calendar.loading ? (
        <LoadingIndicator variant="panel" label="Loading the calendar" className="py-6 text-center text-xs text-muted-foreground" />
      ) : calendar.error ? (
        <p
          className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-destructive"
          role="alert"
        >
          {calendar.error}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
          Nobody you work with is off in {MONTHS[month.month]}.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {entries.map((entry) => (
            <li className="flex items-center gap-3 px-4 py-2.5" key={entry.id}>
              <PersonAvatar name={entry.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {entry.isYou ? `${entry.name} (you)` : entry.name}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatDateRange(entry.startDate, entry.endDate)} · {entry.days}{' '}
                  {entry.days === 1 ? 'day' : 'days'}
                  {entry.type ? ` · ${entry.type}` : ''}
                </span>
              </span>
              {entry.status === 'PENDING' && <Badge variant="secondary">Requested</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
