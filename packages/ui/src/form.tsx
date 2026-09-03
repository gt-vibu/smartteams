import * as React from 'react';
import { cn } from './cn';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-xs font-semibold text-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none',
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
        'flex min-h-9 w-full rounded-md border border-input bg-input-surface px-3 py-1.5 text-xs text-foreground shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input-surface-disabled disabled:text-muted-foreground disabled:opacity-100',
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
      'flex min-h-[64px] w-full rounded-md border border-input bg-input-surface px-3 py-2 text-xs text-foreground shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input-surface-disabled disabled:text-muted-foreground disabled:opacity-100',
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
