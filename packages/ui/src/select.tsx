import * as React from 'react';
import { cn } from './cn';

// ─── Types & Context ──────────────────────────────────────────────────────────

interface SelectContextType {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  selectedLabel: string;
  setSelectedLabel: (label: string) => void;
  listboxId: string;
}

const SelectContext = React.createContext<SelectContextType | null>(null);

function useSelect() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) {
    throw new Error('Select compound components must be used within <Select>');
  }
  return ctx;
}

// ─── Dual Interface Select Root ─────────────────────────────────────────────

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export function Select({
  value: controlledValue,
  defaultValue,
  onValueChange,
  onChange,
  name,
  id,
  disabled = false,
  children,
  className,
  placeholder = 'Select an option...',
}: SelectProps) {
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue || '');
  const [open, setOpen] = React.useState(false);
  const [selectedLabel, setSelectedLabel] = React.useState<string>('');
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  const activeValue = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = React.useCallback(
    (newVal: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newVal);
      }
      onValueChange?.(newVal);
      onChange?.({ target: { value: newVal, name } });
      setOpen(false);
    },
    [controlledValue, onValueChange, onChange, name],
  );

  // Close on outside click
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
  }, [open]);

  // Close on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Check if children are <option> tags (legacy / HTML format) or compound components
  const isLegacyOptionFormat = React.useMemo(() => {
    let hasOptions = false;
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === 'option') {
        hasOptions = true;
      }
    });
    return hasOptions;
  }, [children]);

  // If children are <option> elements, automatically render full custom shadcn UI!
  if (isLegacyOptionFormat) {
    const options: Array<{ value: string; label: React.ReactNode; disabled?: boolean }> = [];
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === 'option') {
        const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        options.push({
          value: String(props.value ?? ''),
          label: props.children,
          disabled: Boolean(props.disabled),
        });
      }
    });

    const currentOption = options.find((o) => o.value === activeValue);
    const displayText = currentOption ? currentOption.label : placeholder;

    return (
      <div
        ref={containerRef}
        className={cn('relative inline-block w-full text-left', className)}
        id={id}
      >
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-2xs transition-all hover:bg-slate-50/80 focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-card dark:text-slate-100 dark:hover:bg-slate-800/80 cursor-pointer',
            open && 'ring-1 ring-primary border-primary',
            !currentOption && 'text-slate-400 dark:text-slate-500',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className="truncate pr-2">{displayText}</span>
          <svg
            className={cn(
              'h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform duration-200',
              open && 'rotate-180 text-sky-600',
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div
            className="absolute left-0 mt-1 z-50 min-w-full w-max max-w-sm rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-card dark:text-slate-100 animate-in fade-in zoom-in-95"
            role="listbox"
            id={listboxId}
            tabIndex={-1}
          >
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === activeValue;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled || undefined}
                    tabIndex={opt.disabled ? -1 : 0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (!opt.disabled) handleValueChange(opt.value);
                      }
                    }}
                    onClick={() => {
                      if (!opt.disabled) {
                        handleValueChange(opt.value);
                      }
                    }}
                    className={cn(
                      'relative flex items-center justify-between w-full px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer select-none',
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/50 text-primary dark:text-sky-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80',
                      opt.disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
                    )}
                  >
                    <span className="truncate pr-4">{opt.label}</span>
                    {isSelected && (
                      <svg
                        className="h-3.5 w-3.5 text-primary dark:text-sky-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Compound shadcn format
  return (
    <SelectContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
        disabled,
        triggerRef,
        selectedLabel,
        setSelectedLabel,
        listboxId,
      }}
    >
      <div
        ref={containerRef}
        className={cn('relative inline-block w-full text-left', className)}
        id={id}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
}

// ─── Compound Primitives ────────────────────────────────────────────────────

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, disabled, triggerRef, listboxId } = useSelect();

  return (
    <button
      ref={(node) => {
        triggerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setOpen(!open)}
      className={cn(
        'flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-900 shadow-2xs transition-all hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-card dark:text-slate-100 dark:hover:bg-slate-800/80 cursor-pointer',
        open && 'ring-1 ring-primary border-primary',
        className,
      )}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen(true);
        }
      }}
      {...props}
    >
      {children}
      <svg
        className={cn(
          'h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform duration-200 ml-1.5',
          open && 'rotate-180 text-sky-600',
        )}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, selectedLabel } = useSelect();
  const display = selectedLabel || value;

  return (
    <span className={cn('truncate', !display && 'text-slate-400 dark:text-slate-500')}>
      {display || placeholder || 'Select...'}
    </span>
  );
}

export function SelectContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, listboxId } = useSelect();

  if (!open) return null;

  return (
    <div
      className={cn(
        'absolute left-0 mt-1 z-50 min-w-full w-max max-w-sm rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-card dark:text-slate-100 animate-in fade-in zoom-in-95',
        className,
      )}
      role="listbox"
      id={listboxId}
      tabIndex={-1}
    >
      <div className="max-h-60 overflow-y-auto space-y-0.5">{children}</div>
    </div>
  );
}

export function SelectItem({
  value,
  disabled = false,
  className,
  children,
}: {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { value: selectedValue, onValueChange, setSelectedLabel } = useSelect();
  const isSelected = selectedValue === value;

  React.useEffect(() => {
    if (isSelected && typeof children === 'string') {
      setSelectedLabel(children);
    }
  }, [isSelected, children, setSelectedLabel]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!disabled) {
            if (typeof children === 'string') setSelectedLabel(children);
            onValueChange?.(value);
          }
        }
      }}
      onClick={() => {
        if (!disabled) {
          if (typeof children === 'string') {
            setSelectedLabel(children);
          }
          onValueChange?.(value);
        }
      }}
      className={cn(
        'relative flex items-center justify-between w-full px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer select-none',
        isSelected
          ? 'bg-sky-50 dark:bg-sky-950/50 text-primary dark:text-sky-400 font-semibold'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className,
      )}
    >
      <span className="truncate pr-4">{children}</span>
      {isSelected && (
        <svg
          className="h-3.5 w-3.5 text-primary dark:text-sky-400 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

export function SelectGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('py-1', className)}>{children}</div>;
}

export function SelectLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
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

export function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn('h-px bg-slate-100 dark:bg-slate-800 my-1', className)} />;
}
