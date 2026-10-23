/**
 * What identifies a comparable in the firm's base and where it is: its
 * number ("C-00123"), its structured address, and the standard fields of the
 * capture (urban proximity, type of operation). Pure, shared by the browser
 * and the server.
 */

/** "C-00123": the comparable's number in the firm's base; copies of it keep the number. */
export function formatComparableId(folio: number | null | undefined) {
  return folio && folio > 0 ? `C-${String(folio).padStart(5, "0")}` : null;
}

/** "C-00123", "c123" or "123" → 123; anything else → null. */
export function parseComparableId(text: string) {
  const match = /^\s*(?:c\s*-?\s*)?0*(\d{1,9})\s*$/i.exec(text);
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const ADDRESS_PARTS = ["state", "municipality", "postalCode", "neighborhood", "street", "number"] as const;
export type AddressPart = (typeof ADDRESS_PARTS)[number];
/** The location in parts, as the competitor's and the SHF formats ask for it; every part is optional. */
export type ComparableAddress = Partial<Record<AddressPart, string | null>>;

export const ADDRESS_LABELS: Record<AddressPart, string> = {
  state: "Estado",
  municipality: "Municipio o alcaldía",
  postalCode: "Código postal",
  neighborhood: "Colonia",
  street: "Calle",
  number: "Número",
};

const part = (value: string | null | undefined) => value?.trim() ?? "";

/** "Juárez 12, col. Centro, C.P. 47180, Arandas, Jalisco": the parts as one line, the way the dictamen prints a location. */
export function formatAddress(address: ComparableAddress | null | undefined) {
  if (!address) return "";
  const street = [part(address.street), part(address.number)].filter(Boolean).join(" ");
  const neighborhood = part(address.neighborhood) ? `col. ${part(address.neighborhood)}` : "";
  const postalCode = part(address.postalCode) ? `C.P. ${part(address.postalCode)}` : "";
  return [street, neighborhood, postalCode, part(address.municipality), part(address.state)].filter(Boolean).join(", ");
}

/** True when the address has at least one part captured. */
export const hasAddress = (address: ComparableAddress | null | undefined) =>
  Boolean(address && ADDRESS_PARTS.some((key) => part(address[key])));

/**
 * "Proximidad urbana" of the SHF rules: the five zones a comparable may be
 * in, numbered as the rules number them.
 */
export const URBAN_PROXIMITIES = ["CENTRICA", "INTERMEDIA", "PERIFERICA", "EXPANSION", "RURAL"] as const;
export type UrbanProximity = (typeof URBAN_PROXIMITIES)[number];
export const URBAN_PROXIMITY_LABELS: Record<UrbanProximity, string> = {
  CENTRICA: "1 Céntrica",
  INTERMEDIA: "2 Intermedia",
  PERIFERICA: "3 Periférica",
  EXPANSION: "4 De expansión",
  RURAL: "5 Rural",
};

/** Offered while typing the type of construction of a built comparable; any other text is kept as written. */
export const CONSTRUCTION_TYPE_SUGGESTIONS = [
  "Casa habitación", "Departamento", "Local comercial", "Oficina", "Bodega", "Nave industrial", "Edificio", "Consultorio", "Hotel",
];

export const OPERATION_TYPES = ["VENTA", "RENTA"] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];
export const OPERATION_TYPE_LABELS: Record<OperationType, string> = { VENTA: "Venta", RENTA: "Renta" };

/** Latitude and longitude are both captured or both left out; each within its range. */
export function coordinatesError(latitude: number | null | undefined, longitude: number | null | undefined) {
  const hasLatitude = latitude !== null && latitude !== undefined;
  const hasLongitude = longitude !== null && longitude !== undefined;
  if (hasLatitude !== hasLongitude) return "Captura la latitud y la longitud, o deja las dos vacías.";
  if (hasLatitude && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) return "La latitud va de -90 a 90.";
  if (hasLongitude && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) return "La longitud va de -180 a 180.";
  return null;
}

/** A day YYYY-MM-DD as "23 oct 2026". */
export const formatDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Today in Mexico City, YYYY-MM-DD: the default "fecha de consulta". */
export function todayInMexico(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Currencies of an offer: kept as captured, never converted. */
export const CURRENCIES = ["MXN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** What the unit price of an offer divides by ("Base del unitario" of the master workbook). */
export const UNIT_BASES = ["TERRENO_M2", "CONSTRUCCION_M2", "TERRENO_HA"] as const;
export type UnitBasis = (typeof UNIT_BASES)[number];
export const UNIT_BASIS_LABELS: Record<UnitBasis, string> = {
  TERRENO_M2: "Terreno m²",
  CONSTRUCCION_M2: "Construcción m²",
  TERRENO_HA: "Terreno ha",
};

/** "Datos verificados" of the master workbook. */
export const DATA_VERIFIED = ["SI", "NO", "PARCIAL"] as const;
export type DataVerified = (typeof DATA_VERIFIED)[number];
export const DATA_VERIFIED_LABELS: Record<DataVerified, string> = { SI: "Sí", NO: "No", PARCIAL: "Parcialmente" };

/** The property facts of the master workbook that the homologation does not use. */
export type ComparablePropertyDetails = {
  age?: number | null;
  levels?: number | null;
  parking?: number | null;
  paving?: string | null;
  blockPosition?: string | null;
  unitBasis?: UnitBasis | null;
};

/** The listing facts of the master workbook: its id in the portal, currency, photo link, dates and verification. */
export type ComparableListingDetails = {
  publicationId?: string | null;
  currency?: Currency | null;
  photoUrl?: string | null;
  priceChangedOn?: string | null;
  dataOrigin?: string | null;
  extractionConfidence?: string | null;
  dataVerified?: DataVerified | null;
};

/**
 * The unit price of an offer by the base it is quoted on: per m² of land, per
 * m² built, or per hectare of land. Null when the area it needs is missing.
 */
export function unitPriceByBasis(price: number | null, basis: UnitBasis, areas: { landArea: number | null; builtArea: number | null }) {
  if (!price || price <= 0) return null;
  const area = basis === "CONSTRUCCION_M2" ? areas.builtArea : areas.landArea;
  if (!area || area <= 0) return null;
  return basis === "TERRENO_HA" ? price / (area / 10_000) : price / area;
}
