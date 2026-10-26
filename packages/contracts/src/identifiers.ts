/**
 * Formats for the identifiers people type in: phone numbers and Indian tax and bank details.
 *
 * One definition, used by the forms (to say what is wrong as it is typed) and by the API (so a
 * request that skips the form is held to the same rule). Each `…Problem` returns a sentence for
 * the person, or null when the value is fine; an empty value is the caller's business.
 */

/** Calling codes offered beside a phone number; India first, as the default. */
export const PHONE_COUNTRIES = [
  { code: '+91', label: 'India (+91)' },
  { code: '+1', label: 'US / Canada (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+61', label: 'Australia (+61)' },
] as const;

export const DEFAULT_PHONE_COUNTRY = '+91';

/** Splits a stored number into its calling code and digits: "+91 98765 43210" → ["+91", "9876543210"]. */
export function splitPhone(value: string | null | undefined): { country: string; digits: string } {
  const text = (value ?? '').trim();
  const match = /^\+(\d{1,3})[\s-]*(.*)$/.exec(text);
  if (!match) return { country: DEFAULT_PHONE_COUNTRY, digits: text.replace(/\D/g, '') };
  const known = PHONE_COUNTRIES.find((entry) => entry.code === `+${match[1]}`);
  return {
    country: known?.code ?? `+${match[1]}`,
    digits: (match[2] ?? '').replace(/\D/g, ''),
  };
}

/** How a number is stored: calling code, a space, the digits. */
export function joinPhone(country: string, digits: string) {
  const clean = digits.replace(/\D/g, '');
  return clean ? `${country} ${clean}` : '';
}

/**
 * An Indian mobile number is 10 digits starting 6–9; elsewhere 6 to 14 digits. A number written
 * without a calling code is read as Indian, as numbers already on file were entered that way.
 */
export function phoneProblem(value: string): string | null {
  // Letters are refused, not dropped: "98765abc43210" is a typo, not a number.
  if (/[^\d\s+()-]/.test(value)) return 'A phone number can contain only digits.';
  const { country, digits } = splitPhone(value);
  if (!digits) return 'Enter a phone number.';
  if (country === '+91') {
    if (digits.length !== 10) return 'Enter a 10-digit mobile number.';
    if (!/^[6-9]/.test(digits)) return 'An Indian mobile number starts with 6, 7, 8 or 9.';
    return null;
  }
  if (digits.length < 6 || digits.length > 14) return 'Enter a valid phone number.';
  return null;
}

/** PAN: five letters, four digits, one letter (ABCDE1234F). */
export function panProblem(value: string): string | null {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.trim().toUpperCase())
    ? null
    : 'Enter a PAN like ABCDE1234F.';
}

/** IFSC: four letters, a zero, six letters or digits (SBIN0001234). */
export function ifscProblem(value: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.trim().toUpperCase())
    ? null
    : 'Enter an IFSC like SBIN0001234.';
}

/** A bank account number: 9 to 18 digits. */
export function bankAccountProblem(value: string): string | null {
  return /^[0-9]{9,18}$/.test(value.replace(/\s/g, ''))
    ? null
    : 'Enter an account number of 9 to 18 digits.';
}

/** An Indian PIN code: six digits, not starting with 0. */
export function pinCodeProblem(value: string): string | null {
  return /^[1-9][0-9]{5}$/.test(value.trim()) ? null : 'Enter a 6-digit PIN code.';
}
