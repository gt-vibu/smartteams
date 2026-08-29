import * as React from 'react';
import { cn } from './cn';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-xs font-semibold text-slate-700 dark:text-slate-300 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-8 w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0284C7] focus-visible:border-[#0284C7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-[#161B22] dark:text-slate-100 dark:placeholder:text-slate-500',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[64px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0284C7] focus-visible:border-[#0284C7] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-[#161B22] dark:text-slate-100 dark:placeholder:text-slate-500',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Label, Input, Textarea };
export * from './switch';
export * from './select';
export * from './checkbox';
