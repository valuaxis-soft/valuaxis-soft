/**
 * The review of the comparables of a valuation ("revisión de fichas de
 * mercado"): the state the appraiser gives each one after opening its listing,
 * the checklist, and the warnings the system raises. The appraiser's
 * judgement rules: nothing here blocks or changes a calculation.
 */
import { formatDay, hasAddress, type ComparableAddress } from "./comparable-card";
import type { ComparableValidity } from "./comparable-validity";
import { isBuiltComparableType, type ComparableType } from "./market-types";

export const REVIEW_STATUSES = ["POR_REVISAR", "VERIFICADO", "CON_OBSERVACIONES", "RECHAZADO"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  POR_REVISAR: "Por revisar",
  VERIFICADO: "Verificado",
  CON_OBSERVACIONES: "Con observaciones",
  RECHAZADO: "Rechazado",
};

/** What the appraiser checks against the listing, in the order of the competitor's review. */
export const REVIEW_CHECKS = ["photo", "price", "landArea", "builtArea", "contact", "address", "link"] as const;
export type ReviewCheck = (typeof REVIEW_CHECKS)[number];
export const REVIEW_CHECK_LABELS: Record<ReviewCheck, string> = {
  photo: "La foto coincide con el anuncio",
  price: "El precio coincide",
  landArea: "Superficie de terreno",
  builtArea: "Superficie construida",
  contact: "Contacto del anunciante",
  address: "Dirección completa",
  link: "El enlace sigue vigente",
};

export type ComparableReviewDto = {
  status: ReviewStatus;
  /** Each check marked; a check left out is not reviewed yet. */
  checks: Partial<Record<ReviewCheck, boolean>>;
  notes: string | null;
  reviewedBy: string | null;
  /** ISO timestamp of the last change of the review. */
  reviewedAt: string | null;
};

export const PENDING_REVIEW: ComparableReviewDto = { status: "POR_REVISAR", checks: {}, notes: null, reviewedBy: null, reviewedAt: null };

/**
 * ±20 %: a building comparable whose built surface differs more than this
 * from the subject's is usually not comparable (the competitor's rule of thumb).
 * TODO: make it a setting of the firm, beside the factor ranges, if the appraiser asks for it.
 */
export const BUILT_AREA_TOLERANCE = 0.2;
/** An offer older than this many months is flagged as possibly stale. */
export const OFFER_MAX_AGE_MONTHS = 6;

/** Names of listing portals: a contact that is only one of them is not the advertiser. */
const PORTALS = [
  "inmuebles24", "lamudi", "vivanuncios", "mercado libre", "mercadolibre", "propiedades", "mitula", "icasas", "segundamano",
  "metros cubicos", "metroscubicos", "trovit", "facebook", "facebook marketplace", "marketplace", "easybroker", "nocnok",
];

const plain = (value: string | null | undefined) =>
  (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** "Inmuebles24.com", "www.lamudi.com.mx", "Mercado Libre" → a portal; a person or an agency → not. */
export function isPortalName(value: string | null | undefined) {
  const name = plain(value).replace(/^www\./, "").replace(/\.(com|mx|net)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(name) && PORTALS.includes(name);
}

export type ComparableWarningKey = "BUILT_AREA" | "NO_NUMBER" | "PORTAL_CONTACT" | "NO_SCREENSHOT" | "OLD_OFFER" | "EXPIRED" | "DUPLICATE";
export type ComparableWarning = { key: ComparableWarningKey; message: string };

export type WarningInput = {
  location: string;
  address?: ComparableAddress | null;
  area: number | null;
  sourceName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  offerDate: string | null;
  consultedOn?: string | null;
  hasScreenshot: boolean;
  /** Its validity in the firm's base, from the date of its data (comparableValidity). */
  validity?: ComparableValidity | null;
};

/** Built area difference against the subject's, as a fraction (0.25 = 25 %); null when either is missing. */
export function builtAreaDifference(area: number | null, subjectArea: number | null) {
  if (!area || !subjectArea || area <= 0 || subjectArea <= 0) return null;
  return (area - subjectArea) / subjectArea;
}

/** Whole months from `from` to `to`, both YYYY-MM-DD. */
export function monthsBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

const percent = (value: number) => `${Math.round(Math.abs(value) * 100)} %`;

/**
 * What the appraiser should look at in a comparable before trusting it.
 * `subjectArea` is the subject's built area of the market (buildings only).
 */
export function comparableWarnings(
  comparable: WarningInput,
  context: { type: ComparableType; subjectArea: number | null; today: string },
): ComparableWarning[] {
  const warnings: ComparableWarning[] = [];
  const difference = isBuiltComparableType(context.type) ? builtAreaDifference(comparable.area, context.subjectArea) : null;
  if (difference !== null && Math.abs(difference) > BUILT_AREA_TOLERANCE + 1e-9) {
    warnings.push({
      key: "BUILT_AREA",
      message: `La superficie construida es ${percent(difference)} ${difference > 0 ? "mayor" : "menor"} que la del sujeto (más de ±${percent(BUILT_AREA_TOLERANCE)}): puede no ser comparable.`,
    });
  }
  // A structured address needs its number; a single text, a digit somewhere in it.
  const numbered = hasAddress(comparable.address)
    ? Boolean(comparable.address?.number?.trim()) || /\d/.test(comparable.address?.street ?? "")
    : /\d/.test(comparable.location);
  if (!numbered) warnings.push({ key: "NO_NUMBER", message: "La dirección no tiene número." });
  const contact = comparable.contactName?.trim() ?? "";
  const onlyPortal = !contact || isPortalName(contact) || plain(contact) === plain(comparable.sourceName);
  if (onlyPortal && !comparable.contactPhone?.trim()) {
    warnings.push({ key: "PORTAL_CONTACT", message: "El contacto es solo el portal: anota el nombre o el teléfono del anunciante." });
  }
  if (!comparable.hasScreenshot) warnings.push({ key: "NO_SCREENSHOT", message: "Sin pantalla de referencia." });
  const date = comparable.offerDate ?? comparable.consultedOn ?? null;
  if (date && monthsBetween(date, context.today) >= OFFER_MAX_AGE_MONTHS) {
    warnings.push({ key: "OLD_OFFER", message: `La oferta tiene más de ${OFFER_MAX_AGE_MONTHS} meses.` });
  }
  // Six months from its capture or last update (comparable-validity); only a warning, as every one of these.
  if (comparable.validity?.expired) {
    warnings.push({
      key: "EXPIRED",
      message: `Vencido: sus datos son del ${formatDay(comparable.validity.updatedOn)} y su vigencia terminó el ${formatDay(comparable.validity.validUntil)}. Actualízalo si lo vas a usar.`,
    });
  }
  return warnings;
}
