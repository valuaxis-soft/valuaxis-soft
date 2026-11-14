/**
 * The columns of the list of valuations as a spreadsheet shows them: which
 * are visible, in what order and how wide, and the order a header click
 * gives. Kept per user in `JPreferencias.valuationListColumns` (migration
 * 058), so the layout follows the person to any computer. Pure.
 */
import { z } from "zod";
import type { ValuationSortKey } from "./valuation-list-params";

export const VALUATION_COLUMNS = [
  "folio", "titulo", "cliente", "ubicacion", "tipo", "tipoAvaluo", "estado", "valuador", "creacion", "modificacion", "conclusion", "version",
] as const;
export type ValuationColumn = (typeof VALUATION_COLUMNS)[number];

export const VALUATION_COLUMN_LABELS: Record<ValuationColumn, string> = {
  folio: "Folio",
  titulo: "Título",
  cliente: "Cliente",
  ubicacion: "Ubicación",
  tipo: "Tipo de bien",
  tipoAvaluo: "Tipo de avalúo",
  estado: "Estado",
  valuador: "Valuador",
  creacion: "Creado",
  modificacion: "Última modificación",
  conclusion: "Concluido",
  version: "Versión",
};

/** The order a click on each header gives; «Ubicación» is a text of the property, not sortable in the database. */
export const VALUATION_COLUMN_SORT: Record<ValuationColumn, ValuationSortKey | null> = {
  folio: "folio",
  titulo: "titulo",
  cliente: "cliente",
  ubicacion: null,
  tipo: "tipo",
  tipoAvaluo: "tipoavaluo",
  estado: "estado",
  valuador: "valuador",
  creacion: "creacion",
  modificacion: "modificacion",
  conclusion: "conclusion",
  version: "version",
};

export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 640;

const DEFAULT_WIDTHS: Record<ValuationColumn, number> = {
  folio: 96, titulo: 180, cliente: 150, ubicacion: 170, tipo: 116, tipoAvaluo: 140, estado: 132, valuador: 136,
  creacion: 120, modificacion: 114, conclusion: 120, version: 84,
};

const HIDDEN_BY_DEFAULT: ReadonlySet<ValuationColumn> = new Set(["tipoAvaluo", "creacion", "conclusion", "version"]);

export type ValuationColumnSetting = { key: ValuationColumn; visible: boolean; width: number };
/** The columns in their order; every column is always present, hidden ones included. */
export type ValuationColumnLayout = ValuationColumnSetting[];

export function defaultValuationColumns(): ValuationColumnLayout {
  return VALUATION_COLUMNS.map((key) => ({ key, visible: !HIDDEN_BY_DEFAULT.has(key), width: DEFAULT_WIDTHS[key] }));
}

export const defaultColumnWidth = (key: ValuationColumn) => DEFAULT_WIDTHS[key];

const clampWidth = (width: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
const isColumn = (value: unknown): value is ValuationColumn => (VALUATION_COLUMNS as readonly string[]).includes(value as string);

/** What `PATCH /api/cuenta/preferencias` accepts as `valuationListColumns`. */
export const valuationColumnsSchema = z.object({
  columns: z.array(z.object({
    key: z.string().max(40),
    visible: z.boolean(),
    width: z.number().finite(),
  }).strict()).max(40),
}).strict();

/**
 * A stored layout as a usable one: unknown columns are dropped, missing ones
 * appended with their defaults, widths clamped and at least one column
 * visible. Anything unreadable is the default, so a stale value never breaks
 * the list.
 */
export function resolveValuationColumns(stored: unknown): ValuationColumnLayout {
  const parsed = valuationColumnsSchema.safeParse(stored);
  if (!parsed.success) return defaultValuationColumns();
  const seen = new Set<ValuationColumn>();
  const layout: ValuationColumnLayout = [];
  for (const column of parsed.data.columns) {
    if (!isColumn(column.key) || seen.has(column.key)) continue;
    seen.add(column.key);
    layout.push({ key: column.key, visible: column.visible, width: clampWidth(column.width) });
  }
  for (const column of defaultValuationColumns()) if (!seen.has(column.key)) layout.push({ ...column, visible: false });
  if (!layout.some((column) => column.visible)) return defaultValuationColumns();
  return layout;
}

export const visibleValuationColumns = (layout: ValuationColumnLayout) => layout.filter((column) => column.visible);

/** Shows or hides a column; the last visible one cannot be hidden, so the list never goes blank. */
export function toggleValuationColumn(layout: ValuationColumnLayout, key: ValuationColumn): ValuationColumnLayout {
  const column = layout.find((item) => item.key === key);
  if (!column) return layout;
  if (column.visible && visibleValuationColumns(layout).length <= 1) return layout;
  return layout.map((item) => (item.key === key ? { ...item, visible: !item.visible } : item));
}

export function resizeValuationColumn(layout: ValuationColumnLayout, key: ValuationColumn, width: number): ValuationColumnLayout {
  return layout.map((item) => (item.key === key ? { ...item, width: clampWidth(width) } : item));
}

/** Moves a column to the place of another one (a drag of its header), the rest shifting. */
export function moveValuationColumn(layout: ValuationColumnLayout, from: ValuationColumn, to: ValuationColumn): ValuationColumnLayout {
  const fromIndex = layout.findIndex((item) => item.key === from);
  const toIndex = layout.findIndex((item) => item.key === to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return layout;
  const next = [...layout];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** «Mover a la izquierda/derecha»: past the next visible column, the hidden ones keeping their place; null at either end. */
export function valuationColumnNeighbor(layout: ValuationColumnLayout, key: ValuationColumn, direction: -1 | 1): ValuationColumn | null {
  const shown = visibleValuationColumns(layout).map((column) => column.key);
  const index = shown.indexOf(key);
  return index < 0 ? null : shown[index + direction] ?? null;
}

/** The visible columns, in order, for «Exportar a Excel»: `columnas=folio,titulo,…`. */
export const columnsParam = (layout: ValuationColumnLayout) => visibleValuationColumns(layout).map((column) => column.key).join(",");

/** The columns an export asked for, known ones only and each once; the defaults when none is valid. */
export function parseColumnsParam(value: string | null | undefined): ValuationColumn[] {
  const keys = [...new Set((value ?? "").split(",").map((key) => key.trim()).filter(isColumn))];
  return keys.length ? keys : visibleValuationColumns(defaultValuationColumns()).map((column) => column.key);
}
