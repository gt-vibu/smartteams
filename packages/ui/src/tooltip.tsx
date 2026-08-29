import * as React from 'react';
import { cn } from './cn';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <span
          role="tooltip"
          className={cn(
            'absolute z-50 max-w-xs rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal leading-tight text-white shadow-md transition-opacity duration-150 animate-in fade-in-0 zoom-in-95 dark:bg-slate-100 dark:text-slate-900 pointer-events-none whitespace-normal text-left',
            sideClasses[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
