/**
 * The data of a machinery offer as the columns of its market's tables show
 * them, as a real estate market's columns show the data of the card (video
 * 8.9, 26 Nov 2026: «si agregan una columna, ligarlo a algún dato de las
 * fichas… y si yo cambio el nombre de la columna, también en las fichas»).
 * Each datum has one name in the market: renamed in a column, its row of the
 * technical characteristics and its card read the new one (`fieldLabels` of
 * the capture, JMercado; no migration).
 *
 * Pure: no React, no database.
 */
import { formatComparableId } from "./comparable-card";
import { EMPTY, figure, money, percent } from "./generated-content";
import type { MachineryLinkTable, MachineryMarketDto, MachineryOfferDto } from "./machinery-types";
import { linkedColumnId } from "./market-table-columns";

/** A datum of the offer: its key, the name the book gives it and how an offer's prints. */
export type MachineryOfferField = {
  key: string;
  label: string;
  text: (offer: MachineryOfferDto) => string;
  /** A figure: centered on one line, as the other figures of the tables. */
  figure?: boolean;
};

const cell = (value: string | null | undefined) => value?.trim() || EMPTY;
const rate = (value: number) => percent(value, Number.isInteger(Math.round(value * 1e6) / 1e4) ? 0 : 2);

/** Every datum of an offer, in the order of its card: the summary, the contact, then what homologates it. */
export const MACHINERY_OFFER_FIELDS: readonly MachineryOfferField[] = [
  { key: "folio", label: "ID", text: (offer) => formatComparableId(offer.folio) ?? EMPTY, figure: true },
  { key: "description", label: "Descripción", text: (offer) => cell(offer.description) },
  { key: "brand", label: "Marca", text: (offer) => cell(offer.brand) },
  { key: "model", label: "Modelo", text: (offer) => cell(offer.model) },
  { key: "year", label: "Año", text: (offer) => cell(offer.year), figure: true },
  { key: "hours", label: "Horas", text: (offer) => cell(offer.hours), figure: true },
  { key: "attachments", label: "Aditamentos", text: (offer) => cell(offer.attachments) },
  { key: "date", label: "Fecha", text: (offer) => cell(offer.date), figure: true },
  { key: "price", label: "Valor de Oferta", text: (offer) => (offer.price === null ? EMPTY : money(offer.price)), figure: true },
  { key: "contact", label: "Contacto", text: (offer) => cell(offer.contact) },
  { key: "company", label: "Empresa", text: (offer) => cell(offer.company) },
  { key: "phone", label: "Teléfono", text: (offer) => cell(offer.phone), figure: true },
  { key: "email", label: "Correo", text: (offer) => cell(offer.email) },
  { key: "link", label: "Link", text: (offer) => cell(offer.link) },
  { key: "location", label: "Ubicación", text: (offer) => cell(offer.location) },
  { key: "notes", label: "Observaciones", text: (offer) => cell(offer.notes) },
  { key: "fees", label: "F.E.E.S.", text: (offer) => rate(offer.fees), figure: true },
  { key: "installation", label: "Gastos Instal.", text: (offer) => rate(offer.installation), figure: true },
  { key: "age", label: "Edad", text: (offer) => (offer.age === null ? EMPTY : figure(offer.age, 0)), figure: true },
  { key: "usefulLife", label: "V.U.T.", text: (offer) => (offer.usefulLife === null ? EMPTY : figure(offer.usefulLife, 0)), figure: true },
  { key: "rating", label: "Calif. conservación", text: (offer) => (offer.rating === null ? EMPTY : String(offer.rating)), figure: true },
];

export const MACHINERY_OFFER_FIELD_KEYS = MACHINERY_OFFER_FIELDS.map((field) => field.key);
const FIELD_BY_KEY = new Map(MACHINERY_OFFER_FIELDS.map((field) => [field.key, field]));

/** The name of a datum of the offers before the appraiser renames it: the book's (Kms for a vehicle's use). */
export function machineryFieldDefaultLabel(key: string, options: { vehicle?: boolean } = {}): string {
  if (key === "hours" && options.vehicle) return "Kms";
  return FIELD_BY_KEY.get(key)?.label ?? key;
}

/** The name the appraiser gave a datum, if he renamed it. */
export const machineryOwnFieldLabel = (market: Pick<MachineryMarketDto, "fieldLabels">, key: string) => market.fieldLabels?.[key]?.trim() || null;

/** The name of a datum of the offers in this market: the appraiser's, or the book's. */
export const machineryFieldLabel = (market: Pick<MachineryMarketDto, "fieldLabels">, key: string, options: { vehicle?: boolean } = {}) =>
  machineryOwnFieldLabel(market, key) ?? machineryFieldDefaultLabel(key, options);

/** The names with one changed; the book's own name (or an empty one) takes the appraiser's out. */
export function withMachineryFieldLabel(labels: Record<string, string> | null | undefined, key: string, label: string, options: { vehicle?: boolean } = {}): Record<string, string> {
  const { [key]: _previous, ...rest } = labels ?? {};
  const name = label.trim();
  const own = machineryFieldDefaultLabel(key, options);
  return !name || name.toLocaleLowerCase("es-MX") === own.toLocaleLowerCase("es-MX") ? rest : { ...rest, [key]: name };
}

/**
 * The data each table shows on its own (their columns, by id): what the book
 * prints. Their headers are the data's names; the columns the appraiser links
 * come after them.
 */
export const MACHINERY_TABLE_FIELDS: Record<MachineryLinkTable, ReadonlyArray<{ id: string; field: string }>> = {
  resumen: [
    { id: "col-folio", field: "folio" },
    { id: "col-2", field: "description" }, { id: "col-3", field: "brand" }, { id: "col-4", field: "model" }, { id: "col-5", field: "year" },
    { id: "col-6", field: "hours" }, { id: "col-7", field: "attachments" }, { id: "col-8", field: "date" }, { id: "col-9", field: "price" },
  ],
  contacto: [
    { id: "col-2", field: "contact" }, { id: "col-3", field: "company" }, { id: "col-4", field: "phone" }, { id: "col-5", field: "email" },
    { id: "col-6", field: "link" }, { id: "col-7", field: "location" }, { id: "col-8", field: "notes" },
  ],
  homologacion: [{ id: "col-2", field: "price" }, { id: "col-3", field: "fees" }, { id: "col-4", field: "installation" }],
};

/** The data linked as columns of a table, in the order added, each once, and none the table already shows. */
export function machineryLinkedFields(market: Pick<MachineryMarketDto, "linkedColumns">, table: MachineryLinkTable): MachineryOfferField[] {
  const own = new Set(MACHINERY_TABLE_FIELDS[table].map((column) => column.field));
  return [...new Set(market.linkedColumns?.[table] ?? [])].flatMap((key) => (FIELD_BY_KEY.has(key) && !own.has(key) ? [FIELD_BY_KEY.get(key)!] : []));
}

/** The data a table may add as a column, with the names they have in the market and whether each already is one. */
export function machineryLinkableFields(market: Pick<MachineryMarketDto, "linkedColumns" | "fieldLabels">, table: MachineryLinkTable, options: { vehicle?: boolean } = {}) {
  const own = new Set(MACHINERY_TABLE_FIELDS[table].map((column) => column.field));
  const linked = new Set(market.linkedColumns?.[table] ?? []);
  return MACHINERY_OFFER_FIELDS.filter((field) => !own.has(field.key))
    .map((field) => ({ key: field.key, label: machineryFieldLabel(market, field.key, options), linked: linked.has(field.key) }));
}

/** The linked columns with one more datum (at the end) or one less. */
export function withMachineryLinkedColumn(linked: MachineryMarketDto["linkedColumns"], table: MachineryLinkTable, key: string, on: boolean) {
  const current = linked?.[table] ?? [];
  return { ...linked, [table]: on ? [...current.filter((item) => item !== key), key] : current.filter((item) => item !== key) };
}

/** The datum a column of a table of the market shows, by the column's id; null for the calculation's own columns. */
export function machineryColumnField(market: Pick<MachineryMarketDto, "linkedColumns">, table: MachineryLinkTable, columnId: string): string | null {
  const id = columnId.toLowerCase();
  const fixed = MACHINERY_TABLE_FIELDS[table].find((column) => column.id === id);
  if (fixed) return fixed.field;
  return machineryLinkedFields(market, table).find((field) => linkedColumnId(field.key) === id)?.key ?? null;
}

/** Whether a column of the table is one the appraiser linked (taking it out unlinks it). */
export const isMachineryLinkedColumn = (market: Pick<MachineryMarketDto, "linkedColumns">, table: MachineryLinkTable, columnId: string) =>
  machineryLinkedFields(market, table).some((field) => linkedColumnId(field.key) === columnId.toLowerCase());
