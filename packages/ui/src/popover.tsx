import * as React from 'react';
import { cn } from './cn';

interface PopoverContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const PopoverContext = React.createContext<PopoverContextType | null>(null);

export function Popover({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = React.useCallback(
    (valueOrFn: React.SetStateAction<boolean>) => {
      const next = typeof valueOrFn === 'function' ? valueOrFn(open) : valueOrFn;
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, open, onOpenChange],
  );

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, setOpen]);

  return (
    <PopoverContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block text-left">
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error('PopoverTrigger must be inside Popover');

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen((prev) => !prev)}
      className={cn('cursor-pointer', className)}
      aria-expanded={ctx.open}
      {...props}
    >
      {children}
    </button>
  );
}

export function PopoverContent({
  className,
  align = 'left',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: 'left' | 'right' | 'center' }) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx || !ctx.open) return null;

  const alignClass = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }[align];

  return (
    <div
      className={cn(
        'absolute mt-1.5 z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-card dark:text-slate-100 animate-in fade-in zoom-in-95',
        alignClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
