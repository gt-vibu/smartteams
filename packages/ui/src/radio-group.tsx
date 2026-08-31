import * as React from 'react';
import { cn } from './cn';

interface RadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

export function RadioGroup({
  className,
  value,
  onValueChange,
  name,
  disabled,
  ...props
}: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange, name, disabled }}>
      <div role="radiogroup" className={cn('grid gap-2', className)} {...props} />
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupItemProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange'
> {
  value: string;
}

export const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const isDisabled = disabled || context?.disabled;
    const isChecked = context?.value === value;

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={isChecked}
        aria-disabled={isDisabled || undefined}
        data-name={context?.name}
        disabled={isDisabled}
        onClick={() => context?.onValueChange?.(value)}
        className={cn(
          'h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700',
          isChecked && 'border-primary bg-primary',
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'mx-auto block h-1.5 w-1.5 rounded-full',
            isChecked ? 'bg-white' : 'bg-transparent',
          )}
        />
      </button>
    );
  },
);
RadioGroupItem.displayName = 'RadioGroupItem';
