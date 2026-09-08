'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from './cn';

// ─── Dual-Mode Select (Supports legacy <option> tags & compound shadcn items) ───

const EMPTY_VALUE_SENTINEL = '__EMPTY_SELECT_OPTION__';

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export function Select({
  value: controlledValue,
  defaultValue,
  onValueChange,
  onChange,
  name,
  id,
  disabled = false,
  children,
  className,
  placeholder = 'Select an option...',
}: SelectProps) {
  // Check if children are <option> tags
  const options: Array<{ value: string; label: React.ReactNode; disabled?: boolean }> = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const isOption = typeof child.type === 'string' && child.type.toLowerCase() === 'option';
      if (isOption) {
        const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
        options.push({
          value: String(props.value ?? ''),
          label: props.children ?? String(props.value ?? ''),
          disabled: Boolean(props.disabled),
        });
      }
    }
  });

  const handleValueChange = (newVal: string) => {
    const resolvedVal = newVal === EMPTY_VALUE_SENTINEL ? '' : newVal;
    onValueChange?.(resolvedVal);
    onChange?.({ target: { value: resolvedVal, name } });
  };

  if (options.length > 0) {
    const activeValue = controlledValue !== undefined ? controlledValue : defaultValue;
    const radixValue =
      activeValue === ''
        ? EMPTY_VALUE_SENTINEL
        : activeValue !== undefined
          ? activeValue
          : undefined;

    return (
      <SelectPrimitive.Root
        value={radixValue}
        defaultValue={defaultValue === '' ? EMPTY_VALUE_SENTINEL : defaultValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        name={name}
      >
        <SelectPrimitive.Trigger
          id={id}
          className={cn(
            'flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-surface px-2.5 py-1 text-xs text-foreground shadow-2xs transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <svg
              className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="relative z-[200] max-h-64 min-w-[8rem] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 bg-popover text-muted-foreground cursor-default">
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </SelectPrimitive.ScrollUpButton>

            <SelectPrimitive.Viewport className="p-1 space-y-0.5 max-h-60 overflow-y-auto">
              {options.map((opt) => {
                const optVal = opt.value === '' ? EMPTY_VALUE_SENTINEL : opt.value;
                return (
                  <SelectPrimitive.Item
                    key={optVal}
                    value={optVal}
                    disabled={opt.disabled}
                    className={cn(
                      'relative flex items-center justify-between w-full px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer select-none outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary data-[state=checked]:font-semibold',
                    )}
                  >
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <svg
                        className="h-3.5 w-3.5 text-primary shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })}
            </SelectPrimitive.Viewport>

            <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 bg-popover text-muted-foreground cursor-default">
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }

  // Compound shadcn format
  return (
    <SelectPrimitive.Root
      value={controlledValue}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      name={name}
    >
      <div className={cn('relative inline-block w-full text-left', className)} id={id}>
        {children}
      </div>
    </SelectPrimitive.Root>
  );
}

// ─── Compound Radix Select Primitives ───────────────────────────────────────

export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-8 w-full items-center justify-between rounded-md border border-input bg-input-surface px-2.5 py-1 text-xs text-foreground shadow-2xs transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <svg
        className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      className={cn(
        'relative z-[200] max-h-64 min-w-[8rem] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 bg-popover text-muted-foreground cursor-default">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1 space-y-0.5 max-h-60 overflow-y-auto">
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 bg-popover text-muted-foreground cursor-default">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-2.5 py-1 text-[11px] font-semibold text-muted-foreground', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex items-center justify-between w-full px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer select-none outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary data-[state=checked]:font-semibold',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator>
      <svg
        className="h-3.5 w-3.5 text-primary shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
