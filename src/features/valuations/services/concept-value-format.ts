import type { Concept, ConceptDateFormat, ConceptValueFormat } from "@/features/valuations/model";

export const NUMERIC_VALUE_FORMAT_OPTIONS: Array<{ value: ConceptValueFormat; label: string; symbol?: string }> = [
  { value: "plain", label: "Sin formato" },
  { value: "mxn", label: "MXN", symbol: "MXN" },
  { value: "m", label: "m", symbol: "m" },
  { value: "m2", label: "m²", symbol: "m²" },
  { value: "m3", label: "m³", symbol: "m³" },
  { value: "km", label: "km", symbol: "km" },
  { value: "km2", label: "km²", symbol: "km²" },
  { value: "cm", label: "cm", symbol: "cm" },
  { value: "mm", label: "mm", symbol: "mm" },
  { value: "ha", label: "ha", symbol: "ha" },
  { value: "in", label: "in", symbol: "in" },
  { value: "ft", label: "ft", symbol: "ft" },
  { value: "percent", label: "%", symbol: "%" },
  { value: "kg", label: "kg", symbol: "kg" },
  { value: "g", label: "g", symbol: "g" },
  { value: "l", label: "L", symbol: "L" },
  { value: "custom", label: "Otra unidad" },
];

export const BOUNDARY_DISTANCE_VALUE_FORMAT_OPTIONS = NUMERIC_VALUE_FORMAT_OPTIONS.filter((option) =>
  option.value === "plain" || option.value === "m" || option.value === "km" ||
  option.value === "cm" || option.value === "mm" || option.value === "custom",
);

export function isBoundaryDistanceValueFormat(value: unknown): value is ConceptValueFormat {
  return value === "plain" || value === "m" || value === "km" || value === "cm" ||
    value === "mm" || value === "custom";
}

const FORMAT_SYMBOLS: Partial<Record<ConceptValueFormat, string>> = {
  mxn: "MXN",
  m: "m",
  m2: "m²",
  m3: "m³",
  km: "km",
  km2: "km²",
  cm: "cm",
  mm: "mm",
  ha: "ha",
  in: "in",
  ft: "ft",
  percent: "%",
  kg: "kg",
  g: "g",
  l: "L",
};

/* ------------------------------------------------------------------ */
/*  Unit Registry — physical unit families and conversion factors       */
/* ------------------------------------------------------------------ */

type UnitFamily = "length" | "area" | "volume" | "mass";

type UnitDefinition = {
  id: ConceptValueFormat;
  family: UnitFamily;
  factorToBase: number;
  symbol: string;
};

const UNIT_REGISTRY: Record<string, UnitDefinition> = {
  // LENGTH (base: m)
  mm: { id: "mm", family: "length", factorToBase: 0.001, symbol: "mm" },
  cm: { id: "cm", family: "length", factorToBase: 0.01, symbol: "cm" },
  m: { id: "m", family: "length", factorToBase: 1, symbol: "m" },
  km: { id: "km", family: "length", factorToBase: 1000, symbol: "km" },
  in: { id: "in", family: "length", factorToBase: 0.0254, symbol: "in" },
  ft: { id: "ft", family: "length", factorToBase: 0.3048, symbol: "ft" },
  // AREA (base: m²)
  m2: { id: "m2", family: "area", factorToBase: 1, symbol: "m²" },
  km2: { id: "km2", family: "area", factorToBase: 1000000, symbol: "km²" },
  ha: { id: "ha", family: "area", factorToBase: 10000, symbol: "ha" },
  // VOLUME (base: m³)
  m3: { id: "m3", family: "volume", factorToBase: 1, symbol: "m³" },
  l: { id: "l", family: "volume", factorToBase: 0.001, symbol: "L" },
  // MASS (base: kg)
  kg: { id: "kg", family: "mass", factorToBase: 1, symbol: "kg" },
  g: { id: "g", family: "mass", factorToBase: 0.001, symbol: "g" },
};

/**
 * Convert a numeric value between two compatible physical units.
 * Returns null when units are not registered, not in the same family,
 * or either is a non-physical format (plain, mxn, percent, custom).
 */
export function convertUnitValue(
  value: number,
  fromUnit: ConceptValueFormat,
  toUnit: ConceptValueFormat,
): number | null {
  const from = UNIT_REGISTRY[fromUnit];
  const to = UNIT_REGISTRY[toUnit];
  if (!from || !to) return null;
  if (from.family !== to.family) return null;
  const baseValue = value * from.factorToBase;
  return baseValue / to.factorToBase;
}

/** Resolve the effective sourceUnit for a concept.
 *  Falls back to valueFormat when sourceUnit is not set (backward compat). */
export function resolveEffectiveSourceUnit(
  concept: Pick<Concept, "valueFormat" | "sourceUnit">,
): ConceptValueFormat {
  return concept.sourceUnit ?? concept.valueFormat ?? "plain";
}

export function isNumericConcept(concept: Pick<Concept, "type">) {
  return concept.type === "number" || concept.type === "currency" || concept.type === "measurement";
}

export function resolveConceptValueFormat(
  concept: Pick<Concept, "type" | "valueFormat">,
): ConceptValueFormat {
  if (concept.valueFormat) return concept.valueFormat;
  if (concept.type === "currency") return "mxn";
  if (concept.type === "measurement") return "m2";
  return "plain";
}

export function conceptValueFormatLabel(concept: Pick<Concept, "type" | "valueFormat" | "customUnit">) {
  const format = resolveConceptValueFormat(concept);
  if (format === "custom") return concept.customUnit?.trim() || "Otra";
  return FORMAT_SYMBOLS[format] ?? "Sin";
}

/** Parse a date string (YYYY-MM-DD or full ISO timestamp) to a Date. */
function parseDateInput(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Try YYYY-MM-DD first (local time, no timezone shift)
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    const date = new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  // Try full ISO timestamp — extract date parts to avoid timezone shift
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})T/.exec(trimmed);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  return undefined;
}

/** Capitalize the first letter of a string. */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Capitalize the month name in a Spanish date string like "12 de febrero de 2024". */
function capitalizeMonth(str: string): string {
  // Match pattern: "DD de MONTH de YYYY" — capitalize the month word
  return str.replace(/(\d+ de )([a-záéíóú]+)( de )/, (_, pre, month, post) => {
    return pre + month.charAt(0).toUpperCase() + month.slice(1) + post;
  });
}

/**
 * Format a date value according to the given format.
 * Input: "2024-02-12" (YYYY-MM-DD)
 * Output depends on format:
 *   - "short":  "12/02/2024"
 *   - "long":   "12 de febrero de 2024"
 *   - "normal": "12 de Febrero de 2024" (capitalized month)
 * Returns "—" for empty/invalid input.
 */
export function formatDateValue(
  value: string,
  format: ConceptDateFormat = "normal",
): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";

  const date = parseDateInput(trimmed);
  if (!date) return trimmed;

  if (format === "short") {
    return date.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // "long" and "normal" use the same Intl options
  const formatted = date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // "normal" capitalizes the month first letter
  return format === "normal" ? capitalizeMonth(formatted) : formatted;
}

export function formatConceptValueForDocument(
  concept: Pick<Concept, "type" | "value" | "valueFormat" | "customUnit" | "sourceUnit" | "dateFormat">,
) {
  if (concept.type === "date") {
    return formatDateValue(concept.value, concept.dateFormat);
  }
  return formatNumericConceptValue(concept);
}

export function formatNumericConceptValue(
  concept: Pick<Concept, "type" | "value" | "valueFormat" | "customUnit" | "sourceUnit">,
) {
  if (!isNumericConcept(concept)) return concept.value.trim();
  return formatNumericValue(concept.value, {
    valueFormat: resolveConceptValueFormat(concept),
    customUnit: concept.customUnit,
    sourceUnit: resolveEffectiveSourceUnit(concept),
  });
}

/** Formats that represent non-physical or non-convertible dimensions. */
const NON_CONVERTIBLE_FORMATS = new Set<ConceptValueFormat>(["plain", "mxn", "percent", "custom"]);

export function formatNumericValue(
  value: string,
  formatMetadata: Pick<Concept, "valueFormat" | "customUnit" | "sourceUnit"> = {},
) {
  const rawValue = value.trim();
  if (!rawValue) return rawValue;

  const format = formatMetadata.valueFormat ?? "plain";
  const sourceUnit = formatMetadata.sourceUnit ?? formatMetadata.valueFormat ?? "plain";
  const numericValue = parseDocumentNumber(rawValue);
  if (!numericValue) return rawValue;

  let displayValue = numericValue;
  if (
    sourceUnit !== format
    && !NON_CONVERTIBLE_FORMATS.has(sourceUnit)
    && !NON_CONVERTIBLE_FORMATS.has(format)
  ) {
    const converted = convertUnitValue(Number(numericValue), sourceUnit, format);
    if (converted !== null) {
      displayValue = formatConvertedNumber(converted);
    }
  }

  const formattedNumber = formatPlainNumber(displayValue);

  if (format === "plain") return formattedNumber;

  if (format === "mxn") {
    const num = Number(numericValue);
    if (!Number.isFinite(num)) return rawValue;
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  const unit = format === "custom" ? formatMetadata.customUnit?.trim() : FORMAT_SYMBOLS[format];
  return unit ? `${formattedNumber} ${unit}` : rawValue;
}

export function normalizeNumericConceptInput(value: string) {
  return normalizeNumericInput(value);
}

export function normalizeNumericInput(value: string) {
  let normalized = value.trim();
  // Remove optional $ currency prefix (MXN canonical)
  normalized = normalized.replace(/^\$\s*/, "");

  // Allow intermediate editing states that are prefixes of valid numbers:
  // "" "-" "-12" "12" "12." "12.5" "1,234" "1,234." "1,234.5"
  // Reject clearly invalid strings (double minus, trailing dot after dot, etc.)

  // Empty or just minus sign — preserve for editing
  if (normalized === "" || normalized === "-") return normalized;

  // Allow trailing minus followed by nothing useful: reject
  // Allow trailing dot: this is a valid intermediate (user is typing decimals)
  // The final regex below handles the full set of valid intermediates

  // Broader intermediate regex: accepts optional trailing dot, optional trailing comma,
  // and incomplete comma groups — all things a user might be mid-typing
  if (/^-?(?:\d{1,3}(?:,\d{3})*|\d+),?$/.test(normalized) || /^-?\d+\.$/.test(normalized)) {
    return normalized.replace(/,/g, "");
  }

  // Final valid numeric: strip commas for the semantic string
  if (/^-?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?$/.test(normalized)) {
    return normalized.replace(/,/g, "");
  }

  // Invalid — return last known good or empty
  return "";
}

function parseDocumentNumber(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : "";
}

/** Format a converted number: up to 6 decimals, no trailing zeros. */
function formatConvertedNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  const str = String(rounded);
  return str.includes(".") ? str.replace(/\.?0+$/, "") : str;
}

function formatPlainNumber(value: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  const decimals = value.includes(".") ? value.split(".")[1]?.length ?? 0 : 0;
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(numericValue);
}

export function getConceptUrlHref(concept: Pick<Concept, "type" | "value">) {
  if (concept.type !== "url") return null;

  const rawValue = concept.value.trim();
  if (!rawValue || /\s/.test(rawValue)) return null;

  const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}
