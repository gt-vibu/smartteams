import {
  LIMITS,
  aadhaarProblem,
  amountProblem,
  codeProblem,
  dateProblem,
  emailProblem,
  numberProblem,
  personNameProblem,
  phoneProblem,
  textProblem,
  wholeNumberProblem,
} from '@smarteam/contracts';
import { ValidateBy, type ValidationOptions } from 'class-validator';

/**
 * Field rules for request bodies, each the API half of a rule the forms also apply (see
 * `field-rules.ts` in the contracts). They answer in the person's words, "First name cannot
 * contain numbers.", never "firstName must match /…/", because a message the API returns is shown
 * as it is.
 *
 * Whether a field may be left out is stated with `@IsOptional()`, as before. Without it, a missing
 * value is checked as empty and refused with a sentence saying what to enter.
 */

type Problem = (value: unknown) => string | null;

function rule(name: string, problem: Problem, options?: ValidationOptions) {
  return ValidateBy(
    {
      name,
      validator: {
        // A missing value is read as empty, so a required field says what to enter. An optional
        // one is skipped before this runs, by its @IsOptional().
        validate: (value: unknown) => problem(value ?? '') === null,
        defaultMessage: (args) => problem(args?.value ?? '') ?? 'This value is not accepted.',
      },
    },
    options,
  );
}

const asText = (value: unknown) => (typeof value === 'string' ? value : null);

/** A person's name: letters (any script), spaces, hyphens, apostrophes, full stops; at most 60. */
export function IsPersonName(label: string) {
  return rule('isPersonName', (value) => {
    const text = asText(value);
    return text === null ? `${label} must be text.` : personNameProblem(text, label);
  });
}

/** Text of 1 to `max` characters that is not only spaces: a title, a label, a reason. */
export function IsText(label: string, max: number, min = 1) {
  return rule('isText', (value) => {
    const text = asText(value);
    return text === null ? `${label} must be text.` : textProblem(text, label, max, min);
  });
}

/** A short code: letters, digits, hyphens and underscores. */
export function IsCode(label = 'Code', max: number = LIMITS.code) {
  return rule('isCode', (value) => {
    const text = asText(value);
    return text === null ? `${label} must be text.` : codeProblem(text, label, max);
  });
}

export function IsEmailAddress() {
  return rule('isEmailAddress', (value) => {
    const text = asText(value);
    return text === null ? 'Enter an email address.' : emailProblem(text);
  });
}

/** A phone number: 10 digits starting 6–9 in India, 6 to 14 digits elsewhere. */
export function IsPhoneNumber() {
  return rule('isPhoneNumber', (value) => {
    const text = asText(value);
    return text === null ? 'Enter a phone number.' : phoneProblem(text);
  });
}

export function IsAadhaar() {
  return rule('isAadhaar', (value) => {
    const text = asText(value);
    if (text === null) return 'Enter a 12-digit Aadhaar number.';
    // The shared check reads only the digits; letters mixed in are a typo, not a separator.
    if (/[^\d\s-]/.test(text)) return 'An Aadhaar number can contain only digits.';
    return aadhaarProblem(text);
  });
}

/** Money in rupees: not negative, two decimal places at most, no more than `max`. */
export function IsAmount(label = 'Amount', max: number = LIMITS.amount, min = 0) {
  return rule('isAmount', (value) =>
    typeof value === 'number' || typeof value === 'string'
      ? amountProblem(value, label, { min, max })
      : `${label} must be a number.`,
  );
}

/** A whole number from `min` to `max`. */
export function IsWholeNumber(label: string, min: number, max: number) {
  return rule('isWholeNumber', (value) =>
    typeof value === 'number' || typeof value === 'string'
      ? wholeNumberProblem(value, label, min, max)
      : `${label} must be a whole number.`,
  );
}

/** A number from `min` to `max`, decimals allowed: a rate, a multiplier, half days. */
export function IsNumberBetween(label: string, min: number, max: number) {
  return rule('isNumberBetween', (value) =>
    typeof value === 'number' || typeof value === 'string'
      ? numberProblem(value, label, min, max)
      : `${label} must be a number.`,
  );
}

type Bound = string | (() => string);

/**
 * A real calendar date, optionally within bounds (`YYYY-MM-DD`). A bound may be a function, read
 * at validation time, for a window that moves with today: `latest: yearsFromToday(1)`.
 */
export function IsCalendarDate(label: string, bounds: { earliest?: Bound; latest?: Bound } = {}) {
  return rule('isCalendarDate', (value) => {
    const text = asText(value);
    if (text === null) return `Enter ${label.toLowerCase()}.`;
    const read = (bound?: Bound) => (typeof bound === 'function' ? bound() : bound);
    const earliest = read(bounds.earliest);
    const latest = read(bounds.latest);
    return dateProblem(text, label, {
      ...(earliest ? { earliest } : {}),
      ...(latest ? { latest } : {}),
    });
  });
}

/** The date `years` from today (negative for the past), for a moving date bound. */
export function yearsFromToday(years: number) {
  return () => {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return date.toISOString().slice(0, 10);
  };
}

/**
 * Adds rules to fields a class inherits, without redeclaring them. A stricter version of a shared
 * request body extends it and calls this; the shared body itself is untouched.
 */
export function withRules<T extends object>(
  target: abstract new (...args: never[]) => T,
  rules: Partial<Record<keyof T & string, PropertyDecorator[]>>,
) {
  for (const [field, decorators] of Object.entries(rules) as Array<[string, PropertyDecorator[]]>)
    for (const decorator of decorators) decorator(target.prototype as object, field);
}

/** The date `days` from today (negative for the past), for a moving date bound. */
export function daysFromToday(days: number) {
  return () => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** A time of day on the 24-hour clock: "09:30", "18:00". */
export function IsClockTime(label: string) {
  return rule('isClockTime', (value) =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
      ? null
      : `${label} must be a time like 09:30.`,
  );
}
