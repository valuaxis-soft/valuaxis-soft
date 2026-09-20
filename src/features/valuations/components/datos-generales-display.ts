const ROMAN_DIGITS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

const LEADING_ROMAN = /^\s*([IVXLCDM]+)\.\s+(.+)$/i;

export function toRomanNumeral(position: number) {
  if (!Number.isInteger(position) || position < 1 || position > 3999) {
    return String(position);
  }

  let remainder = position;
  let roman = "";
  for (const [value, digit] of ROMAN_DIGITS) {
    while (remainder >= value) {
      roman += digit;
      remainder -= value;
    }
  }
  return roman;
}

export function stripLeadingRomanNumeral(title: string) {
  const match = title.match(LEADING_ROMAN);
  if (!match) return title.trim();
  const candidate = match[1].toUpperCase();
  return isCanonicalRoman(candidate) ? match[2].trim() : title.trim();
}

export function formatDatosBlockTitle(title: string, visiblePosition: number) {
  const editableTitle = stripLeadingRomanNumeral(title) || "No se proporcionó";
  return `${toRomanNumeral(visiblePosition)}. ${editableTitle}`;
}

function isCanonicalRoman(candidate: string) {
  let value = 0;
  let offset = 0;
  for (const [digitValue, digit] of ROMAN_DIGITS) {
    while (candidate.startsWith(digit, offset)) {
      value += digitValue;
      offset += digit.length;
    }
  }
  return offset === candidate.length && toRomanNumeral(value) === candidate;
}
