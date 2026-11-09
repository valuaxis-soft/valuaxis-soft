/**
 * The columns of the Comparables list as a spreadsheet shows them: which are
 * visible, in what order and how wide, and which one the header click sorts
 * by. Pure, so it is tested without a browser; the layout is kept per user in
 * localStorage (there is no preferences column to keep it in).
 */
import type { ComparableSort } from "./comparable-list-params";

export const COMPARABLE_COLUMNS = ["numero", "ubicacion", "tipo", "superficies", "precio", "fuente", "fecha", "vigencia", "usado"] as const;
export type ComparableColumn = (typeof COMPARABLE_COLUMNS)[number];

export const COMPARABLE_COLUMN_LABELS: Record<ComparableColumn, string> = {
  numero: "Número",
  ubicacion: "Ubicación",
  tipo: "Tipo",
  superficies: "Superficies",
  precio: "Precio",
  fuente: "Fuente",
  fecha: "Alta / actualización",
  vigencia: "Vigencia",
  usado: "Usado en",
};

/** A column has one of these pixel widths: narrow enough to fit, wide enough to read. */
export const MIN_COLUMN_WIDTH = 72;
export const MAX_COLUMN_WIDTH = 720;

const DEFAULT_WIDTHS: Record<ComparableColumn, number> = {
  numero: 110, ubicacion: 360, tipo: 150, superficies: 230, precio: 150, fuente: 140, fecha: 150, vigencia: 140, usado: 220,
};

export type ColumnSetting = { key: ComparableColumn; visible: boolean; width: number };
/** The columns in their order; every column is always present, hidden ones included. */
export type ColumnLayout = ColumnSetting[];

export const LAYOUT_VERSION = 1;

export function defaultColumnLayout(): ColumnLayout {
  return COMPARABLE_COLUMNS.map((key) => ({ key, visible: key !== "fuente", width: DEFAULT_WIDTHS[key] }));
}

export const clampWidth = (width: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

const isColumn = (value: unknown): value is ComparableColumn => (COMPARABLE_COLUMNS as readonly string[]).includes(value as string);

/**
 * A stored layout as a usable one: unknown columns are dropped, missing ones
 * are appended with their defaults, widths are clamped. Anything unreadable
 * gives the default layout, so a stale value never breaks the list.
 */
export function parseColumnLayout(stored: string | null | undefined): ColumnLayout {
  if (!stored) return defaultColumnLayout();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return defaultColumnLayout();
  }
  const record = parsed && typeof parsed === "object" ? (parsed as { version?: unknown; columns?: unknown }) : {};
  if (record.version !== LAYOUT_VERSION || !Array.isArray(record.columns)) return defaultColumnLayout();
  const defaults = defaultColumnLayout();
  const seen = new Set<ComparableColumn>();
  const layout: ColumnLayout = [];
  for (const item of record.columns) {
    const column = item && typeof item === "object" ? (item as { key?: unknown; visible?: unknown; width?: unknown }) : {};
    if (!isColumn(column.key) || seen.has(column.key)) continue;
    seen.add(column.key);
    const fallback = DEFAULT_WIDTHS[column.key];
    layout.push({
      key: column.key,
      visible: typeof column.visible === "boolean" ? column.visible : true,
      width: clampWidth(typeof column.width === "number" && Number.isFinite(column.width) ? column.width : fallback),
    });
  }
  for (const column of defaults) if (!seen.has(column.key)) layout.push(column);
  return layout;
}

export const serializeColumnLayout = (layout: ColumnLayout) => JSON.stringify({ version: LAYOUT_VERSION, columns: layout });

/** One layout per user of the browser, so two appraisers on one machine keep their own. */
export const columnLayoutStorageKey = (userId: number | string) => `valuaxis:comparables:columns:${userId}`;

export const visibleColumns = (layout: ColumnLayout) => layout.filter((column) => column.visible);

/** Shows or hides a column; the last visible one cannot be hidden, so the list never goes blank. */
export function toggleColumn(layout: ColumnLayout, key: ComparableColumn): ColumnLayout {
  const column = layout.find((item) => item.key === key);
  if (!column) return layout;
  if (column.visible && visibleColumns(layout).length <= 1) return layout;
  return layout.map((item) => (item.key === key ? { ...item, visible: !item.visible } : item));
}

export function resizeColumn(layout: ColumnLayout, key: ComparableColumn, width: number): ColumnLayout {
  return layout.map((item) => (item.key === key ? { ...item, width: clampWidth(width) } : item));
}

/** Moves a column to the place of another one (a drag of its header), the rest shifting. */
export function moveColumn(layout: ColumnLayout, from: ComparableColumn, to: ComparableColumn): ColumnLayout {
  const fromIndex = layout.findIndex((item) => item.key === from);
  const toIndex = layout.findIndex((item) => item.key === to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return layout;
  const next = [...layout];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * The visible column next to this one on the side asked (-1 left, 1 right),
 * where "Mover a la izquierda/derecha" takes it; null at either end.
 */
function visibleNeighbor(layout: ColumnLayout, key: ComparableColumn, direction: -1 | 1): ComparableColumn | null {
  const shown = visibleColumns(layout).map((column) => column.key);
  const index = shown.indexOf(key);
  if (index < 0) return null;
  return shown[index + direction] ?? null;
}

export const canMoveColumnBy = (layout: ColumnLayout, key: ComparableColumn, direction: -1 | 1) => visibleNeighbor(layout, key, direction) !== null;

/** "Mover a la izquierda/derecha" of the header's right click: past the next visible column, the hidden ones keeping their place. */
export function moveColumnBy(layout: ColumnLayout, key: ComparableColumn, direction: -1 | 1): ColumnLayout {
  const neighbor = visibleNeighbor(layout, key, direction);
  return neighbor ? moveColumn(layout, key, neighbor) : layout;
}

/** The orders a header click applies: ascending first, descending on the second click. */
const HEADER_SORTS: Partial<Record<ComparableColumn, { asc: ComparableSort; desc: ComparableSort }>> = {
  numero: { asc: "numero", desc: "numero_desc" },
  ubicacion: { asc: "ubicacion_asc", desc: "ubicacion_desc" },
  tipo: { asc: "tipo_asc", desc: "tipo_desc" },
  superficies: { asc: "superficie_asc", desc: "superficie_desc" },
  precio: { asc: "precio_asc", desc: "precio_desc" },
  // The most recent first is the list's default order; "ascending" here is the oldest first.
  fecha: { asc: "antiguo", desc: "reciente" },
  vigencia: { asc: "vigencia_asc", desc: "vigencia_desc" },
};

export const isSortableColumn = (key: ComparableColumn) => key in HEADER_SORTS;

export type SortDirection = "asc" | "desc";

/** How the list is sorted by this column, or null when it is sorted by another one. */
export function columnSortDirection(key: ComparableColumn, sort: ComparableSort): SortDirection | null {
  const sorts = HEADER_SORTS[key];
  if (!sorts) return null;
  return sorts.asc === sort ? "asc" : sorts.desc === sort ? "desc" : null;
}

/** The order a click on this header gives: ascending, then descending, then ascending again. */
export function nextColumnSort(key: ComparableColumn, sort: ComparableSort): ComparableSort | null {
  const sorts = HEADER_SORTS[key];
  if (!sorts) return null;
  return columnSortDirection(key, sort) === "asc" ? sorts.desc : sorts.asc;
}
