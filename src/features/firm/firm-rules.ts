/**
 * The firm's defaults: the validity a new valuation gets and its folio prefix.
 */

export const DEFAULT_FOLIO_PREFIX = "VLO";

const FOLIO_PADDING = 4;

/** VLO + 12 = VLO-0012. */
export function formatValuationFolio(prefix: string, consecutive: number) {
  return `${prefix}-${String(consecutive).padStart(FOLIO_PADDING, "0")}`;
}

/** Letters and digits only, uppercase: it becomes part of every folio (VLO-0001). */
export const normalizeFolioPrefix = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Adds calendar months to a YYYY-MM-DD date, clamping to the month's last day
 * (31 Aug + 6 months = 28 or 29 Feb). Returns YYYY-MM-DD.
 */
export function addMonthsToIsoDate(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Today in Mexico City as YYYY-MM-DD, whatever the server's time zone. */
export const todayInMexico = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
