import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-slate-900 text-white hover:bg-slate-800 shadow-xs dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
        primary:
          'bg-slate-900 text-white hover:bg-slate-800 shadow-xs dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
        outline:
          'border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-850 hover:text-slate-900 dark:hover:text-white shadow-2xs',
        secondary:
          'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
        ghost:
          'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100',
        link: 'bg-transparent text-slate-900 dark:text-slate-100 underline-offset-4 hover:underline hover:text-slate-700 dark:hover:text-slate-300 p-0 h-auto',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs',
        quiet:
          'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300',
      },
      size: {
        default: 'h-8 px-3 py-1.5',
        sm: 'h-7 rounded-md px-2.5 text-[11px]',
        lg: 'h-9 rounded-md px-4 text-xs',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, children, className, variant, size, ...props }, ref) => {
    if (asChild && React.isValidElement<{ className?: string }>(children)) {
      return React.cloneElement(children, {
        ...props,
        className: cn(buttonVariants({ variant, size }), className, children.props.className),
      });
    }

    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
