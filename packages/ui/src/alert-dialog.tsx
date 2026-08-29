import * as React from 'react';
import { cn } from './cn';
import { Button } from './button';

export interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Dialog container */}
      <div
        className="relative z-50 w-full max-w-md animate-in fade-in zoom-in-95"
        role="alertdialog"
      >
        {children}
      </div>
    </div>
  );
}

export const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'w-full rounded-xl border border-slate-200 bg-white p-5 shadow-2xl transition-all dark:border-slate-800 dark:bg-[#1B2028] dark:text-slate-100',
      className,
    )}
    {...props}
  >
    {children}
  </div>
));
AlertDialogContent.displayName = 'AlertDialogContent';

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-2 text-left pb-3', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800/80',
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2',
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-xs text-slate-500 dark:text-slate-400 leading-relaxed', className)}
      {...props}
    />
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'destructive',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(val) => !val && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {variant === 'destructive' && (
              <span className="h-6 w-6 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs shrink-0 font-bold">
                ⚠️
              </span>
            )}
            <span>{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} className="text-xs">
            {cancelText}
          </Button>
          <Button variant={variant} size="sm" onClick={onConfirm} className="text-xs">
            {confirmText}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
