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

/** Text boxes with no limit of their own stop here; each form sets a tighter one where it has one. */
const DEFAULT_MAX_LENGTH = 255;
const DEFAULT_TEXTAREA_MAX_LENGTH = 2000;
const TEXT_TYPES = new Set([undefined, 'text', 'search', 'email', 'tel', 'url', 'password']);

/**
 * Keys a number box refuses. Browsers accept "e", "+" and "-" in `type="number"` because "1e5" is
 * a number to them; to a person entering days or rupees it is a typo. A minus is allowed only
 * where the box allows negatives, and a decimal point only where it allows fractions.
 */
function refusesKey(
  key: string,
  min: React.InputHTMLAttributes<HTMLInputElement>['min'],
  step: React.InputHTMLAttributes<HTMLInputElement>['step'],
) {
  if (key === 'e' || key === 'E' || key === '+') return true;
  if (key === '-') return min !== undefined && Number(min) >= 0;
  if (key === '.' || key === ',')
    return step !== undefined && step !== 'any' && Number.isInteger(Number(step));
  return false;
}

type Bound = React.InputHTMLAttributes<HTMLInputElement>['min'];

/**
 * What is wrong with a number box's value against its own `min`, `max` and `step`, so every
 * number box explains itself as soon as it is given its range. Empty is the form's to judge.
 */
function outOfRange(
  value: InputProps['value'],
  min: Bound,
  max: Bound,
  step: Bound,
): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Enter a number.';
  if (min !== undefined && min !== '' && number < Number(min)) return `Enter ${min} or more.`;
  if (max !== undefined && max !== '' && number > Number(max)) return `Enter ${max} or less.`;
  if (step !== undefined && step !== 'any' && Number(step) === 1 && !Number.isInteger(number))
    return 'Enter a whole number.';
  return null;
}

/** The sentence under a field; announced with the field, and only once there is a value. */
function FieldProblem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p className="mt-1 text-[11px] text-destructive" id={id}>
      {children}
    </p>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /**
   * What is wrong with the value, in the words the API would use (from a shared rule such as
   * `personNameProblem`), or null. Shown under the box once something has been typed. A number
   * box also reports its own `min`, `max` and whole-number `step` without this.
   */
  problem?: string | null;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, maxLength, onKeyDown, onWheel, onPaste, problem, ...props }, ref) => {
    const isNumber = type === 'number';
    const problemId = React.useId();
    const typed = props.value !== undefined && String(props.value).trim() !== '';
    const shown =
      (typed ? problem : null) ??
      (isNumber ? outOfRange(props.value, props.min, props.max, props.step) : null);
    const input = (
      <input
        type={type}
        className={cn(
          'flex min-h-9 w-full rounded-md border border-input bg-input-surface px-3 py-1.5 text-xs text-foreground shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input-surface-disabled disabled:text-muted-foreground disabled:opacity-100',
          shown && 'border-destructive focus-visible:border-destructive',
          className,
        )}
        ref={ref}
        maxLength={maxLength ?? (TEXT_TYPES.has(type) ? DEFAULT_MAX_LENGTH : undefined)}
        aria-invalid={shown ? true : props['aria-invalid']}
        aria-describedby={shown ? problemId : props['aria-describedby']}
        onKeyDown={(event) => {
          if (isNumber && refusesKey(event.key, props.min, props.step)) event.preventDefault();
          onKeyDown?.(event);
        }}
        onPaste={(event) => {
          // A pasted "1e5" or "₹1,000" would land as nothing or as the wrong number.
          if (isNumber && !/^-?\d*\.?\d*$/.test(event.clipboardData.getData('text').trim()))
            event.preventDefault();
          onPaste?.(event);
        }}
        onWheel={(event) => {
          // Scrolling the page over a focused number box used to change the number in it.
          if (isNumber && document.activeElement === event.currentTarget)
            event.currentTarget.blur();
          onWheel?.(event);
        }}
        {...props}
      />
    );
    if (!shown) return input;
    return (
      <>
        {input}
        <FieldProblem id={problemId}>{shown}</FieldProblem>
      </>
    );
  },
);
Input.displayName = 'Input';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** As for `Input`: what is wrong, shown once something has been typed. */
  problem?: string | null;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, maxLength, problem, ...props }, ref) => {
    const problemId = React.useId();
    const shown =
      props.value !== undefined && String(props.value).trim() !== '' ? (problem ?? null) : null;
    const textarea = (
      <textarea
        className={cn(
          'flex min-h-[64px] w-full rounded-md border border-input bg-input-surface px-3 py-2 text-xs text-foreground shadow-2xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-input-surface-disabled disabled:text-muted-foreground disabled:opacity-100',
          shown && 'border-destructive',
          className,
        )}
        ref={ref}
        maxLength={maxLength ?? DEFAULT_TEXTAREA_MAX_LENGTH}
        aria-invalid={shown ? true : props['aria-invalid']}
        aria-describedby={shown ? problemId : props['aria-describedby']}
        {...props}
      />
    );
    if (!shown) return textarea;
    return (
      <>
        {textarea}
        <FieldProblem id={problemId}>{shown}</FieldProblem>
      </>
    );
  },
);
Textarea.displayName = 'Textarea';

export { Label, Input, Textarea };
export * from './switch';
export * from './checkbox';
