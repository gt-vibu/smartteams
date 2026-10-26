'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A navigational tile: an icon in a tinted chip, a label, and a line saying what is behind it.
 *
 * The grid this replaces was label-and-caption text in a bordered box — correct, and completely
 * flat. A row of ten identical rectangles gives the eye nothing to aim at, so finding "Payroll"
 * meant reading every tile rather than recognising one.
 *
 * The chip tint is the whole point and also the whole risk. Ten saturated colours would be a
 * novelty dashboard; these are drawn from the theme's own semantic tokens at low opacity, so they
 * read as quiet category marks and stay legible on both grounds.
 */

export type TileTone = 'primary' | 'accent' | 'success' | 'warning' | 'neutral';

/**
 * Token-driven, not literal colours. Each pairs a translucent fill with a solid foreground from
 * the same family, so the chip holds its contrast in light and dark without a second definition.
 */
const TONES: Record<TileTone, string> = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
  neutral: 'bg-muted text-muted-foreground',
};

export function ModuleTile({
  detail,
  icon: TileIcon,
  label,
  onClick,
  tone = 'neutral',
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  tone?: TileTone;
}) {
  return (
    <button
      className="group flex w-full items-start gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
      onClick={onClick}
      type="button"
    >
      <span
        aria-hidden="true"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}
      >
        <TileIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
