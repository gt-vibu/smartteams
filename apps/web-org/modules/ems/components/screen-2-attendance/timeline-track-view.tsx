import React from 'react';
import type { TimelineDayRecord } from '../../types/attendance-timeline.types';
import { formatMinutesToDuration } from '../../utils/format.utils';
import { HOLIDAY_CONFLICT_PILL } from '../../services/holiday-conflict-view';
import { axisTicks, onAxis, type TimelineAxis } from '../../services/timeline-axis';

/** The track's colours for a check-in on an approved optional holiday, by its review state. */
const CONFLICT_TRACK = {
  attention: { line: 'bg-amber-300', in: 'bg-amber-500', out: 'bg-amber-700' },
  holiday: { line: 'bg-cyan-200', in: 'bg-cyan-400', out: 'bg-cyan-600' },
  working: { line: 'bg-emerald-300', in: 'bg-emerald-500', out: 'bg-rose-500' },
} as const;

interface TimelineTrackViewProps {
  days: TimelineDayRecord[];
  onSelectDay?: (dayId: string) => void;
  /** The hours the ruler spans: the shift with room either side (see `timelineAxis`). */
  axis?: TimelineAxis;
}

const WHOLE_DAY: TimelineAxis = { startHour: 0, endHour: 24 };
/** Two punches closer than this share one label: side by side, their times ran into each other. */
const SHARED_LABEL_PERCENT = 10;

/**
 * A week of attendance as tracks against the working day.
 *
 * On a laptop each day is one row: label, track, total. On a phone that row was held at 580px
 * inside its own horizontal scroller. It now stacks — label and total on one line, the times as
 * text under them, the track full-width beneath — so the whole week reads top to bottom. The
 * check-in and check-out stamps move off the track below `sm`: at phone width a short shift puts
 * the two dots about 30px apart, and their labels landed on top of each other.
 */
export function TimelineTrackView({ days, onSelectDay, axis = WHOLE_DAY }: TimelineTrackViewProps) {
  // The ruler and the punches share one scale, so a stamp always sits under its own hour.
  const ticks = axisTicks(axis);
  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-card">
      {/* Header: on a phone the ruler drops beneath "Day / Total" and spans the full width, exactly
          as each day's track does, so the hours still line up with the bars below. */}
      <div className="grid grid-cols-2 gap-y-2 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground sm:grid-cols-12">
        <div className="text-xs font-bold text-foreground sm:col-span-2">Day</div>
        <div className="text-right text-xs font-bold text-foreground sm:order-last sm:col-span-2">
          Total hours
        </div>
        <div className="relative col-span-2 mx-2 h-4 sm:col-span-8">
          {ticks.map((tick, index) => (
            // Every label on a laptop; every other one on a phone, where they would run together.
            <span
              key={tick.percent}
              className={`absolute whitespace-nowrap text-[10px] tabular-nums text-muted-foreground ${index % 2 ? 'invisible sm:visible' : ''}`}
              style={{
                left: `${tick.percent}%`,
                transform: `translateX(${index === 0 ? '0' : index === ticks.length - 1 ? '-100%' : '-50%'})`,
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative divide-y divide-slate-100 dark:divide-slate-800">
        {days.map((day) => (
          <TimelineRow key={day.id} day={day} onSelect={onSelectDay} axis={axis} ticks={ticks} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  day,
  onSelect,
  axis,
  ticks,
}: {
  day: TimelineDayRecord;
  onSelect?: (dayId: string) => void;
  axis: TimelineAxis;
  ticks: ReadonlyArray<{ percent: number }>;
}) {
  const durationStr = formatMinutesToDuration(day.workedMinutes);
  const inProgress = day.inProgressMinutes !== undefined;
  // `formatMinutesToDuration` returns '' below a minute, which would read as nothing at all in the
  // first sixty seconds after a check-in.
  const inProgressStr = inProgress
    ? formatMinutesToDuration(day.inProgressMinutes ?? 0) || '00h 00m'
    : '';
  const isSameTime = day.firstInTime && day.lastOutTime && day.firstInTime === day.lastOutTime;
  const sharedLabel =
    Boolean(day.lastOutTime && !isSameTime) &&
    day.spanStartPercent != null &&
    day.spanEndPercent != null &&
    onAxis(day.spanEndPercent, axis) - onAxis(day.spanStartPercent, axis) < SHARED_LABEL_PERCENT;
  const track = CONFLICT_TRACK[day.holidayConflict?.tone ?? 'working'];
  const times =
    day.status === 'PRESENT' && day.firstInTime
      ? `${day.firstInTime}${day.lastOutTime && !isSameTime ? ` → ${day.lastOutTime}` : ''}`
      : '';

  return (
    <div
      onClick={() => onSelect?.(day.id)}
      className={`grid grid-cols-2 items-center gap-y-2.5 px-4 py-3 transition-colors sm:grid-cols-12 sm:py-3.5 ${
        onSelect ? 'cursor-pointer' : ''
      } ${day.isToday ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
    >
      <div className="flex min-w-0 flex-col items-start gap-0.5 sm:col-span-2">
        {day.isToday ? (
          <span className="flex h-6 items-center justify-center rounded-[4px] bg-primary px-2 text-xs font-bold text-primary-foreground shadow-xs">
            {day.dayOfWeek} {day.dayLabel}
          </span>
        ) : (
          <span className="text-xs font-bold text-foreground">
            <span className="font-medium text-muted-foreground">{day.dayOfWeek}</span>{' '}
            {day.dayLabel}
          </span>
        )}
        {times && (
          <span className="text-[11px] tabular-nums text-muted-foreground sm:hidden">{times}</span>
        )}
      </div>

      <div className="text-right sm:order-last sm:col-span-2">
        <div
          className={`text-xs font-semibold tabular-nums ${
            inProgress
              ? 'text-primary'
              : day.checkOutMissing
                ? 'text-destructive'
                : 'text-foreground'
          }`}
        >
          {inProgress
            ? `${inProgressStr} so far`
            : day.checkOutMissing
              ? durationStr
                ? `${durationStr} + no check-out`
                : 'No check-out'
              : durationStr
                ? `${durationStr} worked`
                : day.status === 'LEAVE'
                  ? (day.leaveName ?? 'On leave')
                  : day.status === 'HOLIDAY'
                    ? (day.holidayName ?? 'Holiday')
                    : day.status === 'WEEKEND'
                      ? 'Weekend'
                      : day.status === 'ABSENT'
                        ? 'Absent'
                        : day.status === 'UPCOMING'
                          ? '—'
                          : day.isToday
                            ? 'Not checked in'
                            : 'Not worked'}
        </div>
        {inProgress && (
          <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">
            Still checked in
          </div>
        )}
        {day.checkOutMissing && (
          <div className="mt-1 flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(day.id);
              }}
              className="inline-flex h-6 items-center rounded-md border border-destructive/30 bg-destructive/10 px-2 text-[10px] font-bold text-destructive hover:bg-destructive/20 focus:outline-hidden cursor-pointer"
            >
              Request regularization
            </button>
          </div>
        )}
        {day.holidayConflict && (
          <span
            className={`mt-1 inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold ${HOLIDAY_CONFLICT_PILL[day.holidayConflict.tone]}`}
            title={day.holidayConflict.detail}
          >
            {day.holidayConflict.label}
          </span>
        )}
      </div>

      <div className="relative col-span-2 flex h-8 items-center px-2 sm:col-span-8">
        <div className="pointer-events-none absolute inset-y-0 left-2 right-2 opacity-40">
          {ticks.map((tick) => (
            <div
              key={tick.percent}
              className="absolute inset-y-0 border-l border-border"
              style={{ left: `${tick.percent}%` }}
            />
          ))}
        </div>

        {day.status === 'PRESENT' && (
          <div className="relative flex w-full items-center">
            <div className={`relative h-0.5 w-full rounded-full ${track.line}`}>
              {day.firstInTime && (
                <TrackStamp percent={onAxis(day.spanStartPercent ?? 0, axis)} dot={track.in}>
                  {sharedLabel ? `${day.firstInTime} – ${day.lastOutTime}` : day.firstInTime}
                </TrackStamp>
              )}
              {day.lastOutTime && !isSameTime && (
                <TrackStamp percent={onAxis(day.spanEndPercent ?? 100, axis)} dot={track.out}>
                  {sharedLabel ? null : day.lastOutTime}
                </TrackStamp>
              )}
            </div>
          </div>
        )}

        {day.status === 'HOLIDAY' && (
          <TrackPill
            line="bg-cyan-200 dark:bg-cyan-900"
            pill="border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-200"
          >
            {day.holidayName || 'Holiday'}
          </TrackPill>
        )}

        {day.status === 'WEEKEND' && (
          <TrackPill
            line="bg-amber-200 dark:bg-amber-900"
            pill="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            Weekend
          </TrackPill>
        )}

        {day.status === 'LEAVE' && (
          <TrackPill
            line="bg-violet-200 dark:bg-violet-800"
            pill="border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200"
          >
            {day.leaveName ?? 'On leave'}
          </TrackPill>
        )}

        {day.status === 'ABSENT' && (
          <TrackPill
            line="bg-rose-200 dark:bg-rose-900"
            pill="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
          >
            Absent
          </TrackPill>
        )}

        {(day.status === 'EMPTY' || day.status === 'UPCOMING') && (
          <div className="h-0.5 w-full bg-slate-200/60 dark:bg-slate-700/60" />
        )}
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
    // Centred on its time; a label near either end is kept inside the track.
    <div
      className={`absolute -top-1.5 flex flex-col ${percent > 85 ? 'items-end' : percent < 10 ? 'items-start' : 'items-center'}`}
      style={{
        left: `${percent}%`,
        transform: `translateX(${percent > 85 ? 'calc(-100% + 7px)' : percent < 10 ? '-7px' : '-50%'})`,
      }}
    >
      <div className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow-xs ${dot}`} />
      {children && (
        <span className="mt-1 hidden whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground sm:inline">
          {children}
        </span>
      )}
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
