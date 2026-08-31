'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from './cn';

/** Semantic intent, mapped to theme tokens so the bar follows light/dark like everything else. */
export type ProgressTone = 'default' | 'success' | 'warning' | 'destructive';

const TONE_CLASSES: Record<ProgressTone, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

export interface ProgressProps extends React.ComponentPropsWithoutRef<
  typeof ProgressPrimitive.Root
> {
  /** 0-100. Values outside the range are clamped. */
  value?: number;
  tone?: ProgressTone;
}

/**
 * Determinate progress bar.
 *
 * Replaces hand-rolled `<div>` pairs that hardcoded `bg-slate-100` / `bg-emerald-500`, so they
 * ignored the theme and announced nothing to assistive technology. Radix supplies the
 * `role="progressbar"` semantics and the aria value attributes.
 */
const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value = 0, tone = 'default', ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
        value={clamped}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn('size-full flex-1 rounded-full transition-transform', TONE_CLASSES[tone])}
          style={{ transform: `translateX(-${100 - clamped}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);
Progress.displayName = ProgressPrimitive.Root.displayName;

/** Picks a tone from completion, so callers do not repeat the same threshold logic. */
export function progressTone(percent: number): ProgressTone {
  if (percent >= 100) return 'success';
  if (percent >= 50) return 'default';
  return 'warning';
}

export { Progress };
