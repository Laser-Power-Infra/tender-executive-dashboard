/**
 * A mobile number as WhatsApp wants it: digits only, with country code.
 * A bare 10-digit number is taken as Indian (91). Returns null when it is not a number.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/[\s()+-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}

export const MOBILE_ERROR = "Enter a valid mobile number, e.g. 9876543210 or +91 98765 43210";
