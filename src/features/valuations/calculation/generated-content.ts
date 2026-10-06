/**
 * What the market and cost pages of the dictamen are built from: the number
 * formats of the appraiser's own format, and tables that carry their header
 * groups, column alignment and summary boxes in the schema, which is saved and
 * reloaded with the document.
 */
import type { Apartado, Block, TableContent } from "../model";
import {
  ensureTableV2,
  getTableHeaderLayout,
  type HeaderGroup,
  type StructuralZone,
  type TableCellV2,
  type TableNote,
  type TableSchema,
  type TableSummaryBox,
  type TableV2,
} from "../services/table";

const decimals = (digits: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const twoDecimals = decimals(2);
const noDecimals = decimals(0);

export const EMPTY = "—";

/** "$ 9,000.00", as the books print amounts. */
export const money = (value: number) => `$ ${twoDecimals.format(value)}`;
/** Areas, quantities and factors: two decimals, as the books print them. */
export const figure = (value: number | null | undefined, digits = 2) =>
  (value === null || value === undefined ? EMPTY : (digits === 2 ? twoDecimals : decimals(digits)).format(value));
export const whole = (value: number | null | undefined) => (value === null || value === undefined ? EMPTY : noDecimals.format(value));
export const squareMetres = (value: number) => `${twoDecimals.format(value)} m²`;
/** A share captured as a fraction: 1 prints "100%". */
export const percent = (value: number, digits = 0) => `${decimals(digits).format(value * 100)}%`;

export type GeneratedColumn = {
  name: string;
  align?: "left" | "center" | "right";
  /** Figures stay on one line. */
  noWrap?: boolean;
  /** Title of the header group the column sits under; neighbours with the same title share it. */
  group?: string;
};

/** A column of text. */
export const textColumn = (name: string, align?: GeneratedColumn["align"]): GeneratedColumn => ({ name, ...(align ? { align } : {}) });
/** A column of figures: on one line, centered unless told otherwise. */
export const figureColumn = (name: string, options: { align?: GeneratedColumn["align"]; group?: string } = {}): GeneratedColumn =>
  ({ name, align: options.align ?? "center", noWrap: true, ...(options.group ? { group: options.group } : {}) });
/** A column of amounts, right-aligned. */
export const moneyColumn = (name: string, group?: string): GeneratedColumn => figureColumn(name, { align: "right", group });

/**
 * A table with stable column and row ids, so a regenerated table is the same
 * table. The title names it in the editor (a table is saved with a name); the
 * printed document shows no caption above it.
 */
export function generatedTable(
  id: string,
  title: string,
  columns: GeneratedColumn[],
  rows: string[][],
  options: { summaryBoxes?: TableSummaryBox[]; compact?: boolean; notes?: TableNote[] } = {},
): TableContent {
  const columnIds = columns.map((_, index) => `col-${index + 1}`);
  const zones: StructuralZone[] = [];
  const headerGroups: HeaderGroup[] = [];
  if (columns.some((column) => column.group)) {
    columns.forEach((column, index) => {
      const zone = zones.at(-1);
      if (zone && columns[index - 1].group === column.group) {
        zone.columnIds.push(columnIds[index]);
        return;
      }
      const zoneId = `zone-${zones.length + 1}`;
      zones.push({ id: zoneId, kind: "fixed", columnIds: [columnIds[index]] });
      if (column.group) headerGroups.push({ id: `group-${zoneId}`, title: column.group, zoneId });
    });
  }
  const columnPresentation: NonNullable<TableSchema["columnPresentation"]> = {};
  columns.forEach((column, index) => {
    if (column.align || column.noWrap) {
      columnPresentation[columnIds[index]] = { ...(column.align ? { align: column.align } : {}), ...(column.noWrap ? { noWrap: true } : {}) };
    }
  });
  const boxes = (options.summaryBoxes ?? []).filter((box) => box.rows.length);
  const table: TableV2 = {
    id,
    title,
    version: 2,
    columns: columns.map((column, index) => ({ id: columnIds[index], name: column.name })),
    rows: rows.map((row, rowIndex) => ({
      id: `r-${id}-${rowIndex}`,
      cells: Object.fromEntries(columnIds.map((columnId, index): [string, TableCellV2] => [columnId, { kind: "value", value: row[index] ?? "" }])),
    })),
    enabled: true,
    schema: {
      hideCaption: true,
      // Long texts and very wide tables print at the smallest size.
      density: options.compact || columns.length > 12 ? "compact" : "dense",
      zones,
      ...(headerGroups.length ? { headerGroups } : {}),
      columnPresentation,
      ...(boxes.length ? { summaryBoxes: boxes } : {}),
      ...(options.notes?.length ? { notes: options.notes } : {}),
    },
  };
  return table as unknown as TableContent;
}

export function generatedApartado(id: string, title: string, parts: Partial<Pick<Apartado, "concepts" | "tables">>): Apartado {
  return { id, title, enabled: true, concepts: parts.concepts ?? [], tables: parts.tables ?? [], images: [] };
}

/** A block of the dictamen: the title bar of an approach, with its numbered apartados under it. */
export function generatedBlock(id: string, title: string, parts: Partial<Pick<Block, "concepts" | "tables" | "images" | "apartados">>): Block {
  return {
    id,
    title,
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: parts.concepts ?? [],
    apartados: parts.apartados ?? [],
    tables: parts.tables ?? [],
    images: parts.images ?? [],
  };
}

/**
 * What a table prints: title, header groups, columns with their alignment,
 * cells, summary boxes and notes. The same for a new table and for one saved and
 * reloaded, whatever the order the stored schema returns its keys in.
 */
export function printedTable(table: TableContent) {
  const normalized = ensureTableV2(table);
  const presentation = normalized.schema?.columnPresentation ?? {};
  return [
    normalized.title,
    normalized.schema?.hideCaption ?? false,
    normalized.schema?.density ?? null,
    (normalized.schema?.notes ?? []).map((note) => [note.position, note.label ?? null, note.text]),
    getTableHeaderLayout(normalized).topRow.map((cell) => (cell.kind === "group-title" ? [cell.group.title, cell.colSpan] : null)),
    normalized.columns.map((column) => [column.name, presentation[column.id]?.align ?? null, presentation[column.id]?.noWrap ?? false]),
    normalized.rows.map((row) => normalized.columns.map((column) => {
      const cell = row.cells[column.id];
      return cell?.kind === "value" ? cell.value : "";
    })),
    (normalized.schema?.summaryBoxes ?? []).map((box) => [
      box.position,
      box.align ?? "start",
      box.caption ?? null,
      box.rows.map((row) => [row.label, row.value, row.mark ?? null, row.emphasis ?? null]),
    ]),
  ];
}
