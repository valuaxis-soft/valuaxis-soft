/**
 * How long a comparable of the firm's base can be trusted: from the day it
 * was captured or its data last updated, the months it was captured with (1
 * to 12), or the firm's (six unless it chose others, the same months after
 * which the review flags an old offer). An expired comparable is only marked:
 * the appraiser decides whether to use it, nothing is blocked.
 */
import { todayInMexico } from "./comparable-card";
import { OFFER_MAX_AGE_MONTHS } from "./comparable-review";

/** YYYY-MM-DD plus whole months; a day past the end of the month falls on its last day (31 ago + 6 = 28 feb). */
export function addMonths(day: string, months: number) {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

export type ComparableValidity = {
  /** "Fecha de alta / actualización": the day it was captured or its data last changed, YYYY-MM-DD in Mexico. */
  updatedOn: string;
  /** "Vigente hasta": that day plus its months of validity. */
  validUntil: string;
  /** Past its validity: marked "Vencido", still usable. */
  expired: boolean;
};

/** The months a comparable may be valid for, as the capture and the firm's settings offer them. */
export const COMPARABLE_VALIDITY_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Months of validity: the ones given when they are 1 to 12, otherwise six. */
export const validityMonthsOf = (months: number | null | undefined) =>
  (months && Number.isInteger(months) && months >= 1 && months <= 12 ? months : OFFER_MAX_AGE_MONTHS);

/**
 * The validity of a comparable whose data dates from `updated` (a timestamp,
 * or a day YYYY-MM-DD), for `months` (its own or the firm's; six by default).
 */
export function comparableValidity(updated: Date | string, today = todayInMexico(), months?: number | null): ComparableValidity {
  const updatedOn = typeof updated === "string" ? updated.slice(0, 10) : todayInMexico(updated);
  const validUntil = addMonths(updatedOn, validityMonthsOf(months));
  return { updatedOn, validUntil, expired: today > validUntil };
}

export const VALIDITY_STATUSES = ["VIGENTE", "VENCIDO"] as const;
export type ValidityStatus = (typeof VALIDITY_STATUSES)[number];
export const VALIDITY_STATUS_LABELS: Record<ValidityStatus, string> = { VIGENTE: "Vigente", VENCIDO: "Vencido" };

/**
 * The fields that are the comparable's data: what it is, where, its offer and
 * its source. Changing one renews its validity; rating its factors or its
 * place in the regression is homologation work, and does not.
 */
const DATA_FIELDS = [
  "location", "area", "price", "landUse", "landUseKey", "shape", "zone", "frontCount", "frontage", "depth", "topography",
  "services", "conservation", "quality", "notes", "extra", "characteristicsText", "attributes", "sourceName", "contactName", "contactPhone",
  "url", "offerDate", "consultedOn", "validUntil", "validityMonths", "listingText", "address", "urbanProximity", "operationType", "latitude",
  "longitude", "landArea", "bedrooms", "bathrooms", "constructionType", "propertyDetails", "listingDetails",
] as const;

/** Empty texts, empty objects and missing values are the same "nothing". */
function canonical(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, canonical(item)] as const)
      .filter(([, item]) => item !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? Object.fromEntries(entries) : null;
  }
  return value;
}

/**
 * Whether an edit changes the comparable's data. A field the edit leaves out
 * (undefined) keeps its stored value, so it is not a change.
 */
export function comparableDataChanged(previous: Partial<Record<(typeof DATA_FIELDS)[number], unknown>>, next: Partial<Record<(typeof DATA_FIELDS)[number], unknown>>) {
  return DATA_FIELDS.some((field) => next[field] !== undefined
    && JSON.stringify(canonical(previous[field])) !== JSON.stringify(canonical(next[field])));
}
