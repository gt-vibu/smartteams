import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0 cursor-pointer',
    // On a touchscreen the tappable area reaches 4px past every edge, so the 32px default is a
    // 40px target for a thumb. It is a hit area, not a size: raising the height instead would
    // override callers that deliberately set `h-auto` — an inline link-button inside a sentence —
    // because tailwind-merge keeps a variant class alongside the plain one it would replace.
    "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-1 pointer-coarse:after:content-['']",
  ],
  {
    variants: {
      // Every variant reads from the token layer. These were hardcoded slate, which meant the
      // primary action on every screen in both apps was near-black regardless of the brand —
      // and stayed near-black when the brand changed.
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs',
        outline: 'border border-border bg-card text-foreground hover:bg-muted/60 shadow-2xs',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        link: 'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
        // Distinct from `primary` on purpose: with a green brand, a success button that simply
        // reused the brand colour would say nothing the default button does not already say.
        success: 'bg-success text-white hover:bg-success/90 shadow-xs',
        quiet: 'bg-transparent text-foreground hover:bg-muted/60',
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
