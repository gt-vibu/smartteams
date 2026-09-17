'use client';

import * as React from 'react';
import { cn } from './cn';

/**
 * Underline tabs for switching a view.
 *
 * Two problems in the hand-rolled versions this replaces:
 *
 *  1. The strip used `overflow-x-auto`, which makes a scroll container that also clips
 *     vertically. The active underline and the focus ring sat on that boundary and were shaved
 *     off, which read as the tab being cut. The scroller here carries its own vertical padding
 *     so nothing is drawn at the clip edge.
 *
 *  2. Selecting a tab filled the whole control with the category colour. Colour now stays a
 *     small dot; selection is carried by weight and the underline. A status hue is information
 *     about the category, not a way to shout that a button was clicked.
 */

export interface SegmentedTabItem {
  id: string;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
  /**
   * Semantic category colour, as any CSS colour. Rendered as a small dot beside the label —
   * never as the tab's background.
   */
  tone?: string;
  disabled?: boolean;
}

export interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  value: string;
  onValueChange: (id: string) => void;
  'aria-label': string;
  className?: string;
}

export function SegmentedTabs({
  items,
  value,
  onValueChange,
  className,
  ...rest
}: SegmentedTabsProps) {
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());

  // Arrow-key roving focus, which is what a tablist is expected to do.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === value);
    if (index === -1) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % enabled.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else return;
    event.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onValueChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  return (
    <div
      aria-label={rest['aria-label']}
      className={cn(
        // `overflow-y-visible` cannot coexist with `overflow-x-auto`, so the indicator is kept
        // away from the clip edge with padding instead of relying on overflow.
        'flex items-stretch gap-1 overflow-x-auto py-1 no-scrollbar',
        className,
      )}
      onKeyDown={onKeyDown}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            aria-selected={isActive}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2',
              'text-xs transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isActive
                ? 'font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
            disabled={item.disabled}
            key={item.id}
            onClick={() => onValueChange(item.id)}
            ref={(node) => {
              refs.current.set(item.id, node);
            }}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {item.tone && (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.tone }}
              />
            )}
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  isActive ? 'bg-muted text-foreground' : 'bg-muted/70 text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            )}
            {/* The underline is a child, not a border on the button, so it cannot be trimmed by
                the button's own box and sits clear of the scroller's edge. */}
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-x-2 -bottom-1 h-0.5 rounded-full',
                isActive ? 'bg-foreground' : 'bg-transparent',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
