/**
 * The limits every typed field is held to: how long, which characters, which range.
 *
 * One definition used by the forms (to say what is wrong while it is typed, and to stop typing past
 * a limit) and by the API (so a request that skips the form meets the same rule). Each `…Problem`
 * returns a sentence for the person, or null when the value is fine. An empty value is the
 * caller's business: whether a field is required is decided where it is used.
 */

export const LIMITS = {
  /** First, middle, last or preferred name. */
  personName: 60,
  /** A named thing: team, project, branch, leave type, shift, holiday, role, component. */
  title: 100,
  /** A short code: branch, leave type, shift, project, component. */
  code: 20,
  /** An employee ID such as EMP0012. */
  employeeNumber: 20,
  /** Job title, department, relationship. */
  label: 80,
  email: 254,
  /** A reason or comment given with a decision. */
  reason: 500,
  /** A description or note. */
  note: 2000,
  address: 500,
  /** Rupees: the largest single amount any salary or payment field takes (₹10 crore). */
  amount: 100_000_000,
} as const;

/** Letters from any script, joined by spaces, apostrophes, hyphens or full stops: "Mary-Jane O'Neil". */
const PERSON_NAME = /^[\p{L}\p{M}]+(?:[ .'-]+[\p{L}\p{M}]+)*\.?$/u;

export function personNameProblem(value: string, label = 'Name'): string | null {
  const text = value.trim();
  if (!text) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  if (text.length > LIMITS.personName)
    return `${label} can be at most ${LIMITS.personName} characters.`;
  if (/\d/.test(text)) return `${label} cannot contain numbers.`;
  if (!PERSON_NAME.test(text))
    return `${label} can contain only letters, spaces, hyphens, apostrophes and full stops.`;
  return null;
}

/** An email address: something@domain.tld, no spaces, at most 254 characters. */
export function emailProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return 'Enter an email address.';
  if (text.length > LIMITS.email) return 'An email address can be at most 254 characters.';
  if (!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(text))
    return 'Enter an email address like name@company.com.';
  return null;
}

/** Free text of at most `max` characters that is not only spaces. */
export function textProblem(value: string, label: string, max: number, min = 1): string | null {
  const text = value.trim();
  if (text.length < min)
    return min <= 1
      ? `Enter ${article(label)} ${label.toLowerCase()}.`
      : `${label} needs at least ${min} characters.`;
  if (text.length > max) return `${label} can be at most ${max} characters.`;
  return null;
}

/** A short code: letters, digits, hyphens and underscores, starting with a letter or digit. */
export function codeProblem(
  value: string,
  label = 'Code',
  max: number = LIMITS.code,
): string | null {
  const text = value.trim();
  if (!text) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  if (text.length > max) return `${label} can be at most ${max} characters.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(text))
    return `${label} can contain only letters, numbers, hyphens and underscores.`;
  return null;
}

/** An amount of money: not negative, at most two decimal places, and below `max`. */
export function amountProblem(
  value: number | string,
  label = 'Amount',
  { min = 0, max = LIMITS.amount }: { min?: number; max?: number } = {},
): string | null {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!text) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return `${label} must be a number.`;
  const amount = Number(text);
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return `${label} can have at most two decimal places.`;
  if (amount < min)
    return min === 0 ? `${label} cannot be negative.` : `${label} must be at least ${min}.`;
  if (amount > max) return `${label} can be at most ${max.toLocaleString('en-IN')}.`;
  return null;
}

/** A whole number between `min` and `max`: days, minutes, a count. */
export function wholeNumberProblem(
  value: number | string,
  label: string,
  min: number,
  max: number,
): string | null {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!text) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  if (!/^-?\d+$/.test(text)) return `${label} must be a whole number.`;
  const count = Number(text);
  if (count < min || count > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/** A number with decimals allowed, between `min` and `max`: a rate, a multiplier, half days. */
export function numberProblem(
  value: number | string,
  label: string,
  min: number,
  max: number,
): string | null {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!text) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return `${label} must be a number.`;
  const number = Number(text);
  if (number < min || number > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

/**
 * A calendar date (`YYYY-MM-DD`) that exists and falls within a sensible window: no earlier than
 * `earliest`, no later than `latest`. Either bound may be omitted.
 */
export function dateProblem(
  value: string,
  label: string,
  { earliest, latest }: { earliest?: string; latest?: string } = {},
): string | null {
  const text = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return `Enter ${article(label)} ${label.toLowerCase()}.`;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text)
    return `${label} is not a real date.`;
  if (earliest && text < earliest) return `${label} cannot be before ${earliest}.`;
  if (latest && text > latest) return `${label} cannot be after ${latest}.`;
  return null;
}

/** Keeps only the digits of what was typed or pasted, up to `max` of them. */
export function digitsOnly(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '');
  return max === undefined ? digits : digits.slice(0, max);
}

function article(label: string) {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}
