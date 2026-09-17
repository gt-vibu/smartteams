'use client';

import React from 'react';

/**
 * The page container every screen sits in: one max-width, one set of gutters, one rhythm.
 *
 * Before this existed, eighteen screens each declared their own `max-w-[1380px] px-4 sm:px-6`
 * *inside* the shell's own `max-w-[1400px] px-3.5 sm:px-6 lg:px-8`. Two consequences followed
 * from that, and both are visible on screen. The gutters compounded, so content sat ~56px from
 * the rail on a wide display while the header above it sat at 32px — the "nothing lines up"
 * feeling. And because each screen owned its own copy, the values drifted: `px-4` against `px-3`,
 * six different vertical paddings, four different section gaps. Screens that should have looked
 * like one application looked like a set of documents that happened to share a chrome.
 *
 * The shell now supplies the scroll canvas and nothing else; this supplies the measurements. A
 * screen states what kind of page it is, not how many pixels it would like.
 */

/** Vertical rhythm between a page's top-level sections. */
const GAP = {
  /** Ordinary screens: header, controls, content. */
  default: 'space-y-4',
  /** Dense, table-led screens where the toolbar belongs tight against its table. */
  tight: 'space-y-3',
  /** The screen manages its own spacing — grids and split layouts that are not a stack. */
  none: '',
} as const;

export type PageGap = keyof typeof GAP;

export function PageShell({
  children,
  className = '',
  gap = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  gap?: PageGap;
}) {
  return (
    <div
      className={`mx-auto flex w-full max-w-[1400px] flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8 ${GAP[gap]} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A full-bleed strip inside a `PageShell` — a sticky tab bar, a section divider that should meet
 * the page edges rather than stopping at the text column.
 *
 * The negative margins mirror `PageShell`'s padding exactly. They are stated once here so a
 * screen never has to keep its own `-mx-4 sm:-mx-6` in sync with a gutter it does not control,
 * which is precisely how the organization workspace's header drifted out of alignment with the
 * content beneath it.
 */
export function PageBleed({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`-mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 ${className}`}>{children}</div>
  );
}
