'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from './cn';

/** Radix adds collision detection, portalling and outside-click/escape dismissal. */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/** The dialog open on top, if any: while one is modal, nothing outside it can be used. */
function openDialog(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const open = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]');
  return open[open.length - 1];
}

/**
 * Rendered inside the dialog it was opened from, when there is one. A modal dialog blocks wheel
 * scrolling everywhere outside itself, so a list portalled to the body — the lead picker in the
 * project drawer — could only be scrolled by dragging its scrollbar.
 */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    container?: HTMLElement | null;
  }
>(({ className, align = 'center', sideOffset = 4, container, ...props }, ref) => {
  // Read once as it opens: the content only mounts while open, so this is the dialog of the moment.
  const [host] = React.useState(() => container ?? openDialog());
  return (
    <PopoverPrimitive.Portal container={host}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-[60] w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
