/**
 * Phone numbers as the verification stores them: E.164 (+52 and ten digits
 * for Mexico). People type them in every way, so separators are ignored and a
 * Mexican number may come as its ten digits alone.
 */

const MEXICO = "52";

/**
 * The number in E.164, or null when it cannot be one. Accepted: ten digits
 * (a Mexican number), 52 or +52 and ten digits, the old mobile prefix +521 and
 * ten digits, and any other country written with + (8 to 15 digits).
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 40) return null;
  // Spaces, dashes, dots and parentheses are how people group digits; anything else is not a phone.
  if (!/^\+?[\d\s\-.()]+$/.test(trimmed)) return null;
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) digits = digits.slice(2);

  if (!international) {
    if (digits.length === 10) return `+${MEXICO}${digits}`;
    if (digits.length === 12 && digits.startsWith(MEXICO)) return `+${digits}`;
    if (digits.length === 13 && digits.startsWith(`${MEXICO}1`)) return `+${MEXICO}${digits.slice(3)}`;
    return null;
  }
  if (digits.startsWith(MEXICO)) {
    const national = digits.slice(2);
    if (national.length === 10) return `+${digits}`;
    if (national.length === 11 && national.startsWith("1")) return `+${MEXICO}${national.slice(1)}`;
    return null;
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

/** For logs and the audit: the country and the last four digits, never the whole number. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const last = digits.slice(-4);
  const country = digits.startsWith(MEXICO) ? `+${MEXICO} ` : "+";
  return `${country}••••••${last}`;
}

/** How the owner reads his own number: +52 3312345678 (area codes are of two or three digits, so no grouping). */
export function formatPhone(e164: string): string {
  return e164.startsWith(`+${MEXICO}`) ? `+${MEXICO} ${e164.slice(3)}` : e164;
}
