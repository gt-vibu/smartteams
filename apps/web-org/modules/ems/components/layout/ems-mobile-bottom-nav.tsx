'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { adminNavItems } from './navigation-admin-items';
import { employeeNavItems } from './navigation-employee-items';
import type { NavItem } from './navigation-items';

interface EmsMobileBottomNavProps {
  activeModule: string;
  onSelectModule: (module: string) => void;
  activeSpace: string;
}

/**
 * The bar is 4rem tall plus the device's home-indicator inset. Two other places have to agree with
 * that number — the scroll container's bottom padding in `ems-layout`, and the sheet's offset
 * below — so it is written the same way in both rather than rounded differently in each.
 */
const BAR_OFFSET = 'calc(4rem + env(safe-area-inset-bottom))';

/**
 * A tinted pill, not a hairline.
 *
 * The active tab used to be marked by a 2px rule along the top edge of the bar, which sits against
 * the bar's own border and reads as part of the chrome rather than as "you are here". The brand
 * tint fills the whole target, so the current section is legible at a glance, and it carries
 * `aria-current` for anyone not reading colour at all.
 */
const ACTIVE = 'bg-primary/12 text-primary dark:bg-primary/20';
const INACTIVE = 'text-muted-foreground active:bg-muted/60 hover:text-foreground';

export function EmsMobileBottomNav({
  activeModule,
  onSelectModule,
  activeSpace,
}: EmsMobileBottomNavProps) {
  const { canAccessModule } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMoreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setIsMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMoreOpen]);

  const candidateItems = activeSpace === 'Organization' ? adminNavItems : employeeNavItems;
  // Filtered in both spaces. The organization space used to skip the check entirely, so the
  // mobile bar offered every administrative module to anyone who could reach that space — while
  // the left rail, which never skipped it, showed the correct shorter list. Two navigations
  // disagreeing about the same permission set is the bug; `canAccessModule` is the one answer.
  const allItems = isMounted
    ? candidateItems.filter((item) => canAccessModule(item.id))
    : candidateItems;

  const PRIMARY_COUNT = 4;
  const primaryItems = allItems.slice(0, PRIMARY_COUNT);
  const overflowItems = allItems.slice(PRIMARY_COUNT);
  const hasOverflow = overflowItems.length > 0;
  const isOverflowActive = overflowItems.some((item) => item.id === activeModule);

  const handleSelect = (id: string) => {
    onSelectModule(id);
    setIsMoreOpen(false);
  };

  return (
    <>
      {isMoreOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={() => setIsMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {isMoreOpen && (
        <div
          ref={moreRef}
          role="dialog"
          aria-label="More sections"
          style={{ bottom: BAR_OFFSET }}
          className="fixed left-0 right-0 z-50 md:hidden bg-card border-t border-border rounded-t-2xl shadow-2xl px-3 pt-3 pb-4 animate-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              More sections
            </span>
            <button
              type="button"
              onClick={() => setIsMoreOpen(false)}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Three across, not four: at four a label like "Attendance" had 56px to sit in and wrapped
              to two lines of 10px type, which is where the panel stopped being readable. */}
          <div className="grid grid-cols-3 gap-1.5">
            {overflowItems.map((item) => (
              <NavTarget
                key={item.id}
                item={item}
                isActive={activeModule === item.id}
                onSelect={handleSelect}
                className="gap-2 rounded-xl px-1 py-3"
              />
            ))}
          </div>
        </div>
      )}

      <nav
        aria-label="Sections"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-card border-t border-border shadow-[0_-2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.3)]"
      >
        {primaryItems.map((item) => (
          <NavTarget
            key={item.id}
            item={item}
            isActive={activeModule === item.id}
            onSelect={handleSelect}
            className="flex-1 gap-1 rounded-xl mx-1 my-1.5 px-0.5 py-1.5"
          />
        ))}

        {hasOverflow && (
          <button
            type="button"
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            aria-expanded={isMoreOpen}
            aria-current={isOverflowActive ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-xl mx-1 my-1.5 px-0.5 py-1.5 min-h-[52px] transition-colors cursor-pointer ${
              isOverflowActive || isMoreOpen ? ACTIVE : INACTIVE
            }`}
          >
            <svg
              className="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
              />
            </svg>
            <span className="text-[11px] font-semibold leading-none">More</span>
          </button>
        )}
      </nav>
    </>
  );
}

/**
 * One tab. Deliberately a plain `button` rather than the shared `Button`: that component's base
 * sets `h-8` and `[&_svg]:size-3.5`, and both won here — the fixed height cropped the label out of
 * the bar entirely, and the descendant selector out-specified each icon's own `h-5 w-5`, which is
 * why every icon rendered at 14px.
 */
function NavTarget({
  item,
  isActive,
  onSelect,
  className,
}: {
  item: NavItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={isActive ? 'page' : undefined}
      className={`flex flex-col items-center justify-center min-h-[52px] transition-colors cursor-pointer ${className} ${
        isActive ? ACTIVE : INACTIVE
      }`}
    >
      {item.icon('h-6 w-6 shrink-0')}
      <span className="text-[11px] font-semibold leading-none text-center truncate max-w-full px-0.5">
        {item.label}
      </span>
    </button>
  );
}
