import * as React from 'react';
import { cn } from './cn';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Content wrapper */}
      <div className="relative z-50 w-full flex items-center justify-center min-w-0 max-h-[95vh]">
        {children}
      </div>
    </div>
  );
};

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-2xl transition-all dark:border-slate-800 dark:bg-[#1B2028] dark:text-slate-50 max-h-[90vh] overflow-y-auto min-w-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-left border-b border-slate-100 dark:border-slate-800 pb-3',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn(
        'text-sm font-bold leading-none tracking-tight text-slate-900 dark:text-white',
        className,
      )}
      {...props}
    />
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-slate-500 dark:text-slate-400', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
