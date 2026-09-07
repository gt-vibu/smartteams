/**
 * Styled native `<select>`.
 *
 * Kept deliberately: a native select is fully keyboard- and screen-reader accessible with no
 * JavaScript, and on mobile it opens the operating system picker. It is the right default for
 * plain option lists, and it is what every existing call site uses (`value` + `onChange` with
 * `<option>` children).
 *
 * For custom option rendering, grouping or search, use the Radix-backed `SelectMenu` in
 * `select-menu.tsx` instead.
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { useAnchoredPanel, useDismissOnOutside } from './use-anchored-panel';

/** Matches the panel's own `max-h-60` plus padding, so the flip decision is measured, not guessed. */
const LISTBOX_SIZE = { width: 288, height: 256 };

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
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  // Positioned in viewport coordinates and portalled, so a scrolling ancestor — a dialog body,
  // most often — cannot clip the options or push a sideways scrollbar into the form.
  const listboxPosition = useAnchoredPanel(open, containerRef, LISTBOX_SIZE);

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

  // The listbox lives in a portal, so it has to be named here alongside the trigger — otherwise
  // clicking an option counts as an outside click and closes the menu before it registers.
  const dismiss = React.useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, [containerRef, listboxRef], dismiss);

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
            'flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-surface px-2.5 py-1 text-xs text-foreground shadow-2xs transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
            open && 'ring-1 ring-primary border-primary',
            !currentOption && 'text-muted-foreground',
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
              'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200',
              open && 'rotate-180 text-primary',
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open &&
          listboxPosition &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={listboxRef}
              style={{
                left: listboxPosition.left,
                top: listboxPosition.top,
                minWidth: containerRef.current?.offsetWidth,
              }}
              className="fixed z-[100] w-max max-w-sm rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95"
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
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                        opt.disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
                      )}
                    >
                      <span className="truncate pr-4">{opt.label}</span>
                      {isSelected && (
                        <svg
                          className="h-3.5 w-3.5 text-primary shrink-0"
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
            </div>,
            document.body,
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
