/**
 * The columns of a market's tables that show a datum of the comparable's card
 * (video 8.9, 26 Nov 2026: «si agregan una columna, ligarlo a algún dato de
 * las fichas… y si yo cambio el nombre de la columna, también en las
 * fichas»). Each datum of the card has one name per market, the card's and
 * the column's: renaming either renames it in both. The fields of the list of
 * characteristics keep their names in that list; the others in
 * `fieldLabels` of the market's settings (JConfiguracion, no migration).
 *
 * Pure: no React, no database.
 */
import { kindOfComparable } from "./comparable-kinds";
import { URBAN_PROXIMITY_LABELS } from "./comparable-card";
import { EMPTY, figure, money, squareMetres } from "./generated-content";
import {
  characteristicFieldsOf,
  isBuiltinCharacteristic,
  isLandComparableType,
  type CharacteristicField,
  type ComparableDto,
  type MarketSettingsDto,
} from "./market-types";
import { parseDecimal } from "./free-formula";

/** The tables of a market's page a column of the card can be added to. */
export const MARKET_LINK_TABLES = ["caracteristicas", "ofertas", "homologacion"] as const;
export type MarketLinkTable = (typeof MARKET_LINK_TABLES)[number];

/** A datum of the card a column may show: its key, the name it has and how a comparable's prints. */
export type CardField = {
  key: string;
  label: string;
  text: (comparable: ComparableDto) => string | null | undefined;
  /** A figure: centered on one line, as the other figures of the tables. */
  figure?: boolean;
};

const shortDate = (value: string | null | undefined) => value?.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2/$1") ?? null;
const count = (value: number | null | undefined) => (value === null || value === undefined ? null : figure(value, Number.isInteger(value) ? 0 : 2));

/**
 * The data of the card that are not in the list of characteristics, with the
 * names the card gives them. «Ubicación en manzana» (intermedio, esquina,
 * manzanero) is where the factor of location comes from (video 8.9, 08:50).
 */
const CARD_FIELDS: readonly CardField[] = [
  { key: "sourceName", label: "Fuente o portal", text: (comparable) => comparable.sourceName },
  { key: "contactPhone", label: "Teléfono", text: (comparable) => comparable.contactPhone, figure: true },
  { key: "contactName", label: "Contacto", text: (comparable) => comparable.contactName },
  { key: "offerDate", label: "Fecha de la oferta", text: (comparable) => shortDate(comparable.offerDate), figure: true },
  { key: "consultedOn", label: "Fecha de consulta", text: (comparable) => shortDate(comparable.consultedOn), figure: true },
  { key: "validUntil", label: "Vigencia de la oferta", text: (comparable) => shortDate(comparable.validUntil), figure: true },
  { key: "url", label: "Liga del anuncio", text: (comparable) => comparable.url },
  { key: "publicationId", label: "ID de publicación", text: (comparable) => comparable.listingDetails?.publicationId, figure: true },
  { key: "kind", label: "Tipo de inmueble", text: (comparable) => kindOfComparable(comparable)?.label },
  { key: "landUse", label: "Uso de suelo", text: (comparable) => comparable.landUse },
  { key: "blockPosition", label: "Ubicación en manzana", text: (comparable) => comparable.propertyDetails?.blockPosition },
  { key: "paving", label: "Pavimento / acceso", text: (comparable) => comparable.propertyDetails?.paving },
  { key: "urbanProximity", label: "Proximidad urbana", text: (comparable) => (comparable.urbanProximity ? URBAN_PROXIMITY_LABELS[comparable.urbanProximity] : null) },
  { key: "landArea", label: "Superficie de terreno (m²)", text: (comparable) => (comparable.landArea ? squareMetres(comparable.landArea) : null), figure: true },
  { key: "constructionType", label: "Tipo de construcción", text: (comparable) => comparable.constructionType },
  { key: "conservation", label: "Conservación", text: (comparable) => comparable.conservation },
  { key: "quality", label: "Calidad", text: (comparable) => comparable.quality },
  { key: "age", label: "Edad (años)", text: (comparable) => count(comparable.propertyDetails?.age), figure: true },
  { key: "levels", label: "Niveles", text: (comparable) => count(comparable.propertyDetails?.levels), figure: true },
  { key: "bedrooms", label: "Recámaras", text: (comparable) => count(comparable.bedrooms), figure: true },
  { key: "bathrooms", label: "Baños", text: (comparable) => count(comparable.bathrooms), figure: true },
  { key: "parking", label: "Estacionamientos", text: (comparable) => count(comparable.propertyDetails?.parking), figure: true },
  { key: "notes", label: "Observaciones", text: (comparable) => comparable.notes },
];

const CARD_FIELD_BY_KEY = new Map(CARD_FIELDS.map((field) => [field.key, field]));

/** The name the card gives one of its data, before the appraiser renames it. */
export const cardFieldDefaultLabel = (key: string) => CARD_FIELD_BY_KEY.get(key)?.label ?? null;

/** The name of a datum of the card in this market: the appraiser's, or the card's. */
export function cardFieldLabel(settings: Pick<MarketSettingsDto, "fieldLabels">, key: string, fallback?: string): string {
  return settings.fieldLabels?.[key]?.trim() || cardFieldDefaultLabel(key) || fallback || key;
}

/** The names of the card's data the appraiser changed, keyed as the card reads them. */
export function cardFieldLabels(settings: Pick<MarketSettingsDto, "fieldLabels">): Record<string, string> {
  return Object.fromEntries(Object.entries(settings.fieldLabels ?? {}).filter(([, label]) => label.trim()));
}

/** The names with one of them changed; the card's own name (or an empty one) takes the appraiser's out. */
export function withCardFieldLabel(labels: Record<string, string> | null | undefined, key: string, label: string): Record<string, string> {
  const { [key]: _previous, ...rest } = labels ?? {};
  const name = label.trim();
  const own = cardFieldDefaultLabel(key);
  return !name || (own !== null && name.toLocaleLowerCase("es-MX") === own.toLocaleLowerCase("es-MX")) ? rest : { ...rest, [key]: name };
}

/**
 * A datum of the card renamed, from a header of its column or from the card
 * (video 8.9, both directions): a characteristic of the list takes the name
 * there (an empty one keeps the one it had); any other datum, in the
 * market's `fieldLabels`. What changes in the market's settings.
 */
export function renamedCardField(
  settings: Pick<MarketSettingsDto, "characteristicFields" | "comparableType" | "fieldLabels">,
  key: string,
  label: string,
): Pick<MarketSettingsDto, "characteristicFields" | "fieldLabels"> | Record<string, never> {
  const list = characteristicFieldsOf(settings);
  if (list.some((field) => field.key === key)) {
    return label.trim() ? { characteristicFields: list.map((field) => (field.key === key ? { ...field, label: label.trim() } : field)) } : {};
  }
  return { fieldLabels: withCardFieldLabel(settings.fieldLabels, key, label) };
}

/** A figure of the list of characteristics as the column prints it: areas with m², frente and fondo with m. */
function characteristicCell(comparable: ComparableDto, field: CharacteristicField): string | null {
  const key = field.key;
  if (!isBuiltinCharacteristic(key)) {
    const text = comparable.extra?.[key];
    if (!text || !field.kind) return text ?? null;
    const value = parseDecimal(text);
    if (value === null) return text;
    return field.kind === "area" ? squareMetres(value) : figure(value, Number.isInteger(value) ? 0 : 2);
  }
  switch (key) {
    case "frontage": case "depth": return comparable[key] ? `${figure(comparable[key])} m` : null;
    case "area": return comparable.area ? squareMetres(comparable.area) : null;
    case "price": return comparable.price ? money(comparable.price) : null;
    case "frontCount": return count(comparable.frontCount);
    case "landUseKey": return comparable.landUseKey || comparable.landUse?.split(" (")[0] || null;
    default: {
      const value = comparable[key];
      return value === null || value === undefined ? null : String(value);
    }
  }
}

/**
 * Every datum of the card a column can show in this market: the list of
 * characteristics first, with the names it has there (the same list the card
 * shows), then the rest of the card's data with theirs.
 */
export function linkableCardFields(settings: Pick<MarketSettingsDto, "characteristicFields" | "comparableType" | "fieldLabels">): CardField[] {
  const characteristics = characteristicFieldsOf(settings);
  const keys = new Set(characteristics.map((field) => field.key));
  return [
    ...characteristics.map((field): CardField => ({
      key: field.key,
      label: field.label,
      text: (comparable) => characteristicCell(comparable, field),
      figure: isBuiltinCharacteristic(field.key) ? ["frontCount", "frontage", "depth", "area", "price"].includes(field.key) : field.kind !== undefined,
    })),
    ...CARD_FIELDS
      .filter((field) => !keys.has(field.key))
      // Land has no construction; built properties have no «ubicación en manzana» of their own.
      .filter((field) => !(isLandComparableType(settings.comparableType) && ["constructionType", "conservation", "quality", "levels", "bedrooms", "bathrooms", "parking"].includes(field.key)))
      .map((field) => ({ ...field, label: cardFieldLabel(settings, field.key) })),
  ];
}

/** The id of the column that shows a datum of the card: stable, so the appraiser's formats and widths follow it. */
export const linkedColumnId = (key: string) => `campo-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;


/** The data linked as columns of a table, in the order added, each once and only the ones the card has. */
export function linkedColumnsOf(settings: Pick<MarketSettingsDto, "linkedColumns" | "characteristicFields" | "comparableType" | "fieldLabels">, table: MarketLinkTable): CardField[] {
  const fields = new Map(linkableCardFields(settings).map((field) => [field.key, field]));
  const keys = [...new Set(settings.linkedColumns?.[table] ?? [])];
  return keys.flatMap((key) => (fields.has(key) ? [fields.get(key)!] : []));
}

/** The linked columns with one more datum (at the end) or one less. */
export function withLinkedColumn(linked: MarketSettingsDto["linkedColumns"], table: MarketLinkTable, key: string, on: boolean): NonNullable<MarketSettingsDto["linkedColumns"]> {
  const current = linked?.[table] ?? [];
  const next = on ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key);
  return { ...linked, [table]: next };
}

/** What the column of a datum prints for a comparable: its text, or «—». */
export const linkedCellText = (field: CardField, comparable: ComparableDto) => field.text(comparable)?.toString().trim() || EMPTY;

/** The names of the frente and fondo of the basis and of the subject's area, as the appraiser writes them (video 8.10, 09:22). */
export const SPEC_LABEL_KEYS = { subjectArea: "spec.subjectArea", baseArea: "spec.baseArea", frontage: "spec.frontage", depth: "spec.depth" } as const;

/** The name of a datum of the specifications: the appraiser's, or the one of the format. */
export const specLabel = (settings: Pick<MarketSettingsDto, "fieldLabels">, key: keyof typeof SPEC_LABEL_KEYS, fallback: string) =>
  settings.fieldLabels?.[SPEC_LABEL_KEYS[key]]?.trim() || fallback;
