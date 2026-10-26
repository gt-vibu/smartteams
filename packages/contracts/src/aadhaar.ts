/**
 * Aadhaar format check, shared so the form can say what is wrong before submitting. The API
 * repeats it and also refuses a number already recorded for another employee.
 */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function aadhaarDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12);
}

/** `234123412346` → `2341 2341 2346`, as printed on the card. */
export function formatAadhaar(value: string): string {
  return aadhaarDigits(value).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Why a typed Aadhaar is not acceptable, or null when it is. */
export function aadhaarProblem(value: string): string | null {
  const digits = aadhaarDigits(value);
  if (digits.length === 0) return 'Aadhaar number is required.';
  if (digits.length < 12) return 'Aadhaar has 12 digits.';
  if (/^[01]/.test(digits)) return 'An Aadhaar number never starts with 0 or 1.';
  let check = 0;
  [...digits].reverse().forEach((digit, index) => {
    check = D[check]![P[index % 8]![Number(digit)]!]!;
  });
  return check === 0 ? null : 'This is not a valid Aadhaar number. Check for a typing mistake.';
}
