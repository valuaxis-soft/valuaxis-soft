/**
 * Table V2 — Canonical Table model with stable row/column identities,
 * typed cells, formula support, and backward-compatible normalization.
 *
 * This module is pure TypeScript — no React, no side effects.
 */

import type { ConceptValueFormat } from "../model";

/* ================================================================== */
/*  TABLE V2 CANONICAL TYPES                                           */
/* ================================================================== */

export type TableCellColumnType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "measurement"
  | "boolean";

export type TableCellFormat = {
  type: TableCellColumnType;
  /** For currency: "mxn" etc. For measurement: "m", "m2", etc. */
  unit?: ConceptValueFormat;
  /** Custom unit label when type is "measurement" and unit is "custom" */
  customUnit?: string;
  /** Decimal places for number/currency/percent (null = auto) */
  precision?: number | null;
};

export type TableCellV2 =
  | {
      kind: "value";
      value: string;
      format?: TableCellFormat;
    }
  | {
      kind: "formula";
      formula: TableFormula;
      format?: TableCellFormat;
    };

export type TableColumn = {
  id: string;
  name: string;
  format?: TableCellFormat;
};

export type TableRow = {
  id: string;
  cells: Record<string, TableCellV2>;
};

export type TableV2 = {
  id: string;
  title: string;
  version: 2;
  columns: TableColumn[];
  rows: TableRow[];
  enabled?: boolean;
  /** Optional structural schema — absent = free table */
  schema?: TableSchema;
};

/* ================================================================== */
/*  SCHEMA TYPES (Phase 3A)                                            */
/* ================================================================== */

export type ColumnCapability = {
  removable?: boolean;
  movable?: boolean;
  headerEditable?: boolean;
  clearable?: boolean;
};

export type StructuralZone =
  | { id: string; kind: "fixed"; columnIds: string[] }
  | {
      id: string;
      kind: "dynamic";
      columnIds: string[];
      minColumns?: number;
      maxColumns?: number;
      allowInsert?: boolean;
      allowRemove?: boolean;
      allowReorder?: boolean;
    };

export type HeaderGroup = {
  id: string;
  title: string;
  titleEditable?: boolean;
  zoneId: string;
};

export type TableResultGroup = {
  id: string;
  position: "bottom";
  align?: "start" | "center" | "end";
  items: TableResultItem[];
};

export type TableResultItem = {
  id: string;
  label: string;
  labelEditable?: boolean;
  formula?: TableFormula;
  format?: TableCellFormat;
  required?: boolean;
};

export type ColumnPresentation = {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
};

export type TableSchema = {
  presetId?: string;
  zones: StructuralZone[];
  headerGroups?: HeaderGroup[];
  capabilities?: Record<string, ColumnCapability>;
  resultGroups?: TableResultGroup[];
  columnPresentation?: Record<string, ColumnPresentation>;
};

/* ================================================================== */
/*  FORMULA AST TYPES                                                  */
/* ================================================================== */

export type FormulaCellRef = {
  type: "cell";
  rowId: string;
  columnId: string;
};

export type FormulaRowRef = {
  type: "row";
  rowId: string;
};

export type FormulaColumnRef = {
  type: "column";
  columnId: string;
};

export type FormulaRangeRef = {
  type: "range";
  cells: Array<{ rowId: string; columnId: string }>;
};

export type FormulaConstantRef = {
  type: "constant";
  value: number;
};

export type FormulaOperand =
  | FormulaCellRef
  | FormulaRowRef
  | FormulaColumnRef
  | FormulaRangeRef
  | FormulaConstantRef;

export type FormulaBinaryOp = "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MODULO" | "POWER";

export type FormulaCompareOp =
  | "EQUAL"
  | "NOT_EQUAL"
  | "GREATER_THAN"
  | "GREATER_OR_EQUAL"
  | "LESS_THAN"
  | "LESS_OR_EQUAL";

export type FormulaExpression =
  | { type: "operand"; operand: FormulaOperand }
  | { type: "binary"; operator: FormulaBinaryOp; left: FormulaExpression; right: FormulaExpression }
  | { type: "compare"; operator: FormulaCompareOp; left: FormulaExpression; right: FormulaExpression }
  | { type: "function"; name: string; args: FormulaExpression[] }
  | { type: "constant"; value: number };

export type TableFormula = {
  expression: FormulaExpression;
  description?: string;
};

/* ================================================================== */
/*  FORMULA EVALUATION RESULT                                          */
/* ================================================================== */

export type FormulaResult =
  | { ok: true; value: number }
  | {
      ok: false;
      error:
        | "DIVIDE_BY_ZERO"
        | "INVALID_NUMBER"
        | "MISSING_REFERENCE"
        | "DELETED_ROW"
        | "DELETED_COLUMN"
        | "CIRCULAR_REFERENCE"
        | "INVALID_OPERATION"
        | "UNKNOWN_FUNCTION";
      detail?: string;
    };

/* ================================================================== */
/*  TABLE EVALUATION CONTEXT                                           */
/* ================================================================== */

export type TableEvaluationContext = {
  table: TableV2;
  /** Map rowId → row for O(1) lookup */
  rowMap: Map<string, TableRow>;
  /** Map columnId → column for O(1) lookup */
  columnMap: Map<string, TableColumn>;
  /** Cache for formula results during one evaluation pass */
  resultCache: Map<string, number>;
  /** Set of currently-evaluating cell keys for cycle detection */
  evaluating: Set<string>;
};

/* ================================================================== */
/*  LEGACY TABLE (current persisted shape)                             */
/* ================================================================== */

export type TableLegacy = {
  id: string;
  title: string;
  columns: string[];
  columnKeys?: string[];
  rows: string[][];
  boundaryDistanceFormats?: Array<{
    valueFormat?: ConceptValueFormat;
    customUnit?: string;
  }>;
  enabled?: boolean;
};

/* ================================================================== */
/*  LEGACY → V2 NORMALIZATION                                          */
/* ================================================================== */

/**
 * Normalize a legacy TableContent into a canonical TableV2.
 *
 * Legacy shape:
 *   columns: string[]
 *   columnKeys?: string[]
 *   rows: string[][]
 *
 * Normalized shape:
 *   columns: TableColumn[]  (stable IDs)
 *   rows: TableRow[]        (stable IDs, cell map per row)
 *
 * Preserves all existing values. No data loss.
 */
export function normalizeTableToV2(legacy: TableLegacy): TableV2 {
  const columnKeys = legacy.columnKeys ?? legacy.columns.map((_, i) => `column-${i + 1}`);

  const columns: TableColumn[] = legacy.columns.map((name, i) => ({
    id: columnKeys[i] ?? generateColumnId(),
    name,
  }));

  const rows: TableRow[] = legacy.rows.map((row, rowIdx) => {
    const cells: Record<string, TableCellV2> = {};
    columns.forEach((col, colIdx) => {
      const raw = row[colIdx] ?? "";
      cells[col.id] = { kind: "value", value: raw };
    });
    return {
      id: `r-${legacy.id}-${rowIdx}`,
      cells,
    };
  });

  return {
    id: legacy.id,
    title: legacy.title,
    version: 2,
    columns,
    rows,
    enabled: legacy.enabled,
  };
}

/* ================================================================== */
/*  STRICT VALIDATION                                                  */
/* ================================================================== */

let columnIdCounter = 0;
function generateColumnId(): string {
  return `col-${++columnIdCounter}-${Date.now().toString(36)}`;
}

let rowIdCounter = 0;
function generateRowId(): string {
  return `row-${++rowIdCounter}-${Date.now().toString(36)}`;
}

/**
 * Strict structural validation — determines if an object is a fully valid TableV2.
 *
 * Checks beyond version === 2:
 *   - columns is a non-empty array of objects with string id and string name
 *   - rows is an array of objects with string id and an object cells
 *   - every row has a cell entry for every column
 */
export function isValidTableV2(table: unknown): table is TableV2 {
  if (typeof table !== "object" || table === null) return false;
  const t = table as Record<string, unknown>;
  if (t.version !== 2) return false;
  if (!Array.isArray(t.columns) || t.columns.length === 0) return false;
  if (!Array.isArray(t.rows)) return false;

  for (const col of t.columns) {
    if (typeof col !== "object" || col === null) return false;
    const c = col as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id) return false;
    if (typeof c.name !== "string") return false;
  }

  const colIds = new Set((t.columns as TableColumn[]).map((c) => c.id));

  for (const row of t.rows) {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id) return false;
    if (typeof r.cells !== "object" || r.cells === null) return false;
    // Every column must have a cell entry
    for (const colId of colIds) {
      if (!(colId in (r.cells as Record<string, unknown>))) return false;
    }
  }

  return true;
}

/**
 * Legacy table detection — no version field, or has string arrays.
 */
function isLegacyTable(table: unknown): table is TableLegacy {
  if (typeof table !== "object" || table === null) return false;
  const t = table as Record<string, unknown>;
  // Must have string[] columns or string[][] rows
  if (Array.isArray(t.columns) && t.columns.length > 0 && typeof t.columns[0] === "string") return true;
  if (Array.isArray(t.rows) && t.rows.length > 0 && Array.isArray(t.rows[0])) return true;
  return false;
}

/**
 * Check if a TableContent is already V2 shape.
 * NOTE: This only checks version === 2. For structural validity, use isValidTableV2.
 */
export function isTableV2(table: unknown): table is TableV2 {
  return (
    typeof table === "object" &&
    table !== null &&
    "version" in table &&
    (table as TableV2).version === 2
  );
}

/**
 * Repair a partial/broken V2 into a structurally valid TableV2.
 *
 * Handles:
 *   - version: 2 but rows is legacy string[][]
 *   - version: 2 but row.cells is undefined
 *   - version: 2 but columns contain legacy strings
 *   - missing cell entries for current columns
 */
function repairPartialV2(table: Record<string, unknown>): TableV2 {
  const id = typeof table.id === "string" ? table.id : "table-" + generateColumnId();
  const title = typeof table.title === "string" ? table.title : "";

  // Repair columns: must be TableColumn[]
  let columns: TableColumn[];
  if (Array.isArray(table.columns)) {
    columns = table.columns.map((col: unknown, i: number) => {
      if (typeof col === "object" && col !== null && "id" in col && "name" in col) {
        const c = col as Record<string, unknown>;
        return {
          id: typeof c.id === "string" && c.id ? c.id : generateColumnId(),
          name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
        };
      }
      // Legacy string column → generate ID
      return {
        id: generateColumnId(),
        name: typeof col === "string" ? col : String(col ?? ""),
      };
    });
  } else {
    columns = [{ id: generateColumnId(), name: "" }];
  }

  if (columns.length === 0) {
    columns = [{ id: generateColumnId(), name: "" }];
  }

  const colIds = columns.map((c) => c.id);

  // Repair rows: must be TableRow[]
  let rows: TableRow[];
  if (Array.isArray(table.rows)) {
    rows = table.rows.map((row: unknown, rowIdx: number) => {
      // Legacy string[][] row
      if (Array.isArray(row)) {
        const cells: Record<string, TableCellV2> = {};
        colIds.forEach((colId, colIdx) => {
          const raw = (row as unknown[])[colIdx];
          cells[colId] = { kind: "value", value: typeof raw === "string" ? raw : String(raw ?? "") };
        });
        return { id: generateRowId(), cells };
      }
      // Partial V2 row object
      if (typeof row === "object" && row !== null) {
        const r = row as Record<string, unknown>;
        const rowId = typeof r.id === "string" && r.id ? r.id : generateRowId();
        const cells: Record<string, TableCellV2> = {};
        for (const colId of colIds) {
          const existing = typeof r.cells === "object" && r.cells !== null
            ? (r.cells as Record<string, unknown>)[colId]
            : undefined;
          if (typeof existing === "object" && existing !== null && "kind" in existing) {
            cells[colId] = existing as TableCellV2;
          } else {
            cells[colId] = { kind: "value", value: typeof existing === "string" ? existing : "" };
          }
        }
        return { id: rowId, cells };
      }
      // Completely malformed row
      const cells: Record<string, TableCellV2> = {};
      colIds.forEach((colId) => { cells[colId] = { kind: "value", value: "" }; });
      return { id: generateRowId(), cells };
    });
  } else {
    rows = [];
  }

  return {
    id,
    title,
    version: 2,
    columns,
    rows,
    enabled: typeof table.enabled === "boolean" ? table.enabled : undefined,
  };
}

/**
 * Ensure a table is in V2 format. If legacy or partial, normalize/repair it.
 *
 * GUARANTEE: the returned object is always a structurally valid TableV2.
 *   - Every column has a stable string id and string name
 *   - Every row has a stable string id
 *   - Every row has a cells entry for every column
 *   - No cell is undefined
 */
export function ensureTableV2(table: unknown): TableV2 {
  if (isValidTableV2(table)) return table;
  if (isTableV2(table)) return repairPartialV2(table as Record<string, unknown>);
  if (isLegacyTable(table)) return normalizeTableToV2(table);
  // Completely unknown input → create minimal valid table
  return repairPartialV2({});
}

/* ================================================================== */
/*  TABLE CREATION                                                     */
/* ================================================================== */

const DEFAULT_COLUMN_NAME = "Nueva columna";

/** Normalize a column/table name: trim whitespace, fallback to default if empty. */
function normalizeTableName(name: string | undefined | null, fallback?: string): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : (fallback ?? DEFAULT_COLUMN_NAME);
}

/**
 * Create a new empty V2 table with stable IDs.
 *
 * Use this instead of manually constructing TableContent objects.
 */
export function createTableV2(
  title: string,
  columnNames: string[],
): TableV2 {
  const id = generateColumnId();
  const columns: TableColumn[] = columnNames.map((name) => ({
    id: generateColumnId(),
    name,
  }));
  const colIds = columns.map((c) => c.id);
  const cells: Record<string, TableCellV2> = {};
  colIds.forEach((colId) => { cells[colId] = { kind: "value", value: "" }; });
  const rows: TableRow[] = [{ id: generateRowId(), cells }];

  return { id, title, version: 2, columns, rows, enabled: true };
}

/* ================================================================== */
/*  CANONICAL TABLE OPERATIONS                                         */
/* ================================================================== */

/** Move a column from one index to another. */
export function moveTableColumn(table: TableV2, fromIndex: number, toIndex: number): TableV2 {
  if (fromIndex < 0 || fromIndex >= table.columns.length) return table;
  if (toIndex < 0 || toIndex >= table.columns.length) return table;
  if (fromIndex === toIndex) return table;
  const newColumns = [...table.columns];
  const [moved] = newColumns.splice(fromIndex, 1);
  newColumns.splice(toIndex, 0, moved);
  return { ...table, columns: newColumns };
}

/** Move a row from one index to another. */
export function moveTableRow(table: TableV2, fromIndex: number, toIndex: number): TableV2 {
  if (fromIndex < 0 || fromIndex >= table.rows.length) return table;
  if (toIndex < 0 || toIndex >= table.rows.length) return table;
  if (fromIndex === toIndex) return table;
  const newRows = [...table.rows];
  const [moved] = newRows.splice(fromIndex, 1);
  newRows.splice(toIndex, 0, moved);
  return { ...table, rows: newRows };
}

/** Insert a new column at the given index. */
export function insertTableColumn(table: TableV2, index: number, name?: string): TableV2 {
  const newColId = generateColumnId();
  const newCol: TableColumn = { id: newColId, name: normalizeTableName(name, `Columna ${table.columns.length + 1}`) };
  const newColumns = [...table.columns];
  newColumns.splice(index, 0, newCol);
  const newRows = table.rows.map((row) => ({
    ...row,
    cells: { ...row.cells, [newColId]: { kind: "value" as const, value: "" } },
  }));

  // If schema exists, add the new column to the zone that contains the adjacent column
  let newSchema = table.schema;
  if (newSchema) {
    const schemaRef = newSchema;
    // Find which zone the column at `index` belongs to (or the zone after it)
    let targetZoneId: string | null = null;
    let runningIndex = 0;
    for (const zone of schemaRef.zones) {
      const zoneEnd = runningIndex + zone.columnIds.length;
      if (index <= zoneEnd) {
        targetZoneId = zone.id;
        break;
      }
      runningIndex = zoneEnd;
    }
    // If index is beyond all zones, append to last zone
    if (!targetZoneId && schemaRef.zones.length > 0) {
      targetZoneId = schemaRef.zones[schemaRef.zones.length - 1].id;
    }
    if (targetZoneId) {
      newSchema = {
        ...schemaRef,
        zones: schemaRef.zones.map((z) => {
          if (z.id !== targetZoneId) return z;
          // Calculate the relative index within the zone
          let zoneStart = 0;
          for (const z2 of schemaRef.zones) {
            if (z2.id === targetZoneId) break;
            zoneStart += z2.columnIds.length;
          }
          const relativeIndex = Math.max(0, Math.min(index - zoneStart, z.columnIds.length));
          const newColIds = [...z.columnIds];
          newColIds.splice(relativeIndex, 0, newColId);
          if (z.kind === "dynamic") {
            return { ...z, columnIds: newColIds };
          }
          return { ...z, columnIds: newColIds };
        }),
      };
    }
  }

  return { ...table, columns: newColumns, rows: newRows, schema: newSchema };
}

/** Remove a column by ID. Orphan cell entries are cleaned from all rows. */
export function removeTableColumn(table: TableV2, columnId: string): TableV2 {
  const newColumns = table.columns.filter((c) => c.id !== columnId);
  const newRows = table.rows.map((row) => {
    const cells = { ...row.cells };
    delete cells[columnId];
    return { ...row, cells };
  });
  return { ...table, columns: newColumns, rows: newRows };
}

/** Rename a column. Normalizes name to prevent empty persistence. */
export function renameTableColumn(table: TableV2, columnId: string, newName: string): TableV2 {
  const safeName = normalizeTableName(newName, table.columns.find((c) => c.id === columnId)?.name);
  return { ...table, columns: table.columns.map((c) => c.id === columnId ? { ...c, name: safeName } : c) };
}

/** Insert a new row at the given index. */
export function insertTableRow(table: TableV2, index: number): TableV2 {
  const newRowId = generateRowId();
  const cells: Record<string, TableCellV2> = {};
  for (const col of table.columns) { cells[col.id] = { kind: "value", value: "" }; }
  const newRows = [...table.rows];
  newRows.splice(index, 0, { id: newRowId, cells });
  return { ...table, rows: newRows };
}

/** Remove a row by index. */
export function removeTableRow(table: TableV2, rowIndex: number): TableV2 {
  return { ...table, rows: table.rows.filter((_, i) => i !== rowIndex) };
}

/** Clear all cell values in a row (keeps row structure). */
export function clearTableRow(table: TableV2, rowIndex: number): TableV2 {
  const newRows = table.rows.map((row, i) => {
    if (i !== rowIndex) return row;
    const cells: Record<string, TableCellV2> = {};
    for (const col of table.columns) { cells[col.id] = { kind: "value", value: "" }; }
    return { ...row, cells };
  });
  return { ...table, rows: newRows };
}

/** Clear all cell values in a column (keeps column structure). */
export function clearTableColumn(table: TableV2, columnId: string): TableV2 {
  const newRows = table.rows.map((row) => ({
    ...row,
    cells: { ...row.cells, [columnId]: { kind: "value" as const, value: "" } },
  }));
  return { ...table, rows: newRows };
}

/** Duplicate a row immediately after the given index. */
export function duplicateTableRow(table: TableV2, rowIndex: number): TableV2 {
  const source = table.rows[rowIndex];
  if (!source) return table;
  const newRowId = generateRowId();
  const cells: Record<string, TableCellV2> = {};
  for (const col of table.columns) {
    const cell = source.cells[col.id];
    if (cell?.kind === "value") {
      cells[col.id] = { kind: "value", value: cell.value };
    } else {
      cells[col.id] = { kind: "value", value: "" };
    }
  }
  const newRows = [...table.rows];
  newRows.splice(rowIndex + 1, 0, { id: newRowId, cells });
  return { ...table, rows: newRows };
}

/** Set a cell formula. Pass null to clear. */
export function setCellFormula(table: TableV2, rowId: string, columnId: string, formula: TableFormula | null): TableV2 {
  const newRows = table.rows.map((row) => {
    if (row.id !== rowId) return row;
    const cells = { ...row.cells };
    if (formula) {
      cells[columnId] = { kind: "formula", formula };
    } else {
      const existing = cells[columnId];
      cells[columnId] = { kind: "value", value: existing?.kind === "formula" ? "" : (existing as { value?: string })?.value ?? "" };
    }
    return { ...row, cells };
  });
  return { ...table, rows: newRows };
}

/** Build a formula expression from selected source cells and an operation. */
export function buildFormulaFromSelection(
  operation: "SUM" | "AVERAGE" | "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE",
  sources: Array<{ rowId: string; columnId: string }>,
): TableFormula | null {
  if (sources.length === 0) return null;

  const args: FormulaExpression[] = sources.map((s) => ({
    type: "operand",
    operand: { type: "cell", rowId: s.rowId, columnId: s.columnId },
  }));

  // Binary operations: chain as nested binary expressions
  if (operation === "ADD" || operation === "SUBTRACT" || operation === "MULTIPLY" || operation === "DIVIDE") {
    if (args.length < 2) return null;
    let expr: FormulaExpression = { type: "binary", operator: operation, left: args[0], right: args[1] };
    for (let i = 2; i < args.length; i++) {
      expr = { type: "binary", operator: operation, left: expr, right: args[i] };
    }
    return { expression: expr, description: `${operation}(...)` };
  }

  // Aggregate functions
  const expr: FormulaExpression = { type: "function", name: operation, args };
  return { expression: expr, description: `${operation}(...)` };
}

/* ================================================================== */
/*  SCHEMA HELPERS                                                     */
/* ================================================================== */

/** Get the ordered column IDs from schema zones. */
export function getColumnOrderFromSchema(schema: TableSchema): string[] {
  return schema.zones.flatMap((z) => z.columnIds);
}

/** Find which zone a column belongs to. */
export function findZoneForColumn(schema: TableSchema, columnId: string): StructuralZone | undefined {
  return schema.zones.find((z) => z.columnIds.includes(columnId));
}

/** Resolve the effective capability for a column. */
export function resolveColumnCapability(
  columnId: string,
  schema?: TableSchema,
): ColumnCapability {
  const override = schema?.capabilities?.[columnId];
  const zone = schema ? findZoneForColumn(schema, columnId) : undefined;
  const isFixed = zone?.kind === "fixed";
  return {
    removable:    override?.removable    ?? (zone?.kind === "dynamic" ? (zone.allowRemove ?? true) : false),
    movable:      override?.movable      ?? (zone?.kind === "dynamic" ? (zone.allowReorder ?? true) : false),
    headerEditable: override?.headerEditable ?? true,
    clearable:    override?.clearable    ?? true,
  };
}

/** Get header group for a zone, if any. */
export function getHeaderGroupForZone(schema: TableSchema, zoneId: string): HeaderGroup | undefined {
  return schema.headerGroups?.find((hg) => hg.zoneId === zoneId);
}

/** Update a header group title. */
export function updateHeaderGroupTitle(schema: TableSchema, groupId: string, newTitle: string): TableSchema {
  return {
    ...schema,
    headerGroups: schema.headerGroups?.map((hg) =>
      hg.id === groupId ? { ...hg, title: newTitle } : hg
    ),
  };
}

/** Get all column IDs that belong to a specific zone. */
export function getZoneColumnIds(schema: TableSchema, zoneId: string): string[] {
  return schema.zones.find((z) => z.id === zoneId)?.columnIds ?? [];
}

/**
 * Get display-ordered columns for a table.
 * For structured tables: columns in zone order.
 * For free tables: tableV2.columns order.
 *
 * This is the SINGLE source of truth for column display order.
 * Used by: header, body, colgroup.
 */
export function getDisplayColumns(tableV2: TableV2): TableColumn[] {
  if (!tableV2.schema?.zones?.length) return tableV2.columns;
  const orderedIds = getColumnOrderFromSchema(tableV2.schema);
  const colMap = new Map(tableV2.columns.map((c) => [c.id, c]));
  return orderedIds.map((id) => colMap.get(id)).filter(Boolean) as TableColumn[];
}

/* ================================================================== */
/*  HEADER LAYOUT — shared between Editor and DocumentTable             */
/* ================================================================== */

export type HeaderLayoutCell =
  | { kind: "column"; columnId: string; rowSpan: number; colSpan: number }
  | { kind: "group-title"; group: HeaderGroup; colSpan: number };

export type HeaderLayout = {
  /** Row 0: ungrouped columns with rowSpan=2 + group titles with colSpan */
  topRow: HeaderLayoutCell[];
  /** Row 1: grouped child column IDs (only if there are groups) */
  bottomRow: string[] | null;
  /** Whether this schema has grouped headers */
  hasGroups: boolean;
};

/**
 * Compute the semantic header layout for a table.
 *
 * This is the SINGLE source of truth for header rendering.
 * Both TableEditor and DocumentTable consume this.
 *
 * When schema has no headerGroups → single-row header (bottomRow=null).
 * When schema has headerGroups → two-row header with rowSpan/colSpan.
 */
export function getTableHeaderLayout(tableV2: TableV2): HeaderLayout {
  const schema = tableV2.schema;
  if (!schema?.headerGroups?.length) {
    return { topRow: tableV2.columns.map((c) => ({ kind: "column", columnId: c.id, rowSpan: 1, colSpan: 1 })), bottomRow: null, hasGroups: false };
  }

  // Build a map from zoneId → HeaderGroup (if any)
  const groupByZone = new Map<string, HeaderGroup>();
  for (const hg of schema.headerGroups) {
    groupByZone.set(hg.zoneId, hg);
  }

  // Collect all column IDs that belong to any group
  const groupedColumnIds = new Set<string>();
  for (const hg of schema.headerGroups) {
    const zone = schema.zones.find((z) => z.id === hg.zoneId);
    if (zone) {
      for (const colId of zone.columnIds) groupedColumnIds.add(colId);
    }
  }

  // Build top row by iterating ZONES IN ORDER.
  // This preserves structural zone order:
  //   fixed-start columns → group title → fixed-end columns
  const colMap = new Map(tableV2.columns.map((c) => [c.id, c]));
  const topRow: HeaderLayoutCell[] = [];
  for (const zone of schema.zones) {
    const group = groupByZone.get(zone.id);
    if (group) {
      // This zone has a header group → emit ONE group-title spanning all its columns
      topRow.push({ kind: "group-title", group, colSpan: zone.columnIds.length });
    } else {
      // Ungrouped zone → emit each column with rowSpan=2
      for (const colId of zone.columnIds) {
        const col = colMap.get(colId);
        if (col) {
          topRow.push({ kind: "column", columnId: col.id, rowSpan: 2, colSpan: 1 });
        }
      }
    }
  }

  // Bottom row: only grouped columns in zone order
  const bottomRow = tableV2.columns
    .filter((c) => groupedColumnIds.has(c.id))
    .map((c) => c.id);

  return { topRow, bottomRow: bottomRow.length > 0 ? bottomRow : null, hasGroups: true };
}

/* ================================================================== */
/*  HOMOLOGATION PRESET                                                */
/* ================================================================== */

const HOMOLOGY_COLUMN_IDS = {
  fraction: "hom-fraction",
  subjectArea: "hom-subject-area",
  unitValue: "hom-unit-value",
  neg: "hom-factor-neg",
  ubic: "hom-factor-ubic",
  sup: "hom-factor-sup",
  serv: "hom-factor-serv",
  clas: "hom-factor-clas",
  top: "hom-factor-top",
  re: "hom-factor-re",
  netUnitValue: "hom-net-unit-value",
  partialValue: "hom-partial-value",
} as const;

/** Create the initial homologation table instance with preset schema. */
export function createHomologationTable(): TableV2 {
  const zoneFixedStart = "zone-fixed-start";
  const zoneDynamic = "zone-dynamic";
  const zoneFixedEnd = "zone-fixed-end";

  const columns: TableColumn[] = [
    { id: HOMOLOGY_COLUMN_IDS.fraction, name: "Fracción" },
    { id: HOMOLOGY_COLUMN_IDS.subjectArea, name: "Superficie del Sujeto (m²)" },
    { id: HOMOLOGY_COLUMN_IDS.unitValue, name: "Valor Unitario ($/m²)" },
    { id: HOMOLOGY_COLUMN_IDS.neg, name: "Neg." },
    { id: HOMOLOGY_COLUMN_IDS.ubic, name: "Ubic." },
    { id: HOMOLOGY_COLUMN_IDS.sup, name: "Sup." },
    { id: HOMOLOGY_COLUMN_IDS.serv, name: "Serv." },
    { id: HOMOLOGY_COLUMN_IDS.clas, name: "Clas" },
    { id: HOMOLOGY_COLUMN_IDS.top, name: "Top." },
    { id: HOMOLOGY_COLUMN_IDS.re, name: "Re" },
    { id: HOMOLOGY_COLUMN_IDS.netUnitValue, name: "Valor Unitario Neto $/m²" },
    { id: HOMOLOGY_COLUMN_IDS.partialValue, name: "Valor Parcial $" },
  ];

  const emptyCells: Record<string, TableCellV2> = {};
  for (const col of columns) { emptyCells[col.id] = { kind: "value", value: "" }; }

  const schema: TableSchema = {
    presetId: "homologation",
    zones: [
      { id: zoneFixedStart, kind: "fixed", columnIds: [
        HOMOLOGY_COLUMN_IDS.fraction,
        HOMOLOGY_COLUMN_IDS.subjectArea,
        HOMOLOGY_COLUMN_IDS.unitValue,
      ]},
      { id: zoneDynamic, kind: "dynamic", columnIds: [
        HOMOLOGY_COLUMN_IDS.neg,
        HOMOLOGY_COLUMN_IDS.ubic,
        HOMOLOGY_COLUMN_IDS.sup,
        HOMOLOGY_COLUMN_IDS.serv,
        HOMOLOGY_COLUMN_IDS.clas,
        HOMOLOGY_COLUMN_IDS.top,
        HOMOLOGY_COLUMN_IDS.re,
      ], allowInsert: true, allowRemove: true, allowReorder: true, minColumns: 1 },
      { id: zoneFixedEnd, kind: "fixed", columnIds: [
        HOMOLOGY_COLUMN_IDS.netUnitValue,
        HOMOLOGY_COLUMN_IDS.partialValue,
      ]},
    ],
    headerGroups: [
      { id: "hg-factors", title: "Factores de Homologación", titleEditable: true, zoneId: zoneDynamic },
    ],
    resultGroups: [
      {
        id: "rg-area", position: "bottom", align: "start",
        items: [
          { id: "ri-area", label: "Superficie valuada", labelEditable: true },
        ],
      },
      {
        id: "rg-unit-avg", position: "bottom", align: "center",
        items: [
          { id: "ri-unit-avg", label: "Valor Unitario Medio ($/m²)", labelEditable: true },
        ],
      },
      {
        id: "rg-terrain", position: "bottom", align: "end",
        items: [
          { id: "ri-terrain", label: "A) Valor del Terreno", labelEditable: true },
        ],
      },
    ],
    columnPresentation: {
      [HOMOLOGY_COLUMN_IDS.fraction]: { width: 70 },
      [HOMOLOGY_COLUMN_IDS.subjectArea]: { width: 90 },
      [HOMOLOGY_COLUMN_IDS.unitValue]: { width: 90 },
      [HOMOLOGY_COLUMN_IDS.neg]: { width: 55 },
      [HOMOLOGY_COLUMN_IDS.ubic]: { width: 55 },
      [HOMOLOGY_COLUMN_IDS.sup]: { width: 55 },
      [HOMOLOGY_COLUMN_IDS.serv]: { width: 55 },
      [HOMOLOGY_COLUMN_IDS.clas]: { width: 50 },
      [HOMOLOGY_COLUMN_IDS.top]: { width: 50 },
      [HOMOLOGY_COLUMN_IDS.re]: { width: 50 },
      [HOMOLOGY_COLUMN_IDS.netUnitValue]: { width: 90 },
      [HOMOLOGY_COLUMN_IDS.partialValue]: { width: 90 },
    },
  };

  return {
    id: `homo-${Date.now().toString(36)}`,
    title: "Tabla de Homologación",
    version: 2,
    columns,
    rows: [{ id: `row-${Date.now().toString(36)}`, cells: { ...emptyCells } }],
    enabled: true,
    schema,
  };
}
