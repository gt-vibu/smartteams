import React from 'react';
import type { TimelineDayRecord } from '../../types/attendance-timeline.types';
import { formatMinutesToDuration } from '../../utils/format.utils';

interface TimelineTrackViewProps {
  days: TimelineDayRecord[];
}

const HOURS_SCALE = [
  '10 AM',
  '11 AM',
  '12 PM',
  '01 PM',
  '02 PM',
  '03 PM',
  '04 PM',
  '05 PM',
  '06 PM',
];

/**
 * A week of attendance as tracks against the working day.
 *
 * On a laptop each day is one row: label, track, total. On a phone that row was held at 580px
 * inside its own horizontal scroller. It now stacks — label and total on one line, the times as
 * text under them, the track full-width beneath — so the whole week reads top to bottom. The
 * check-in and check-out stamps move off the track below `sm`: at phone width a short shift puts
 * the two dots about 30px apart, and their labels landed on top of each other.
 */
export function TimelineTrackView({ days }: TimelineTrackViewProps) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-card">
      {/* Header: on a phone the ruler drops beneath "Day / Total" and spans the full width, exactly
          as each day's track does, so the hours still line up with the bars below. */}
      <div className="grid grid-cols-2 gap-y-2 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground sm:grid-cols-12">
        <div className="text-xs font-bold text-foreground sm:col-span-2">Day</div>
        <div className="text-right text-xs font-bold text-foreground sm:order-last sm:col-span-2">
          Total hours
        </div>
        <div className="col-span-2 grid grid-cols-9 text-center sm:col-span-8">
          {HOURS_SCALE.map((hour, index) => (
            // Every hour on a laptop; every other hour on a phone, where nine labels in 310px
            // would run together.
            <span
              key={hour}
              className={`font-mono text-[10px] text-muted-foreground ${index % 2 ? 'invisible sm:visible' : ''}`}
            >
              {hour}
            </span>
          ))}
        </div>
      </div>

      <div className="relative divide-y divide-slate-100 dark:divide-slate-800">
        {/* A fixed guide at ~1:30 PM, not the current time. Drawn only where the track has the
            fixed desktop geometry it was placed against. */}
        <div className="pointer-events-none absolute bottom-0 top-0 z-10 hidden w-px border-r border-dashed border-sky-400 sm:block sm:left-[calc(16.666%+43.5%)]" />

        {days.map((day) => (
          <TimelineRow key={day.id} day={day} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({ day }: { day: TimelineDayRecord }) {
  const durationStr = formatMinutesToDuration(day.workedMinutes);
  const inProgress = day.inProgressMinutes !== undefined;
  // `formatMinutesToDuration` returns '' below a minute, which would read as nothing at all in the
  // first sixty seconds after a check-in.
  const inProgressStr = inProgress
    ? formatMinutesToDuration(day.inProgressMinutes ?? 0) || '00h 00m'
    : '';
  const isSameTime = day.firstInTime && day.lastOutTime && day.firstInTime === day.lastOutTime;
  const times =
    day.status === 'PRESENT' && day.firstInTime
      ? `${day.firstInTime}${day.lastOutTime && !isSameTime ? ` → ${day.lastOutTime}` : ''}`
      : '';

  return (
    <div
      className={`grid grid-cols-2 items-center gap-y-2.5 px-4 py-3 transition-colors sm:grid-cols-12 sm:py-3.5 ${
        day.isToday ? 'bg-sky-50/20' : 'hover:bg-muted/40'
      }`}
    >
      <div className="flex min-w-0 flex-col items-start gap-0.5 sm:col-span-2">
        {day.isToday ? (
          <span className="flex h-6 items-center justify-center rounded-[4px] bg-primary px-2 text-xs font-bold text-white shadow-xs">
            {day.dayLabel}
          </span>
        ) : (
          <span className="text-xs font-bold text-foreground">{day.dayLabel}</span>
        )}
        {times && (
          <span className="font-mono text-[11px] text-muted-foreground sm:hidden">{times}</span>
        )}
      </div>

      <div className="text-right sm:order-last sm:col-span-2">
        <div
          className={`font-mono text-xs font-bold ${inProgress ? 'text-primary' : 'text-foreground'}`}
        >
          {inProgress
            ? `${inProgressStr} so far`
            : durationStr
              ? `${durationStr} worked`
              : '00:00 Hrs worked'}
        </div>
        {inProgress && (
          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">
            Still checked in
          </div>
        )}
      </div>

      <div className="relative col-span-2 flex h-8 items-center px-2 sm:col-span-8">
        <div className="pointer-events-none absolute inset-0 grid grid-cols-9 opacity-40">
          {HOURS_SCALE.map((hour) => (
            <div key={hour} className="h-full border-r border-border" />
          ))}
        </div>

        {day.status === 'PRESENT' && (
          <div className="relative flex w-full items-center">
            <div className="relative h-0.5 w-full rounded-full bg-emerald-300">
              {day.firstInTime && (
                <TrackStamp percent={day.spanStartPercent ?? 0} dot="bg-emerald-500">
                  {day.firstInTime}
                </TrackStamp>
              )}
              {day.lastOutTime && !isSameTime && (
                <TrackStamp percent={day.spanEndPercent ?? 100} dot="bg-rose-500">
                  {day.lastOutTime}
                </TrackStamp>
              )}
            </div>
          </div>
        )}

        {day.status === 'HOLIDAY' && (
          <TrackPill line="bg-cyan-200" pill="border-cyan-200 bg-cyan-50 text-cyan-800">
            {day.holidayName || 'Holiday'}
          </TrackPill>
        )}

        {day.status === 'WEEKEND' && (
          <TrackPill line="bg-amber-200" pill="border-amber-200 bg-amber-50 text-amber-800">
            Weekend
          </TrackPill>
        )}

        {day.status === 'EMPTY' && <div className="h-0.5 w-full bg-slate-200/60" />}
      </div>
    </div>
  );
}

/** A check-in or check-out dot; its time is printed under it only where there is room. */
function TrackStamp({
  percent,
  dot,
  children,
}: {
  percent: number;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute -top-1.5 flex flex-col items-center" style={{ left: `${percent}%` }}>
      <div className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${dot}`} />
      <span className="mt-1 hidden whitespace-nowrap font-mono text-[10px] font-semibold text-foreground sm:inline">
        {children}
      </span>
    </div>
  );
}

function TrackPill({
  line,
  pill,
  children,
}: {
  line: string;
  pill: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex w-full min-w-0 items-center justify-center">
      <div className={`absolute h-0.5 w-full ${line}`} />
      <span
        className={`relative z-10 max-w-full truncate rounded-full border px-3 py-0.5 text-[11px] font-semibold shadow-xs ${pill}`}
      >
        {children}
      </span>
    </div>
  );
}
