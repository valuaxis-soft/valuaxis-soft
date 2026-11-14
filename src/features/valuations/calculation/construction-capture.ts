/**
 * The tables of the construction section that are the capture of the cost
 * approach (video 5.3, Álvaro: «una sola tabla»): the construction types
 * table and the special installations table. Each row is a type (or an
 * installation) and its columns are what used to be typed in the panel
 * «Tipos de construcción» (or in the cost panel): reference, description,
 * classification, quality, surface, age and useful life; for an
 * installation, its description, unit, quantity, age, useful life and
 * maintenance. The figures the system works out (VUR, the conservation
 * factor the cost approach gives, its unit replacement value) are written
 * here and locked. The rest of the table is the appraiser's: columns of his
 * own, headers renamed or combined, formats, hidden rows and columns.
 *
 * The table and the server are kept in step both ways: what the appraiser
 * writes in the table is read as items (`readCapture`) and saved; what the
 * server holds is written back into the table (`mergeCapture`) only where it
 * changed since the last time both agreed, so a figure being written is
 * never overwritten by an older one.
 */
import type { AppSection, TableContent } from "../model";
import {
  ensureTableV2,
  getDisplayColumns,
  readTypedNumber,
  type TableCaptureMarker,
  type TableCellV2,
  type TableColumn,
  type TableRow,
  type TableV2,
} from "../services/table";
import {
  effectiveConservation,
  remainingUsefulLife,
  type ConstructionTypeDto,
  type CostCalculationDto,
  type InstallationDto,
} from "./cost-types";

export type CaptureKind = TableCaptureMarker["kind"];

const CONSTRUCTION_TYPES_TABLE = "construccion_tipos";
const SPECIAL_INSTALLATIONS_TABLE = "instalaciones_especiales";

/**
 * Whether a table of the construction section is the capture of the cost
 * approach, found by the ID of the template's table (it is pinned to the
 * Apartado it was created in) or by its mark.
 */
export function isCostCaptureTable(tableId: string) {
  return tableKindById(tableId) !== null;
}

function tableKindById(tableId: string): CaptureKind | null {
  const id = tableId.toLowerCase();
  if (id.endsWith(CONSTRUCTION_TYPES_TABLE)) return "types";
  if (id.endsWith(SPECIAL_INSTALLATIONS_TABLE)) return "installations";
  return null;
}

/** What a table of the construction section captures, if it is a capture table. */
export function captureKindOf(table: TableContent | TableV2): CaptureKind | null {
  const marker = (table as TableV2).schema?.capture;
  return marker?.kind ?? tableKindById(table.id);
}

/** The table is already the capture (it was marked when it became one). */
export const isCaptureMarked = (table: TableContent | TableV2) => Boolean((table as TableV2).schema?.capture);

/** The table's link with the cost approach was taken off by the appraiser. */
export const isCaptureUnlinked = (table: TableContent | TableV2) => Boolean((table as TableV2).schema?.capture?.unlinked);

/* ------------------------------------------------------------------ */
/*  Columns                                                            */
/* ------------------------------------------------------------------ */

/**
 * What a column of a capture table holds:
 * - `ref`: the row's reference (T-1, 1…), the key of the type or installation;
 * - `field`: a datum of the type or installation, written here and saved;
 * - `computed`: a figure the system works out, locked;
 * - `legacy`: written once from the capture when the table became the capture (the installation's P/C), then the appraiser's;
 * - `free`: the appraiser's.
 */
type ColumnRole = "ref" | "field" | "computed" | "legacy" | "free";

type CaptureColumn = {
  key: string;
  names: readonly string[];
  role: ColumnRole;
  /** The item's field, for `ref` and `field` columns. */
  field?: string;
  number?: boolean;
  /** Decimals a number is written with. */
  digits?: number;
  /** Part of the template's columns, in their order: a table whose headers were all renamed is read by position. */
  positional?: boolean;
};

/**
 * The columns of the construction types table, in the order of the template
 * (sections/construccion): the key of the column and the headers it is
 * known by. The template has two "Tipo" columns: the first is the
 * reference, the second the type's description.
 */
const TYPES_COLUMNS: readonly CaptureColumn[] = [
  { key: "tipo", names: ["tipo"], role: "ref", field: "ref", positional: true },
  { key: "tipo_construccion", names: ["tipo", "tipo de construccion"], role: "field", field: "description", positional: true },
  { key: "clasificacion", names: ["clasificacion"], role: "field", field: "classification", positional: true },
  { key: "calidad", names: ["calidad"], role: "field", field: "quality", positional: true },
  { key: "conservacion", names: ["conservacion", "cons"], role: "computed", digits: 2, positional: true },
  { key: "edad", names: ["edad"], role: "field", field: "age", number: true, digits: 0, positional: true },
  { key: "vut", names: ["vut", "vida util", "vida util total"], role: "field", field: "usefulLife", number: true, digits: 0, positional: true },
  { key: "vur", names: ["vur", "vida remanente", "vida util remanente"], role: "computed", digits: 0, positional: true },
  { key: "sup_m2", names: ["sup m2", "superficie", "superficie m2", "sup"], role: "field", field: "area", number: true, digits: 2, positional: true },
  { key: "descripcion", names: ["descripcion"], role: "free", positional: true },
  { key: "vrn_unitario", names: ["valor unitario", "valor unitario de reposicion", "vrn unitario", "vrn unit", "vru"], role: "computed", digits: 2 },
];

const INSTALLATIONS_COLUMNS: readonly CaptureColumn[] = [
  { key: "numero", names: ["", "no", "num", "numero", "ref"], role: "ref", field: "ref", positional: true },
  { key: "tipo", names: ["tipo"], role: "legacy", positional: true },
  { key: "edad", names: ["edad"], role: "field", field: "age", number: true, digits: 0, positional: true },
  { key: "vut", names: ["vut", "vida util", "vida util total"], role: "field", field: "usefulLife", number: true, digits: 0, positional: true },
  { key: "vur", names: ["vur", "vida remanente", "vida util remanente"], role: "computed", digits: 0, positional: true },
  { key: "conservacion", names: ["conservacion", "cons"], role: "computed", digits: 3, positional: true },
  { key: "mantenimiento", names: ["mantenimiento", "mantenim"], role: "field", field: "maintenance", positional: true },
  { key: "descripcion", names: ["descripcion"], role: "field", field: "description", positional: true },
  { key: "unidad", names: ["unidad", "unid"], role: "field", field: "unit" },
  { key: "cantidad", names: ["cant", "cantidad"], role: "field", field: "quantity", number: true, digits: 2 },
  { key: "vrn_unitario", names: ["valor unitario", "valor unitario de reposicion", "vrn unitario", "vrn unit", "vru"], role: "computed", digits: 2 },
];

const columnsOf = (kind: CaptureKind) => (kind === "types" ? TYPES_COLUMNS : INSTALLATIONS_COLUMNS);

const headerName = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The capture column of each column of the table, or null for a column of
 * the appraiser's. A column is known by its id (the template's key) or by its
 * header; a header two columns share ("Tipo") goes to them in order. A table
 * whose headers were all renamed is read by position, as before.
 */
function captureColumns(columns: TableColumn[], kind: CaptureKind): (CaptureColumn | null)[] {
  const known = columnsOf(kind);
  const taken = new Set<string>();
  const found = columns.map((column): CaptureColumn | null => {
    const byId = known.find((item) => item.key === column.id.toLowerCase() && !taken.has(item.key));
    const name = headerName(column.name);
    const match = byId ?? known.find((item) => !taken.has(item.key) && item.names.includes(name));
    if (!match) return null;
    taken.add(match.key);
    return match;
  });
  const positional = known.filter((item) => item.positional);
  if (found.filter(Boolean).length >= Math.min(2, positional.length)) return found;
  return columns.map((_, index) => positional[index] ?? null);
}

/** The table's columns by the capture column they hold. */
function columnMap(table: TableV2, kind: CaptureKind) {
  const display = getDisplayColumns(table);
  const keys = captureColumns(display, kind);
  const byColumn = new Map<string, CaptureColumn>();
  const byKey = new Map<string, string>();
  display.forEach((column, index) => {
    const capture = keys[index];
    if (!capture) return;
    byColumn.set(column.id, capture);
    byKey.set(capture.key, column.id);
  });
  return { byColumn, byKey };
}

/** The ids of the columns the system writes, locked in the editor. */
export function computedColumnIds(table: TableContent | TableV2): string[] {
  const kind = captureKindOf(table);
  if (!kind) return [];
  const { byColumn } = columnMap(ensureTableV2(table), kind);
  return [...byColumn.entries()].filter(([, column]) => column.role === "computed").map(([id]) => id);
}

/** The ids of the columns whose data enter the cost approach: they are hidden, not deleted. */
export function captureColumnIds(table: TableContent | TableV2): string[] {
  const kind = captureKindOf(table);
  if (!kind) return [];
  const { byColumn } = columnMap(ensureTableV2(table), kind);
  return [...byColumn.entries()].filter(([, column]) => column.role === "ref" || column.role === "field").map(([id]) => id);
}

/* ------------------------------------------------------------------ */
/*  Items                                                              */
/* ------------------------------------------------------------------ */

export type TypeItem = Omit<ConstructionTypeDto, "id">;
export type InstallationItem = Pick<InstallationDto, "ref" | "description" | "unit" | "quantity" | "age" | "usefulLife" | "maintenance">;
export type CaptureItem = TypeItem | InstallationItem;
type ItemRecord = Record<string, string | number | null>;

/**
 * A type or an installation as the server holds it, and the row of the table
 * that shows it. `id` is the type's own row on the server (renaming its
 * reference keeps it, with what the cost approach captured for it).
 */
export type SyncedItem = { rowId: string | null; id?: number; item: CaptureItem };

const emptyItem = (kind: CaptureKind): ItemRecord => (kind === "types"
  ? { ref: "", description: "", classification: "", quality: "", area: null, age: null, usefulLife: null }
  : { ref: "", description: "", unit: "", quantity: null, age: null, usefulLife: null, maintenance: "" });

const itemFields = (kind: CaptureKind) => Object.keys(emptyItem(kind));

/** The capture of the server, as items. */
export function serverItems(kind: CaptureKind, calculation: Pick<CostCalculationDto, "types" | "installations">): Array<{ id?: number; item: CaptureItem }> {
  if (kind === "types") {
    return calculation.types.map(({ id, ...type }) => ({ ...(id === undefined ? {} : { id }), item: type }));
  }
  return calculation.installations.map((row) => ({
    item: { ref: row.ref, description: row.description, unit: row.unit, quantity: row.quantity, age: row.age, usefulLife: row.usefulLife, maintenance: row.maintenance },
  }));
}

const refKey = (ref: string) => ref.trim().toLowerCase();
const EMPTY_MARK = "—";
const number = (digits: number) => new Intl.NumberFormat("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** How a datum is written in its cell: numbers with the column's decimals, nothing for nothing. */
function fieldText(column: CaptureColumn, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return number(column.digits ?? 2).format(value);
  return value;
}

const computedText = (value: number | null | undefined, digits: number) =>
  (value === null || value === undefined ? EMPTY_MARK : number(digits).format(value));

/** The text of a cell; a formula gives its result. */
function cellText(table: TableV2, row: TableRow, columnId: string): string {
  const cell = row.cells[columnId];
  if (!cell) return "";
  if (cell.kind === "value") return cell.value.trim() === EMPTY_MARK ? "" : cell.value.trim();
  const result = table.formulaResults?.[`${row.id}:${columnId}`];
  return result?.ok ? String(result.value) : "";
}

/**
 * A datum read from its cell. A number shown as the server's value is the
 * server's value (with all its decimals: 11.555 shown as 11.56 stays
 * 11.555); otherwise what is written, or the result of its formula.
 */
function readField(table: TableV2, row: TableRow, columnId: string, column: CaptureColumn, known: ItemRecord | null): string | number | null {
  const cell = row.cells[columnId];
  if (!column.number) return cellText(table, row, columnId);
  if (cell?.kind === "formula") {
    const result = table.formulaResults?.[`${row.id}:${columnId}`];
    return result?.ok ? result.value : (known?.[column.field!] as number | null | undefined) ?? null;
  }
  const written = cellText(table, row, columnId);
  const knownValue = known?.[column.field!];
  if (typeof knownValue === "number" && written === fieldText(column, knownValue)) return knownValue;
  if (!written) return null;
  const value = readTypedNumber(written);
  return value !== null && value >= 0 ? value : (typeof knownValue === "number" ? knownValue : null);
}

/** What a row holds, by field, with what the server knows for the fields the table has no column for. */
function rowRecord(table: TableV2, row: TableRow, kind: CaptureKind, map: ReturnType<typeof columnMap>, known: ItemRecord | null): ItemRecord {
  const record: ItemRecord = { ...emptyItem(kind), ...(known ?? {}) };
  for (const [columnId, column] of map.byColumn) {
    if (!column.field) continue;
    record[column.field] = readField(table, row, columnId, column, known);
  }
  return record;
}

/** The row's own data (beyond its reference) has something written. */
function rowHasData(table: TableV2, row: TableRow, map: ReturnType<typeof columnMap>): boolean {
  return [...map.byColumn].some(([columnId, column]) => column.role === "field" && cellText(table, row, columnId) !== "");
}

const refOfRow = (table: TableV2, row: TableRow, map: ReturnType<typeof columnMap>) => {
  const columnId = map.byKey.get(columnsOf(captureKindOf(table) ?? "types")[0].key);
  return columnId ? cellText(table, row, columnId) : "";
};

/**
 * The types (or installations) the table holds, in its order: each row with
 * a reference and something written, or that the server already knows.
 * `synced` is what the server held the last time both agreed, by row: a
 * figure shown as it was saved keeps its decimals, and a column the table
 * does not have keeps the server's datum. An installation without
 * description is not one yet (the cost approach needs it), unless the server
 * has its description.
 */
export function readCapture(tableContent: TableContent | TableV2, kind: CaptureKind, synced: SyncedItem[] | null): Array<{ rowId: string; id?: number; item: CaptureItem }> {
  const table = ensureTableV2(tableContent);
  const map = columnMap(table, kind);
  if (!map.byKey.has(columnsOf(kind)[0].key)) return [];
  const byRow = new Map((synced ?? []).flatMap((entry) => (entry.rowId ? [[entry.rowId, entry] as const] : [])));
  const byRef = new Map((synced ?? []).map((entry) => [refKey(entry.item.ref), entry]));
  const fields = itemFields(kind);
  // Each saved item goes to one row: its own (by row), else the first row with its reference.
  const used = new Set<SyncedItem>();
  return table.rows.flatMap((row) => {
    const ref = refOfRow(table, row, map);
    if (!ref) return [];
    const mine = byRow.get(row.id);
    const sameRef = byRef.get(refKey(ref));
    const known = (mine && !used.has(mine) ? mine : sameRef && !used.has(sameRef) && (!sameRef.rowId || !table.rows.some((other) => other.id === sameRef.rowId)) ? sameRef : null) ?? null;
    if (known) used.add(known);
    if (!known && !rowHasData(table, row, map)) return [];
    const record = rowRecord(table, row, kind, map, known ? (known.item as unknown as ItemRecord) : null);
    record.ref = ref;
    if (kind === "installations" && !String(record.description ?? "").trim()) {
      const description = known ? String((known.item as InstallationItem).description ?? "") : "";
      if (!description) return [];
      record.description = description;
    }
    const item = Object.fromEntries(fields.map((field) => [field, record[field]])) as unknown as CaptureItem;
    return [{ rowId: row.id, ...(known?.id === undefined ? {} : { id: known.id }), item }];
  });
}

/** The two lists hold the same types (or installations), in the same order. */
export function sameItems(left: Array<{ item: CaptureItem }> | null, right: Array<{ item: CaptureItem }> | null): boolean {
  if (!left || !right) return left === right;
  const text = (list: Array<{ item: CaptureItem }>) => JSON.stringify(list.map(({ item }) => item));
  return text(left) === text(right);
}

/* ------------------------------------------------------------------ */
/*  Writing the table                                                  */
/* ------------------------------------------------------------------ */

const asContent = (table: TableV2, title: string) => ({ ...table, title }) as unknown as TableContent;

function withCell(row: TableRow, columnId: string, text: string): TableRow {
  const current = row.cells[columnId];
  if (current?.kind === "value" && current.value === text) return row;
  const format = current?.format;
  return { ...row, cells: { ...row.cells, [columnId]: { kind: "value", value: text, ...(format ? { format } : {}) } } };
}

/** A reference not yet in the table: T-4 after T-1…T-3, 6 after 1…5. */
export function nextCaptureRef(kind: CaptureKind, refs: string[]): string {
  const taken = new Set(refs.map(refKey));
  if (kind === "types") {
    const numbers = refs.flatMap((ref) => /^T-(\d+)$/i.exec(ref.trim())?.[1] ?? []).map(Number);
    let next = Math.max(...numbers, 0) + 1;
    while (taken.has(`t-${next}`)) next += 1;
    return `T-${next}`;
  }
  const numbers = refs.map((ref) => Number(ref.trim())).filter((value) => Number.isInteger(value));
  let next = Math.max(...numbers, 0) + 1;
  while (taken.has(String(next))) next += 1;
  return String(next);
}

/**
 * The table as the capture keeps it, after any edit: a row with data and no
 * reference takes the next one, a reference written twice (a duplicated row)
 * takes the next one in its second row, and the figures the system works out
 * are written: VUR from the row's own age and useful life, the conservation
 * factor and the unit replacement value from the cost approach.
 */
export function normalizeCapture(tableContent: TableContent, costs: Pick<CostCalculationDto, "constructions" | "installations"> | null): TableContent {
  const table = ensureTableV2(tableContent);
  const kind = captureKindOf(table);
  if (!kind) return tableContent;
  const map = columnMap(table, kind);
  const refColumn = map.byKey.get(columnsOf(kind)[0].key);
  if (!refColumn) return tableContent;
  const linked = !isCaptureUnlinked(table);

  // References: the rows with data get one, and each is used once.
  const refs = table.rows.map((row) => refOfRow(table, row, map));
  const seen = new Set<string>();
  let rows = table.rows.map((row, index) => {
    const ref = refs[index];
    const duplicated = ref && seen.has(refKey(ref));
    if (ref && !duplicated) {
      seen.add(refKey(ref));
      return row;
    }
    if (!duplicated && !rowHasData(table, row, map)) return row;
    const next = nextCaptureRef(kind, [...refs.filter(Boolean), ...seen]);
    seen.add(refKey(next));
    refs[index] = next;
    return withCell(row, refColumn, next);
  });

  // The figures of the system, in the rows that are types (or installations).
  if (linked) {
    const costRows = kind === "types" ? costs?.constructions ?? [] : costs?.installations ?? [];
    const costOf = (ref: string) => costRows.find((row) => refKey(row.ref) === refKey(ref));
    const current = { ...table, rows };
    rows = rows.map((row, index) => {
      const ref = refs[index];
      const isItem = Boolean(ref) && rowHasData(current, row, map);
      const record = isItem ? rowRecord(current, row, kind, map, null) : null;
      let next = row;
      for (const [columnId, column] of map.byColumn) {
        if (column.role !== "computed") continue;
        let text = "";
        if (record) {
          const cost = costOf(ref);
          if (column.key === "vur") text = computedText(remainingUsefulLife({ age: record.age as number | null, usefulLife: record.usefulLife as number | null }), column.digits ?? 0);
          else if (column.key === "conservacion") text = computedText(cost ? effectiveConservation(cost) : null, column.digits ?? 2);
          else if (column.key === "vrn_unitario") text = computedText(cost?.unitReplacementCost ?? null, column.digits ?? 2);
        }
        next = withCell(next, columnId, text);
      }
      return next;
    });
  }

  if (rows.every((row, index) => row === table.rows[index])) return tableContent;
  return asContent({ ...table, rows }, tableContent.title);
}

/**
 * The table with what the server holds where it changed since the last time
 * both agreed (`synced`): a type changed in the server (by the cost panel, or
 * on opening) writes its data in its row (found by its reference), a new one
 * takes a row after the one before it, and one the server no longer has
 * leaves the table when the table had it as saved. Without `synced` (on
 * opening) nothing leaves the table: a row written and not yet saved is
 * saved after. A datum shown as the server has it is left as written (with
 * its formula, if it has one).
 */
export function mergeCapture(
  tableContent: TableContent,
  server: Array<{ item: CaptureItem }>,
  synced: SyncedItem[] | null,
  costs: Pick<CostCalculationDto, "constructions" | "installations"> | null,
): TableContent {
  const table = ensureTableV2(tableContent);
  const kind = captureKindOf(table);
  if (!kind || isCaptureUnlinked(table)) return tableContent;
  const map = columnMap(table, kind);
  const refColumn = map.byKey.get(columnsOf(kind)[0].key);
  if (!refColumn) return tableContent;
  if (synced && sameItems(server, synced)) return normalizeCapture(tableContent, costs);

  const serverRefs = new Set(server.map(({ item }) => refKey(item.ref)));
  const syncedByRef = new Map((synced ?? []).map((entry) => [refKey(entry.item.ref), entry]));
  // A type the server no longer has leaves the table, if the table had it as saved.
  let rows = table.rows.filter((row) => {
    const ref = refKey(refOfRow(table, row, map));
    return !(ref && syncedByRef.has(ref) && !serverRefs.has(ref));
  });
  const ids = new Set(table.rows.map((row) => row.id));
  let after = -1;
  for (const [position, { item }] of server.entries()) {
    const record = item as unknown as ItemRecord;
    const before = syncedByRef.get(refKey(item.ref))?.item as unknown as ItemRecord | undefined;
    const index = rows.findIndex((row) => refKey(refOfRow(table, row, map)) === refKey(item.ref));
    if (index >= 0) {
      let row = rows[index];
      for (const [columnId, column] of map.byColumn) {
        if (!column.field) continue;
        // Only what the server changed is written: what the table changed since is being saved.
        if (before && before[column.field] === record[column.field]) continue;
        const shown = readField(table, row, columnId, column, record);
        if (shown === record[column.field] || (shown === "" && record[column.field] === null)) continue;
        row = withCell(row, columnId, fieldText(column, record[column.field]));
      }
      rows[index] = row;
      after = index;
      continue;
    }
    // Saved before and gone from the table: the appraiser took it out, and that is being saved.
    if (before) continue;
    let id = `r-${table.id}-${position}`;
    while (ids.has(id)) id = `${id}-n`;
    ids.add(id);
    const cells = Object.fromEntries(table.columns.map((column): [string, TableCellV2] => {
      const capture = map.byColumn.get(column.id);
      return [column.id, { kind: "value", value: capture?.field ? fieldText(capture, record[capture.field]) : "" }];
    }));
    rows = [...rows.slice(0, after + 1), { id, cells }, ...rows.slice(after + 1)];
    after += 1;
  }
  const unchanged = rows.length === table.rows.length && rows.every((row, index) => row === table.rows[index]);
  return normalizeCapture(unchanged ? tableContent : asContent({ ...table, rows }, tableContent.title), costs);
}

/**
 * The server's items with the rows that show them, matched by reference; an
 * item whose reference is not in the table (renamed there, and being saved)
 * keeps the row it had in `previous`.
 */
export function syncedFromTable(tableContent: TableContent, server: Array<{ id?: number; item: CaptureItem }>, previous: SyncedItem[] | null = null): SyncedItem[] {
  const table = ensureTableV2(tableContent);
  const kind = captureKindOf(table);
  const map = kind ? columnMap(table, kind) : null;
  const rowByRef = new Map(map ? table.rows.map((row) => [refKey(refOfRow(table, row, map)), row.id] as const) : []);
  const rowIds = new Set(table.rows.map((row) => row.id));
  const before = (entry: { id?: number; item: CaptureItem }) =>
    previous?.find((item) => (entry.id !== undefined && item.id === entry.id) || refKey(item.item.ref) === refKey(entry.item.ref));
  return server.map((entry) => {
    const kept = before(entry)?.rowId;
    const rowId = rowByRef.get(refKey(entry.item.ref)) ?? (kept && rowIds.has(kept) ? kept : null);
    return { rowId, ...(entry.id === undefined ? {} : { id: entry.id }), item: entry.item };
  });
}

/**
 * The table with one row more, at the end, for a new type (or installation):
 * its reference is the next one (T-4, 6…). Says which row and which column
 * to write in first.
 */
export function withNewCaptureRow(tableContent: TableContent): { table: TableContent; rowIndex: number; columnId: string | null } {
  const table = ensureTableV2(tableContent);
  const kind = captureKindOf(table);
  if (!kind) return { table: tableContent, rowIndex: -1, columnId: null };
  const map = columnMap(table, kind);
  const refColumn = map.byKey.get(columnsOf(kind)[0].key);
  const refs = table.rows.map((row) => refOfRow(table, row, map)).filter(Boolean);
  const ids = new Set(table.rows.map((row) => row.id));
  let id = `r-${table.id}-${table.rows.length}`;
  while (ids.has(id)) id = `${id}-n`;
  const cells = Object.fromEntries(table.columns.map((column): [string, TableCellV2] => [
    column.id,
    { kind: "value", value: column.id === refColumn ? nextCaptureRef(kind, refs) : "" },
  ]));
  const first = getDisplayColumns(table).find((column) => map.byColumn.get(column.id)?.role === "field");
  return { table: asContent({ ...table, rows: [...table.rows, { id, cells }] }, tableContent.title), rowIndex: table.rows.length, columnId: first?.id ?? null };
}

/* ------------------------------------------------------------------ */
/*  Tables saved before the table was the capture                      */
/* ------------------------------------------------------------------ */

/** The example row the template's installations table was born with; it never entered the cost approach. */
const TEMPLATE_EXAMPLE_INSTALLATION = "Aire acondicionado de 1 tonelada, con accesorios incluidos e instalado en sala principal.";

/**
 * Unit and quantity of an installation used to be printed inside its
 * description («Tanque de gas (6 Pza)»); a table that becomes the capture
 * gets them as columns of their own, after the description, unless it has
 * them (or its columns are laid out in zones).
 */
function withInstallationColumns(table: TableV2): TableV2 {
  if (table.schema?.zones?.length) return table;
  const map = columnMap(table, "installations");
  const missing = [
    { id: "unidad", name: "Unidad" },
    { id: "cantidad", name: "Cant." },
  ].filter((column) => !map.byKey.has(column.id) && !table.columns.some((existing) => existing.id === column.id));
  if (!missing.length) return table;
  const description = map.byKey.get("descripcion");
  const at = description ? table.columns.findIndex((column) => column.id === description) + 1 : table.columns.length;
  const columns = [...table.columns.slice(0, at), ...missing, ...table.columns.slice(at)];
  const rows = table.rows.map((row) => ({ ...row, cells: { ...row.cells, ...Object.fromEntries(missing.map((column) => [column.id, { kind: "value", value: "" } as TableCellV2])) } }));
  return { ...table, columns, rows };
}

/**
 * A table of the construction section that was filled from the capture
 * (before video 5.3) becomes the capture: its rows are the server's types
 * (or installations), in their order, each in the row it had (the columns
 * of the appraiser keep what was written in them, row by row), as it was
 * printed; the P/C of an installation is written in its "Tipo" once. Before
 * anything is captured the table stays as it is (the example installation of
 * the template leaves it). Its title does not print, as it never did in this
 * section.
 */
export function asCaptureTable(tableContent: TableContent, calculation: CostCalculationDto): TableContent {
  let table = ensureTableV2(tableContent);
  const kind = captureKindOf(table);
  if (!kind || table.schema?.capture) return tableContent;
  if (kind === "installations") table = withInstallationColumns(table);
  const map = columnMap(table, kind);
  const captured = kind === "types" ? calculation.types.length > 0 || calculation.typesCaptured : calculation.installations.length > 0 || calculation.configured;
  let rows = table.rows;
  if (captured) {
    const items = serverItems(kind, calculation);
    const ids = new Set(table.rows.map((row) => row.id));
    rows = items.map(({ item }, index): TableRow => {
      const record = item as unknown as ItemRecord;
      const current = table.rows[index];
      let id = current?.id ?? `r-${table.id}-${index}`;
      if (!current) {
        while (ids.has(id)) id = `${id}-n`;
        ids.add(id);
      }
      const installation = kind === "installations" ? calculation.installations[index] : null;
      const cells = Object.fromEntries(table.columns.map((column): [string, TableCellV2] => {
        const capture = map.byColumn.get(column.id);
        if (capture?.field) return [column.id, { kind: "value", value: fieldText(capture, record[capture.field]) }];
        if (capture?.role === "legacy" && installation) return [column.id, { kind: "value", value: installation.share === "C" ? "Común" : "Privativa" }];
        if (capture?.role === "computed") return [column.id, { kind: "value", value: "" }];
        // The column of the appraiser keeps what was written in it; the template's free "Descripción" of a type was always left empty.
        return [column.id, current?.cells[column.id] ?? { kind: "value", value: "" }];
      }));
      return { id, cells };
    });
  } else if (kind === "installations") {
    rows = rows.filter((row) => !Object.values(row.cells).some((cell) => cell.kind === "value" && cell.value.trim() === TEMPLATE_EXAMPLE_INSTALLATION));
  }
  const schema = { ...(table.schema ?? { zones: [] }), capture: { kind } as TableCaptureMarker };
  if (schema.hideCaption === undefined) schema.hideCaption = true;
  return normalizeCapture(asContent({ ...table, rows, schema }, tableContent.title), calculation);
}

/** The capture tables of a section: the first table of each kind (another one of the same kind is a table of the appraiser's). */
export function captureTablesOf(section: AppSection): Map<string, CaptureKind> {
  const found = new Map<string, CaptureKind>();
  const kinds = new Set<CaptureKind>();
  for (const block of section.blocks) {
    for (const container of [block, ...block.apartados]) {
      for (const table of container.tables) {
        const kind = captureKindOf(table);
        if (!kind || kinds.has(kind)) continue;
        kinds.add(kind);
        found.set(table.id, kind);
      }
    }
  }
  return found;
}

/** The section with each of its capture tables changed by `change`; the same section when none changes. */
export function withCaptureTables(section: AppSection, change: (table: TableContent, kind: CaptureKind) => TableContent): AppSection {
  const captures = captureTablesOf(section);
  if (!captures.size) return section;
  let changed = false;
  const tablesOf = (tables: TableContent[]) => {
    const next = tables.map((table) => {
      const kind = captures.get(table.id);
      if (!kind) return table;
      const updated = change(table, kind);
      if (updated !== table) changed = true;
      return updated;
    });
    return next.some((table, index) => table !== tables[index]) ? next : tables;
  };
  const blocks = section.blocks.map((block) => {
    const tables = tablesOf(block.tables);
    const apartados = block.apartados.map((apartado) => {
      const next = tablesOf(apartado.tables);
      return next === apartado.tables ? apartado : { ...apartado, tables: next };
    });
    return tables === block.tables && apartados.every((apartado, index) => apartado === block.apartados[index]) ? block : { ...block, tables, apartados };
  });
  return changed ? { ...section, blocks } : section;
}

/** The capture table of a kind in the section, if it has one. */
export function findCaptureTable(section: AppSection, kind: CaptureKind): TableContent | null {
  const captures = captureTablesOf(section);
  for (const block of section.blocks) {
    for (const container of [block, ...block.apartados]) {
      const table = container.tables.find((item) => captures.get(item.id) === kind);
      if (table) return table;
    }
  }
  return null;
}

/**
 * The construction section with its capture tables following the cost
 * calculation: a table saved before becomes the capture, and each one takes
 * what the server changed since `synced` (by kind). Unlinked tables are left
 * as the appraiser has them.
 */
export function withConstructionTables(
  section: AppSection,
  calculation: CostCalculationDto,
  synced: Partial<Record<CaptureKind, SyncedItem[] | null>> = {},
): AppSection {
  return withCaptureTables(section, (table, kind) => {
    const converted = asCaptureTable(table, calculation);
    if (converted !== table) return converted;
    return mergeCapture(table, serverItems(kind, calculation), synced[kind] ?? null, calculation);
  });
}
