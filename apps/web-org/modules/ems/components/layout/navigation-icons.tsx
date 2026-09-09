import React from 'react';

/**
 * The icon set both navigations draw from.
 *
 * The two item files each carried their own copy of the same path data, which is how `Leave` and
 * `Time Off` both ended up as a cloud, `Timesheet` and `Shifts` as the same clock, and `Files` and
 * `Projects` as the same folder. An icon that describes a different module than the one it labels
 * is a wayfinding bug: on the mobile bar the icon is most of what a person has to go on.
 *
 * One export per meaning, so a duplicate is visible here rather than diffused across two files.
 */
type Icon = (className: string) => React.ReactNode;

/** Every icon is the same 24px outline geometry, so they sit together without optical rebalancing. */
function outline(d: string | string[]): Icon {
  const paths = Array.isArray(d) ? d : [d];
  return (className: string) => (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path key={path} strokeLinecap="round" strokeLinejoin="round" d={path} />
      ))}
    </svg>
  );
}

export const navIcons = {
  /** A house. The employee's own landing screen. */
  home: outline(
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  ),
  /** An office block. The organization's landing screen, distinct from the employee's house. */
  building: outline(
    'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  ),
  /** A sun: time away from work. It replaced a cloud, which said nothing about leave. */
  timeOff: outline([
    'M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364-6.364l-1.06 1.06M6.696 17.304l-1.06 1.06m12.728 0l-1.06-1.06M6.696 6.696l-1.06-1.06',
    'M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  ]),
  /** A calendar of dated days: the published holiday list. */
  holidays: outline(
    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  ),
  /** A clipboard of lines: hours written down and submitted, not a clock face. */
  timesheet: outline([
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2',
    'M9 5a2 2 0 002 2h2a2 2 0 002-2 2 2 0 00-2-2h-2a2 2 0 00-2 2z',
    'M9 12h6m-6 4h4',
  ]),
  /** A fingerprint: the act of clocking in, and the only icon that is about presence. */
  attendance: outline([
    'M7.9 4.2A7.5 7.5 0 0119.5 10.5c0 2.9-.6 5.7-1.6 8.3',
    'M5.7 6.4A7.5 7.5 0 004.5 10.5c0 1.4-.4 2.8-1.2 4',
    'M6.3 18.1A11.2 11.2 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .5 0 1-.1 1.6',
    'M12 10.5a14.9 14.9 0 01-3.6 9.8m6.7-4.6a18.7 18.7 0 01-2.5 5.3',
  ]),
  /** A clock: when someone is rostered to work. */
  shifts: outline('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'),
  /** A folder: work grouped into projects. */
  projects: outline('M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'),
  /** A coin: money paid out. */
  payroll: outline(
    'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  ),
  /** A checked circle: things waiting on a decision. */
  approvals: outline('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'),
  /** A written page: documents, as opposed to the folder that means projects. */
  files: outline([
    'M19 9.4V19a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a1 1 0 01.7.3l5.4 5.4a1 1 0 01.3.7z',
    'M9 13h6m-6 4h4',
  ]),
  /** A group of people. */
  teams: outline(
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  ),
  /** A person being added. */
  onboarding: outline(
    'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
  ),
} satisfies Record<string, Icon>;
