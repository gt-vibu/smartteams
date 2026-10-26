'use client';

import React from 'react';
import { Input } from '@smarteam/ui';

type CheckedInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
  /** What is wrong with the value, from a shared rule such as `personNameProblem`; null when fine. */
  problem: string | null;
};

/**
 * A text box that says what is wrong under itself, in the words the API would use.
 *
 * The problem shows once something has been typed, so an untouched form does not open on errors;
 * a required field left empty is the form's to report when it is submitted.
 */
export function CheckedInput({ value, onChange, problem, id, ...props }: CheckedInputProps) {
  const show = value.trim().length > 0 && problem !== null;
  const messageId = id ? `${id}-problem` : undefined;
  return (
    <>
      <Input
        {...props}
        id={id}
        aria-invalid={show || undefined}
        aria-describedby={show ? messageId : undefined}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {show && (
        <p className="mt-1 text-[11px] text-destructive" id={messageId}>
          {problem}
        </p>
      )}
    </>
  );
}

/** The problem with an optional field: none while it is empty. */
export function optionalProblem(value: string, check: (value: string) => string | null) {
  return value.trim() ? check(value) : null;
}
