'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { TileTone } from './module-tile';

/**
 * The heading every screen opens with.
 *
 * Each screen previously wrote its own `<h1>` and subtitle, which drifted: some had an action
 * button beside them and some below, spacing varied, and none carried anything to recognise a
 * page by. The icon chip is the same device the module tiles use, so arriving at a screen from a
 * tile lands on the same mark you just clicked.
 *
 * `actions` sits opposite the title and wraps beneath it on a narrow viewport rather than
 * squeezing the heading.
 */

const TONES: Record<TileTone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  neutral: 'bg-muted text-muted-foreground',
};

export function ScreenHeader({
  actions,
  description,
  icon: HeaderIcon,
  title,
  tone = 'neutral',
}: {
  actions?: React.ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
  tone?: TileTone;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}
        >
          <HeaderIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-foreground">{title}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}
