'use client';

import React from 'react';
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  joinPhone,
  phoneProblem,
  splitPhone,
} from '@smarteam/contracts';

/**
 * A phone number: the calling code, then the number. Only digits can be typed, an Indian number
 * stops at 10, and a number that is not valid says why as soon as it is complete enough to judge.
 * `value` and `onChange` carry the stored form, "+91 9876543210".
 */
export function PhoneField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { country, digits } = splitPhone(value);
  const code = country || DEFAULT_PHONE_COUNTRY;
  const problem = digits.length > 0 ? phoneProblem(joinPhone(code, digits)) : null;
  // Judged once there are enough digits to be a number at all, so typing is not interrupted.
  const show = problem !== null && digits.length >= (code === '+91' ? 10 : 6);
  return (
    <div>
      <div
        className={`flex h-9 overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring ${
          show ? 'border-destructive' : 'border-input'
        }`}
      >
        <select
          aria-label="Country code"
          className="border-r border-input bg-muted/40 px-2 text-sm text-foreground outline-none"
          disabled={disabled}
          onChange={(event) => onChange(joinPhone(event.target.value, digits))}
          value={code}
        >
          {PHONE_COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.code}
            </option>
          ))}
        </select>
        <input
          aria-describedby={show ? `${id}-error` : undefined}
          // Named on its own: a label around the whole field names the country code first.
          aria-label="Phone number"
          aria-invalid={show || undefined}
          autoComplete="tel-national"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none"
          disabled={disabled}
          id={id}
          inputMode="numeric"
          maxLength={code === '+91' ? 10 : 14}
          onChange={(event) => onChange(joinPhone(code, event.target.value.replace(/\D/g, '')))}
          placeholder={code === '+91' ? '98765 43210' : 'Phone number'}
          value={digits}
        />
      </div>
      {show && (
        <p className="mt-1 text-[11px] text-destructive" id={`${id}-error`}>
          {problem}
        </p>
      )}
    </div>
  );
}

/** Whether a phone value may be saved: empty (it is optional) or valid. */
export const phoneIsValid = (value: string) => !value.trim() || phoneProblem(value) === null;
