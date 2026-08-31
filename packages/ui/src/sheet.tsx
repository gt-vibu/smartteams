import * as React from 'react';
import { cn } from './cn';
import { useFocusTrap } from './focus-trap';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: 'right' | 'left' | 'bottom';
  className?: string;
}

export function Sheet({ open, onOpenChange, children, side = 'right', className }: SheetProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(open, contentRef, () => onOpenChange(false));

  if (!open) return null;

  const sideClasses = {
    right:
      'fixed inset-y-0 right-0 h-full w-full sm:max-w-md md:max-w-lg border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-900 dark:text-slate-100 shadow-2xl transition-transform duration-200 ease-in-out',
    left: 'fixed inset-y-0 left-0 h-full w-full sm:max-w-md md:max-w-lg border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-900 dark:text-slate-100 shadow-2xl transition-transform duration-200 ease-in-out',
    bottom:
      'fixed inset-x-0 bottom-0 max-h-[85vh] w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-900 dark:text-slate-100 shadow-2xl rounded-t-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Sheet Content */}
      <div
        className={cn(sideClasses[side], 'relative z-50 flex flex-col', className)}
        role="dialog"
        aria-modal="true"
        aria-label="Details"
        tabIndex={-1}
        ref={contentRef}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1 p-5 border-b border-slate-200 dark:border-slate-800',
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-sm font-semibold text-slate-900 dark:text-slate-100', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-slate-500 dark:text-slate-400', className)} {...props} />;
}

export function SheetContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto p-5 text-xs text-slate-700 dark:text-slate-300',
        className,
      )}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 p-4 border-t border-border bg-muted',
        className,
      )}
      {...props}
    />
  );
}
