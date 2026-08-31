import * as React from 'react';
import { cn } from './cn';
import { useFocusTrap } from './focus-trap';

interface DialogContextValue {
  titleId: string;
  descriptionId: string;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const id = React.useId();
  const context = React.useMemo(
    () => ({ titleId: `${id}-title`, descriptionId: `${id}-description`, onOpenChange }),
    [id, onOpenChange],
  );

  if (!open) return null;

  return (
    <DialogContext.Provider value={context}>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-4">
        <button
          type="button"
          aria-label="Close dialog"
          className="fixed inset-0 cursor-default bg-slate-950/60 backdrop-blur-xs transition-opacity"
          onClick={() => onOpenChange(false)}
        />
        <div className="relative z-50 flex max-h-[95vh] w-full min-w-0 items-center justify-center">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(DialogContext);
    const localRef = React.useRef<HTMLDivElement>(null);
    const setRefs = (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };
    useFocusTrap(true, localRef, () => context?.onOpenChange(false));

    return (
      <div
        ref={setRefs}
        role="dialog"
        aria-modal="true"
        aria-labelledby={context?.titleId}
        aria-describedby={context?.descriptionId}
        tabIndex={-1}
        className={cn(
          'max-h-[90vh] min-w-0 w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-2xl transition-all sm:p-6',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 border-b border-border pb-3 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex items-center justify-end space-x-2 border-t border-border pt-3', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    const context = React.useContext(DialogContext);
    return (
      <h2
        ref={ref}
        id={context?.titleId}
        className={cn('text-sm font-bold leading-none tracking-tight', className)}
        {...props}
      />
    );
  },
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(DialogContext);
  return (
    <p
      ref={ref}
      id={context?.descriptionId}
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
});
DialogDescription.displayName = 'DialogDescription';

export { DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
