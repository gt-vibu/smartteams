import * as React from 'react';
import { cn } from './cn';

export interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        onClick={() => !disabled && onCheckedChange?.(!checked)}
        className={cn(
          'peer h-4 w-4 shrink-0 rounded border border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0284C7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 flex items-center justify-center cursor-pointer',
          checked
            ? 'bg-[#0284C7] text-white border-[#0284C7]'
            : 'bg-white dark:bg-[#161B22] hover:border-slate-400 dark:hover:border-slate-600',
          className,
        )}
        {...props}
      >
        {checked && (
          <svg
            className="h-3 w-3 text-white stroke-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    );
  },
);
Checkbox.displayName = 'Checkbox';
