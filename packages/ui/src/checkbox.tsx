'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cn } from './cn';

export type CheckboxProps = React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>;

/**
 * `onCheckedChange` now also emits Radix's `"indeterminate"` state. Existing call sites pass a
 * `(checked: boolean) => void`, which stays assignable because `CheckedState` widens it.
 */
const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer size-4 shrink-0 rounded-sm border border-input shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn('grid place-items-center text-current')}>
        <svg
          aria-hidden="true"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          viewBox="0 0 24 24"
        >
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  ),
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
