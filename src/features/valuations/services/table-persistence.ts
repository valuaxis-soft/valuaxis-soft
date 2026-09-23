/**
 * Lossless table persistence.
 *
 * Tables travel from the editor to the database and back as TableV2. Column and
 * row ids are preserved because formulas reference cells by those ids, cell
 * values are stored as the exact text the user typed, and formulas and formats
 * travel in the cell's complex value.
 */
import type { TableContent } from "../model";
import {
  ensureTableV2,
  type TableCellFormat,
  type TableCellV2,
  type TableColumn,
  type TableFormula,
  type TableRow,
  type TableSchema,
  type TableV2,
} from "./table";

export type TableSavePayload = TableV2 & {
  boundaryDistanceFormats?: TableContent["boundaryDistanceFormats"];
  enabled: boolean;
};

/** Editor → API. Always sends a complete TableV2, whatever shape the editor holds. */
export function serializeTableForSave(table: TableContent): TableSavePayload {
  const v2 = ensureTableV2(table);
  return {
    ...v2,
    title: table.title,
    enabled: table.enabled ?? true,
    ...(table.boundaryDistanceFormats?.length ? { boundaryDistanceFormats: table.boundaryDistanceFormats } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Cells                                                              */
/* ------------------------------------------------------------------ */

type StoredCellComplex =
  | { kind: "formula"; formula: TableFormula; format?: TableCellFormat }
  | { kind: "value"; format: TableCellFormat };

export type StoredCell = {
  text: string | null;
  complex: StoredCellComplex | null;
  calculated: boolean;
};

/** Cell → database columns. The value is kept as the exact text typed by the user. */
export function encodeTableCell(cell: TableCellV2 | undefined): StoredCell {
  if (!cell) return { text: null, complex: null, calculated: false };
  if (cell.kind === "formula") {
    return {
      text: null,
      complex: { kind: "formula", formula: cell.formula, ...(cell.format ? { format: cell.format } : {}) },
      calculated: true,
    };
  }
  return {
    text: cell.value === "" ? null : cell.value,
    complex: cell.format ? { kind: "value", format: cell.format } : null,
    calculated: false,
  };
}

export type StoredCellRecord = {
  text: string | null;
  numeric: string | null;
  boolean: boolean | null;
  date: string | null;
  complex: unknown;
  calculated: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Database columns → cell. Also reads cells written before this format existed. */
export function decodeTableCell(stored: StoredCellRecord): TableCellV2 {
  const complex = isRecord(stored.complex) ? stored.complex : null;
  const format = complex && isRecord(complex.format) ? (complex.format as TableCellFormat) : undefined;

  if (complex?.kind === "formula" && isRecord(complex.formula)) {
    return { kind: "formula", formula: complex.formula as TableFormula, ...(format ? { format } : {}) };
  }
  // Older saves stored the formula AST directly in the complex value.
  if (stored.calculated && complex && complex.kind !== "value") {
    return { kind: "formula", formula: complex as TableFormula };
  }

  const value =
    stored.text ??
    stored.numeric ??
    (stored.boolean === null ? null : stored.boolean ? "Si" : "No") ??
    stored.date ??
    "";
  return { kind: "value", value, ...(format ? { format } : {}) };
}

/* ------------------------------------------------------------------ */
/*  Tables                                                             */
/* ------------------------------------------------------------------ */

export type StoredTableRecord = {
  id: string;
  title: string;
  enabled: boolean;
  schema?: unknown;
  columns: Array<{ id: string; name: string; format?: TableCellFormat }>;
  rows: Array<{ id?: string | null; cells: Array<StoredCellRecord | null> }>;
};

/** Stored table → TableV2. Rows without a stored id get the same id the legacy loader produced. */
export function decodeStoredTable(stored: StoredTableRecord): TableV2 {
  const columns: TableColumn[] = stored.columns.map((column) => ({
    id: column.id,
    name: column.name,
    ...(column.format ? { format: column.format } : {}),
  }));

  const rows: TableRow[] = stored.rows.map((row, rowIndex) => {
    const cells: Record<string, TableCellV2> = {};
    columns.forEach((column, columnIndex) => {
      const cell = row.cells[columnIndex];
      cells[column.id] = cell ? decodeTableCell(cell) : { kind: "value", value: "" };
    });
    return { id: row.id || `r-${stored.id}-${rowIndex}`, cells };
  });

  return {
    id: stored.id,
    title: stored.title,
    version: 2,
    columns,
    rows,
    enabled: stored.enabled,
    ...(stored.schema ? { schema: stored.schema as TableSchema } : {}),
  };
}
