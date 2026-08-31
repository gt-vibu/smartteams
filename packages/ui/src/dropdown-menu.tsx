import * as React from 'react';
import { cn } from './cn';

interface DropdownMenuContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType | null>(null);

export function DropdownMenu({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = React.useCallback(
    (valueOrFn: React.SetStateAction<boolean>) => {
      const next = typeof valueOrFn === 'function' ? valueOrFn(open) : valueOrFn;
      if (!isControlled) setInternalOpen(next);
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
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) throw new Error('DropdownMenuTrigger must be in DropdownMenu');

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen((prev) => !prev)}
      className={cn('cursor-pointer inline-flex items-center', className)}
      aria-expanded={ctx.open}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  className,
  align = 'right',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { align?: 'left' | 'right' | 'center' }) {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx || !ctx.open) return null;

  const alignClass = {
    left: 'left-0',
    right: 'right-0',
    center: 'left-1/2 -translate-x-1/2',
  }[align];

  return (
    <div
      className={cn(
        'absolute mt-1.5 z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-card dark:text-slate-100 animate-in fade-in zoom-in-95',
        alignClass,
        className,
      )}
      role="menu"
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className,
  children,
  onClick,
  disabled = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { disabled?: boolean }) {
  const ctx = React.useContext(DropdownMenuContext);

  return (
    <div
      role="menuitem"
      onClick={(e) => {
        if (!disabled) {
          onClick?.(e);
          ctx?.setOpen(false);
        }
      }}
      className={cn(
        'relative flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 transition-colors cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800/80',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn('h-px bg-slate-100 dark:bg-slate-800 my-1', className)} />;
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400',
        className,
      )}
    >
      {children}
    </div>
  );
}
