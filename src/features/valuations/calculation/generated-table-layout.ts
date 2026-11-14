/**
 * A table the calculation writes, as the appraiser sets it in the editor like
 * any configurable table: headers renamed and grouped under a double header,
 * columns hidden, moved and given a format, and columns and rows of his own
 * (text or formulas) that print and do not enter the calculation. The
 * calculation keeps writing its cells (they are never typed here); what the
 * appraiser set is applied over them every time, and the table keeps what the
 * calculation wrote, so a column hidden today can be shown again.
 */
import type { Apartado, Block, Concept, ContentRowTagStyle, TableContent } from "../model";
import { resolveContentLayout, setContentRowTagStyle } from "../services/content-layout";
import {
  TABLE_DECIMALS_MAX,
  columnWidthOf,
  ensureTableV2,
  mergeTablePrintLayout,
  tablePrintLayout,
  getDisplayColumns,
  type ColumnPresentation,
  type GeneratedExtraColumn,
  type GeneratedExtraRow,
  type GeneratedHeaderGroup,
  type GeneratedTableLayout,
  type HeaderGroup,
  type StructuralZone,
  type TableCellFormat,
  type TableCellV2,
  type TableColumn,
  type TableRow,
  type TableSummaryBox,
  type TableSummaryRow,
  type TablePrintLayout,
  type TablePrintLayoutPatch,
  type TableV2,
  type TableWidthMode,
} from "../services/table";

/** Columns the appraiser may add to one table. */
export const MAX_EXTRA_COLUMNS = 12;
/** Rows the appraiser may add to one table. */
const MAX_EXTRA_ROWS = 30;

/** The table as the calculation wrote it, before what the appraiser set. */
export function sourceOf(table: TableContent | TableV2): TableV2 {
  const normalized = ensureTableV2(table);
  return normalized.schema?.generated?.source ?? normalized;
}

/** What the appraiser set on the table; empty when nothing. */
export function layoutOf(table: TableContent | TableV2): GeneratedTableLayout {
  return ensureTableV2(table).schema?.generated?.layout ?? {};
}

/** Something set: a non-blank text, a number or a flag, or a list or a record with something set. */
const filled = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(filled);
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

const isEmptyLayout = (layout: GeneratedTableLayout) => !Object.values(layout).some(filled);

/** Room, indent and alignment the appraiser set on the table. */
const layoutPrint = (layout: GeneratedTableLayout) => tablePrintLayout({ schema: { zones: [], ...layout } });

/** The key of a row of a box in `boxLabels`: its id, or its place in the box. */
export const summaryRowKey = (box: Pick<TableSummaryBox, "id">, row: Pick<TableSummaryRow, "id">, index: number) => `${box.id}.${row.id ?? index}`;

/** The key of a box's caption in `boxLabels`. */
export const summaryCaptionKey = (box: Pick<TableSummaryBox, "id">) => `${box.id}.caption`;

/** The key of a cell of the calculation in `cellFormats`. */
const cellKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`;

/** The boxes with the labels the appraiser gave them; the figures stay the calculation's. */
function relabeledBoxes(boxes: TableSummaryBox[], labels: Record<string, string>): TableSummaryBox[] {
  const label = (key: string, name: string) => labels[key]?.trim() || name;
  return boxes.map((box) => ({
    ...box,
    ...(box.caption !== undefined ? { caption: label(summaryCaptionKey(box), box.caption) } : {}),
    rows: box.rows.map((row, index) => ({ ...row, label: label(summaryRowKey(box, row, index), row.label) })),
  }));
}

type LaidColumn = TableColumn | GeneratedExtraColumn;
const isExtra = (column: LaidColumn): column is GeneratedExtraColumn => "values" in column;

/** The columns of the calculation, in order, with the ones added after the column each follows. */
function naturalColumns(source: TableV2, extras: GeneratedExtraColumn[]): LaidColumn[] {
  const columns: LaidColumn[] = [...getDisplayColumns(source)];
  const known = new Set(columns.map((column) => column.id));
  // In the order they were added: each one after the column it follows (or the last one added after it).
  for (const extra of extras) {
    if (extra.after === null || !known.has(extra.after)) {
      columns.push(extra);
    } else {
      let index = columns.findIndex((column) => column.id === extra.after);
      while (index + 1 < columns.length && isExtra(columns[index + 1]) && (columns[index + 1] as GeneratedExtraColumn).after === extra.after) index += 1;
      columns.splice(index + 1, 0, extra);
    }
    known.add(extra.id);
  }
  return columns;
}

/**
 * The columns in the order the appraiser left them; a column the order does
 * not name (one the calculation writes for the first time) goes after the
 * column it follows in the calculation's order.
 */
function orderedColumns(source: TableV2, extras: GeneratedExtraColumn[], order: string[] | undefined): LaidColumn[] {
  const natural = naturalColumns(source, extras);
  if (!order?.length) return natural;
  const byId = new Map(natural.map((column) => [column.id, column]));
  const result: LaidColumn[] = [];
  for (const id of order) {
    const column = byId.get(id);
    if (column && !result.includes(column)) result.push(column);
  }
  natural.forEach((column, index) => {
    if (result.includes(column)) return;
    const before = natural.slice(0, index).reverse().find((candidate) => result.includes(candidate));
    result.splice(before ? result.indexOf(before) + 1 : 0, 0, column);
  });
  return result;
}

const EMPTY_CELL: TableCellV2 = { kind: "value", value: "" };

/** A cell of the calculation with the format the appraiser gave it. */
function withCellFormat(cell: TableCellV2 | undefined, format: TableCellFormat | undefined): TableCellV2 {
  const written = cell ?? EMPTY_CELL;
  return format ? { ...written, format } : written;
}

/** The rows of the calculation with the appraiser's in their place: each after the row it follows, in the order added. */
function withExtraRows(rows: TableRow[], extras: GeneratedExtraRow[], columnIds: string[]): TableRow[] {
  const result = [...rows];
  const added = new Set<string>();
  for (const extra of extras.slice(0, MAX_EXTRA_ROWS)) {
    const row: TableRow = { id: extra.id, cells: Object.fromEntries(columnIds.map((id) => [id, extra.cells[id] ?? EMPTY_CELL])) };
    let index = extra.after === null ? -1 : result.findIndex((candidate) => candidate.id === extra.after);
    if (extra.last || (extra.after !== null && index === -1)) {
      // After every row of the calculation, or the row it followed is no longer written: it goes last.
      result.push(row);
    } else {
      while (index + 1 < result.length && added.has(result[index + 1].id)) index += 1;
      result.splice(index + 1, 0, row);
    }
    added.add(extra.id);
  }
  return result;
}

/**
 * The zones and header groups of the double headers the appraiser left: each
 * run of columns of a group is its zone; the columns out of any group, one
 * zone per run. A column the calculation writes for the first time joins its
 * own group when the appraiser kept it.
 */
function zonesOfGroups(order: string[], groups: GeneratedHeaderGroup[], source: TableV2, known: Set<string>, title: (id: string, name: string) => string) {
  const groupOf = new Map(groups.flatMap((group) => group.columnIds.map((id) => [id, group.id] as const)));
  const kept = new Set(groups.map((group) => group.id));
  for (const group of source.schema?.headerGroups ?? []) {
    if (!kept.has(group.id)) continue;
    const zone = source.schema?.zones.find((candidate) => candidate.id === group.zoneId);
    for (const id of zone?.columnIds ?? []) if (!known.has(id) && !groupOf.has(id)) groupOf.set(id, group.id);
  }
  const zones: StructuralZone[] = [];
  const headerGroups: HeaderGroup[] = [];
  const placed = new Set<string>();
  let previousKey: string | null = null;
  for (const columnId of order) {
    const groupId = groupOf.get(columnId) ?? "";
    // A group prints its title once: a second run of its columns prints without it.
    const key: string = groupId && placed.has(groupId) && previousKey !== groupId ? `${groupId}~${zones.length}` : groupId;
    if (zones.length && key === previousKey) {
      zones.at(-1)!.columnIds.push(columnId);
      continue;
    }
    const titled = Boolean(groupId) && key === groupId;
    const zoneId = titled ? `zone-${groupId}` : `zone-${zones.length + 1}-${columnId}`;
    zones.push({ id: zoneId, kind: "fixed", columnIds: [columnId] });
    if (titled) {
      placed.add(groupId);
      const group = groups.find((candidate) => candidate.id === groupId)!;
      headerGroups.push({ id: group.id, title: title(group.id, group.title), titleEditable: true, zoneId });
    }
    previousKey = key;
  }
  return { zones, headerGroups };
}

/**
 * The table the calculation wrote with what the appraiser set: headers
 * renamed and grouped, columns hidden (kept, so the editor shows them faded
 * and the dictamen leaves them out), moved and formatted, and his columns and
 * rows in their place. Without anything set, the table as written.
 */
export function applyTableLayout(table: TableContent | TableV2, layout: GeneratedTableLayout): TableContent {
  const source = sourceOf(table);
  if (isEmptyLayout(layout)) return source as unknown as TableContent;
  const labels = layout.labels ?? {};
  const extras = (layout.extraColumns ?? []).slice(0, MAX_EXTRA_COLUMNS);
  const label = (id: string, name: string) => labels[id]?.trim() || name;

  const ordered = orderedColumns(source, extras, layout.order);
  const columnIds = ordered.map((column) => column.id);
  const columns: TableColumn[] = ordered.map((column) => {
    if (isExtra(column)) return { id: column.id, name: column.name.trim() || "Nueva columna", ...(column.format ? { format: column.format } : {}) };
    const format = layout.formats?.[column.id];
    return { ...column, name: label(column.id, column.name), ...(format ? { format } : {}) };
  });
  const sourceRows = source.rows.map((row) => ({
    ...row,
    cells: Object.fromEntries(ordered.map((column): [string, TableCellV2] => [
      column.id,
      isExtra(column)
        ? column.cells?.[row.id] ?? { kind: "value", value: column.values[row.id] ?? "" }
        : withCellFormat(row.cells[column.id], layout.cellFormats?.[cellKey(row.id, column.id)]),
    ])),
  }));
  const rows = withExtraRows(sourceRows, layout.extraRows ?? [], columnIds);

  const schema = source.schema ?? { zones: [] };
  let zones: StructuralZone[];
  let headerGroups: HeaderGroup[] | undefined;
  if (layout.groups || layout.order) {
    // Columns moved or grouped: each run of a group's columns is a zone of its own, so no two zones share an id.
    ({ zones, headerGroups } = zonesOfGroups(columnIds, layout.groups ?? groupsOf(source), source, new Set(layout.order ?? []), label));
  } else {
    // An added column joins the zone (and so the header group) of the column it follows.
    const zoneOf = new Map(schema.zones.flatMap((zone) => zone.columnIds.map((id) => [id, zone.id] as const)));
    for (const column of ordered) {
      if (isExtra(column)) zoneOf.set(column.id, (column.after && zoneOf.get(column.after)) || "");
    }
    zones = schema.zones.length ? groupedZones(columnIds, zoneOf, schema.zones) : [];
    headerGroups = schema.headerGroups?.map((group) => ({ ...group, title: label(group.id, group.title) }));
  }
  const presentation: Record<string, ColumnPresentation> = { ...schema.columnPresentation };
  for (const [id, width] of Object.entries(layout.widths ?? {})) {
    if (width > 0) presentation[id] = { ...presentation[id], width: Math.round(width) };
  }
  const present = new Set(columnIds);
  const hiddenColumns = (layout.hidden ?? []).filter((id) => present.has(id));
  const rowIds = new Set(rows.map((row) => row.id));
  const hiddenRows = (layout.hiddenRows ?? []).filter((id) => rowIds.has(id));
  const summaryBoxes = schema.summaryBoxes ? relabeledBoxes(schema.summaryBoxes, layout.boxLabels ?? {}) : undefined;
  const {
    generated: _previous, widthMode: sourceWidth, decimals: sourceDecimals, hideCaption: sourceHideCaption,
    headerGroups: _sourceGroups, hiddenColumns: _hiddenColumns, hiddenRows: _hiddenRows, columnPresentation: _presentation, ...rest
  } = schema;
  const { schema: _sourceSchema, ...plainSource } = source;
  // "Formato de la tabla": what was chosen wins over the calculation's; the decimals only change how its figures print.
  const widthMode = layout.widthMode ?? sourceWidth;
  const decimals = layout.decimals ?? sourceDecimals;
  // Its title printed or not, room, indent and alignment: what was chosen over the calculation's.
  const hideCaption = layout.hideCaption ?? sourceHideCaption;
  const printLayout = { ...tablePrintLayout({ schema }), ...layoutPrint(layout) };
  return {
    ...source,
    title: layout.title?.trim() || source.title,
    columns,
    rows,
    schema: {
      ...rest,
      ...(widthMode === "content" ? { widthMode } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      ...(hideCaption ? { hideCaption } : {}),
      // Bold, alignment and decimals chosen on a selection of its cells; the figures stay the calculation's.
      ...(layout.cellStyles && Object.keys(layout.cellStyles).length ? { cellStyles: layout.cellStyles } : {}),
      ...printLayout,
      zones,
      ...(headerGroups?.length ? { headerGroups } : {}),
      ...(Object.keys(presentation).length ? { columnPresentation: presentation } : {}),
      ...(hiddenColumns.length ? { hiddenColumns } : {}),
      ...(hiddenRows.length ? { hiddenRows } : {}),
      ...(summaryBoxes ? { summaryBoxes } : {}),
      generated: { source: { ...plainSource, ...(source.schema ? { schema: withoutGenerated(source.schema) } : {}) }, layout },
    },
  } as unknown as TableContent;
}

const withoutGenerated = (schema: NonNullable<TableV2["schema"]>) => {
  const { generated: _generated, ...rest } = schema;
  return rest;
};

/** The zones in the new order of the columns: a zone keeps its id; an added column out of any zone gets one of its own. */
function groupedZones(order: string[], zoneOf: Map<string, string>, zones: StructuralZone[]): StructuralZone[] {
  const byId = new Map(zones.map((zone) => [zone.id, zone]));
  const result: StructuralZone[] = [];
  for (const columnId of order) {
    const zoneId = zoneOf.get(columnId) || `zone-${columnId}`;
    const last = result.at(-1);
    if (last && last.id === zoneId) {
      last.columnIds.push(columnId);
      continue;
    }
    const zone = byId.get(zoneId);
    result.push(zone ? { ...zone, columnIds: [columnId] } : { id: zoneId, kind: "fixed", columnIds: [columnId] });
  }
  return result;
}

/* ── What the appraiser did in the editor, as a layout ─────────────── */

const sameFormat = (a: TableCellFormat | undefined, b: TableCellFormat | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A cell worth keeping: a formula, a format of its own or something written. */
const keptCell = (cell: TableCellV2 | undefined): cell is TableCellV2 =>
  Boolean(cell && (cell.kind === "formula" || cell.format || cell.value.trim() !== ""));

/** The double headers of a table, left to right: each group with the columns under it, as shown. */
function groupsOf(table: TableV2): GeneratedHeaderGroup[] {
  const order = getDisplayColumns(table).map((column) => column.id);
  const groups = (table.schema?.headerGroups ?? []).flatMap((group) => {
    const zone = table.schema?.zones.find((candidate) => candidate.id === group.zoneId);
    const columnIds = (zone?.columnIds ?? []).filter((id) => order.includes(id));
    return columnIds.length ? [{ id: group.id, title: group.title, columnIds }] : [];
  });
  return groups.sort((a, b) => order.indexOf(a.columnIds[0]) - order.indexOf(b.columnIds[0]));
}

const sameStructure = (a: GeneratedHeaderGroup[], b: GeneratedHeaderGroup[]) =>
  JSON.stringify(a.map((group) => [group.id, group.columnIds])) === JSON.stringify(b.map((group) => [group.id, group.columnIds]));

/**
 * What the appraiser set on a table the calculation writes, read from the
 * table as he left it in the editor (`shown`), against the table as the
 * calculation wrote it (`source`). Whatever the editor did (renaming,
 * grouping, hiding, moving, adding columns and rows, formulas in them,
 * formats, widths, "Formato de la tabla") becomes the layout the next
 * calculation applies again. The cells of the calculation are never read from
 * `shown`: whatever was typed or pasted over them is dropped, and a column or
 * a row of the calculation taken out is hidden, not lost.
 */
export function layoutFromTable(source: TableV2, shown: TableV2, previous: GeneratedTableLayout = {}): GeneratedTableLayout {
  const sourceColumns = getDisplayColumns(source);
  const sourceById = new Map(sourceColumns.map((column) => [column.id, column]));
  const sourceRows = new Map(source.rows.map((row) => [row.id, row]));
  const shownColumns = getDisplayColumns(shown);
  const shownIds = new Set(shownColumns.map((column) => column.id));
  const shownRowIds = new Set(shown.rows.map((row) => row.id));
  const layout: GeneratedTableLayout = {};

  if (filled(previous.boxLabels)) layout.boxLabels = previous.boxLabels;
  if (shown.title.trim() && shown.title.trim() !== source.title.trim()) layout.title = shown.title.trim();

  const hidden = [
    ...(shown.schema?.hiddenColumns ?? []).filter((id) => shownIds.has(id)),
    ...sourceColumns.filter((column) => !shownIds.has(column.id)).map((column) => column.id),
  ];
  if (hidden.length) layout.hidden = [...new Set(hidden)];
  const hiddenRows = [
    ...(shown.schema?.hiddenRows ?? []).filter((id) => shownRowIds.has(id)),
    ...source.rows.filter((row) => !shownRowIds.has(row.id)).map((row) => row.id),
  ];
  if (hiddenRows.length) layout.hiddenRows = [...new Set(hiddenRows)];

  const labels: Record<string, string> = {};
  const formats: Record<string, TableCellFormat> = {};
  const widths: Record<string, number> = {};
  for (const column of shownColumns) {
    const written = sourceById.get(column.id);
    const width = columnWidthOf(shown, column.id);
    if (width !== undefined && width !== columnWidthOf(source, column.id)) widths[column.id] = width;
    if (!written) continue;
    if (column.name.trim() && column.name.trim() !== written.name.trim()) labels[column.id] = column.name.trim();
    if (column.format && !sameFormat(column.format, written.format)) formats[column.id] = column.format;
  }

  const order = shownColumns.map((column) => column.id);
  const extraIds = order.filter((id) => !sourceById.has(id));
  const writtenOrder = sourceColumns.filter((column) => shownIds.has(column.id)).map((column) => column.id);
  if (extraIds.length || order.join("|") !== writtenOrder.join("|")) layout.order = order;

  const shownGroups = groupsOf(shown);
  const sourceGroups = groupsOf(source);
  if (!sameStructure(shownGroups, sourceGroups)) {
    layout.groups = shownGroups;
  } else {
    for (const group of shownGroups) {
      const written = sourceGroups.find((candidate) => candidate.id === group.id);
      if (written && group.title.trim() && group.title.trim() !== written.title.trim()) labels[group.id] = group.title.trim();
    }
  }
  if (Object.keys(labels).length) layout.labels = labels;
  if (Object.keys(formats).length) layout.formats = formats;
  if (Object.keys(widths).length) layout.widths = widths;

  const extraColumns: GeneratedExtraColumn[] = extraIds.map((id) => {
    const column = shownColumns.find((candidate) => candidate.id === id)!;
    const index = order.indexOf(id);
    const values: Record<string, string> = {};
    const cells: Record<string, TableCellV2> = {};
    for (const row of shown.rows) {
      if (!sourceRows.has(row.id)) continue;
      const cell = row.cells[id];
      if (!keptCell(cell)) continue;
      if (cell.kind === "value" && !cell.format) values[row.id] = cell.value;
      else cells[row.id] = cell;
    }
    return {
      id,
      name: column.name.trim() || "Nueva columna",
      after: index > 0 ? order[index - 1] : null,
      values,
      ...(Object.keys(cells).length ? { cells } : {}),
      ...(column.format ? { format: column.format } : {}),
    };
  });
  if (extraColumns.length) layout.extraColumns = extraColumns;

  const extraRows: GeneratedExtraRow[] = [];
  let after: string | null = null;
  const lastWritten = shown.rows.findLastIndex((row) => sourceRows.has(row.id));
  shown.rows.forEach((row, index) => {
    if (sourceRows.has(row.id)) {
      after = row.id;
      return;
    }
    const cells: Record<string, TableCellV2> = {};
    for (const id of order) {
      const cell = row.cells[id];
      if (keptCell(cell)) cells[id] = cell;
    }
    extraRows.push({ id: row.id, after, ...(lastWritten !== -1 && index > lastWritten ? { last: true } : {}), cells });
  });
  if (extraRows.length) layout.extraRows = extraRows;

  const cellFormats: Record<string, TableCellFormat> = {};
  for (const row of shown.rows) {
    const written = sourceRows.get(row.id);
    if (!written) continue;
    for (const column of shownColumns) {
      if (!sourceById.has(column.id)) continue;
      const format = row.cells[column.id]?.format;
      if (format && !sameFormat(format, written.cells[column.id]?.format)) cellFormats[cellKey(row.id, column.id)] = format;
    }
  }
  if (Object.keys(cellFormats).length) layout.cellFormats = cellFormats;
  // Bold, italic, underline, alignment and decimals chosen on a selection of cells (video 5.7).
  if (shown.schema?.cellStyles && Object.keys(shown.schema.cellStyles).length) layout.cellStyles = shown.schema.cellStyles;

  // "Formato de la tabla", over what the calculation set.
  const widthOf = (table: TableV2): TableWidthMode => (table.schema?.widthMode === "content" ? "content" : "page");
  if (widthOf(shown) !== widthOf(source)) layout.widthMode = widthOf(shown);
  const decimals = shown.schema?.decimals;
  if (decimals !== undefined && decimals !== source.schema?.decimals) layout.decimals = decimals;
  const captionHidden = shown.schema?.hideCaption === true;
  if (captionHidden !== (source.schema?.hideCaption === true)) layout.hideCaption = captionHidden;
  const print = tablePrintLayout(shown);
  const writtenPrint = tablePrintLayout(source);
  for (const key of Object.keys(print) as Array<keyof TablePrintLayout>) {
    if (print[key] !== undefined && print[key] !== writtenPrint[key]) Object.assign(layout, { [key]: print[key] });
  }
  return layout;
}

/**
 * An edit of the editor (`edit`) on a table the calculation writes: the
 * calculation's cells stay as it wrote them and everything else the edit did
 * becomes the table's layout, so the next calculation keeps it.
 */
export function editGeneratedTable(table: TableContent, edit: (table: TableContent) => TableContent): TableContent {
  const source = sourceOf(table);
  const edited = ensureTableV2(edit(table));
  return applyTableLayout(source, layoutFromTable(source, edited, layoutOf(table)));
}

/** Every table of the blocks, by id in lower case (saved ids come back in lower case). */
function tablesById(blocks: Block[]) {
  const tables = new Map<string, TableContent>();
  for (const block of blocks) {
    for (const table of [...block.tables, ...block.apartados.flatMap((apartado) => apartado.tables)]) tables.set(table.id.toLowerCase(), table);
  }
  return tables;
}

/** Every concept of the blocks the appraiser renamed, by id in lower case. */
function renamedConcepts(blocks: Block[]) {
  const renamed = new Map<string, string>();
  for (const block of blocks) {
    for (const concept of [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]) {
      if (concept.generatedLabel !== undefined && concept.label.trim()) renamed.set(concept.id.toLowerCase(), concept.label);
    }
  }
  return renamed;
}

/** The blank lines the appraiser set before and after each concept of the blocks, by id in lower case. */
function conceptSpacing(blocks: Block[]) {
  const spacing = new Map<string, Pick<Concept, "spacingBefore" | "spacingAfter">>();
  for (const block of blocks) {
    for (const concept of [...block.concepts, ...block.apartados.flatMap((apartado) => apartado.concepts)]) {
      if (concept.spacingBefore || concept.spacingAfter) {
        spacing.set(concept.id.toLowerCase(), { spacingBefore: concept.spacingBefore, spacingAfter: concept.spacingAfter });
      }
    }
  }
  return spacing;
}

/** The concepts printed as labels ("Renglón"), with the style of their row, by concept id in lower case. */
function conceptRowStyles(blocks: Block[]) {
  const styles = new Map<string, ContentRowTagStyle>();
  for (const container of blocks.flatMap((block): Array<Block | Apartado> => [block, ...block.apartados])) {
    if (!container.contentLayout) continue;
    for (const row of resolveContentLayout(container).rows) {
      if (!row.tagStyle) continue;
      for (const column of row.columns) {
        for (const item of column.items) if (item.type === "concept") styles.set(item.id.toLowerCase(), row.tagStyle);
      }
    }
  }
  return styles;
}

/** The container with the rows of the concepts the appraiser printed as labels in that style again. */
function withRowStyles<T extends Block | Apartado>(container: T, styles: Map<string, ContentRowTagStyle>): T {
  if (!styles.size) return container;
  const layout = resolveContentLayout(container);
  const styled = layout.rows.reduce((next, row) => {
    const concept = row.columns.flatMap((column) => column.items).find((item) => item.type === "concept" && styles.has(item.id.toLowerCase()));
    return concept ? setContentRowTagStyle(next, row.id, styles.get(concept.id.toLowerCase())) : next;
  }, layout);
  return styled === layout ? container : { ...container, contentLayout: styled };
}

/**
 * The blocks the calculation just wrote, with what the appraiser set on the
 * blocks they replace: the columns and box labels of the same tables, and the
 * labels, the spacing and the row style ("Renglón") of the same concepts.
 */
export function withTableLayouts(blocks: Block[], previous: Block[]): Block[] {
  const layouts = new Map([...tablesById(previous)].flatMap(([id, table]) => {
    const layout = layoutOf(table);
    return isEmptyLayout(layout) ? [] : [[id, layout] as const];
  }));
  const labels = renamedConcepts(previous);
  const spacing = conceptSpacing(previous);
  const rowStyles = conceptRowStyles(previous);
  if (!layouts.size && !labels.size && !spacing.size && !rowStyles.size) return blocks;
  const apply = (tables: TableContent[]) => tables.map((table) => {
    const layout = layouts.get(table.id.toLowerCase());
    return layout ? applyTableLayout(table, layout) : table;
  });
  const relabel = (concepts: Concept[]) => concepts.map((concept) => {
    const label = labels.get(concept.id.toLowerCase());
    const kept = spacing.get(concept.id.toLowerCase());
    const named = label === undefined ? concept : withConceptLabel(concept, label);
    return kept ? { ...named, ...kept } : named;
  });
  return blocks.map((block) => withRowStyles({
    ...block,
    concepts: relabel(block.concepts),
    tables: apply(block.tables),
    apartados: block.apartados.map((apartado) => withRowStyles({ ...apartado, concepts: relabel(apartado.concepts), tables: apply(apartado.tables) }, rowStyles)),
  }, rowStyles));
}

/**
 * A concept the calculation writes, with the label the appraiser gave it
 * ("Valor por capitalización de rentas" as "Valor por ingresos"): the
 * calculation's own stays in `generatedLabel`, so an empty name gives it back
 * and the next calculation can write it again.
 */
export function withConceptLabel(concept: Concept, name: string): Concept {
  const { generatedLabel, ...rest } = concept;
  const original = generatedLabel ?? concept.label;
  const label = name.trim();
  return !label || label === original ? { ...rest, label: original } : { ...rest, label, generatedLabel: original };
}

/* ── Changes the editor makes ─────────────────────────────────────── */

/** A column of the calculation shown or hidden. */
export function withColumnHidden(layout: GeneratedTableLayout, columnId: string, hidden: boolean): GeneratedTableLayout {
  const current = new Set(layout.hidden ?? []);
  if (hidden) current.add(columnId);
  else current.delete(columnId);
  return { ...layout, hidden: [...current] };
}

/** A header (of a column or a header group) renamed; an empty name gives back the calculation's. */
export function withHeaderLabel(layout: GeneratedTableLayout, id: string, name: string): GeneratedTableLayout {
  const { [id]: _previous, ...labels } = layout.labels ?? {};
  return { ...layout, labels: name.trim() ? { ...labels, [id]: name.trim() } : labels };
}

/** One more column of the appraiser's, after `after` (null: at the end); none past the limit. */
export function withExtraColumn(layout: GeneratedTableLayout, name: string, after: string | null): GeneratedTableLayout {
  const extras = layout.extraColumns ?? [];
  if (extras.length >= MAX_EXTRA_COLUMNS) return layout;
  const used = new Set(extras.map((column) => column.id));
  let index = extras.length + 1;
  while (used.has(`extra-${index}`)) index += 1;
  return { ...layout, extraColumns: [...extras, { id: `extra-${index}`, name: name.trim() || "Nueva columna", after, values: {} }] };
}

/** A column of the appraiser's changed: its name, where it goes or the text of a row. */
export function withExtraColumnChange(
  layout: GeneratedTableLayout,
  columnId: string,
  change: { name?: string; after?: string | null; value?: { rowId: string; text: string } },
): GeneratedTableLayout {
  return {
    ...layout,
    extraColumns: (layout.extraColumns ?? []).map((column) => {
      if (column.id !== columnId) return column;
      const values = { ...column.values };
      if (change.value) {
        if (change.value.text.trim()) values[change.value.rowId] = change.value.text.trim();
        else delete values[change.value.rowId];
      }
      return {
        ...column,
        ...(change.name !== undefined ? { name: change.name.trim() || column.name } : {}),
        ...(change.after !== undefined ? { after: change.after } : {}),
        values,
      };
    }),
  };
}

/** A label of a box renamed (`summaryRowKey` or `summaryCaptionKey`); an empty name gives back the calculation's. */
export function withBoxLabel(layout: GeneratedTableLayout, key: string, name: string): GeneratedTableLayout {
  const { [key]: _previous, ...labels } = layout.boxLabels ?? {};
  return { ...layout, boxLabels: name.trim() ? { ...labels, [key]: name.trim() } : labels };
}

/**
 * "Formato de la tabla" of a table the calculation writes: its width, the
 * decimals its figures print with, whether its title prints, the room before
 * and after it, its indent and alignment. Kept with the rest of the layout, so
 * the next calculation keeps it; `null` gives back the calculation's.
 */
export function withTableFormat(
  layout: GeneratedTableLayout,
  format: { widthMode?: TableWidthMode | null; decimals?: number | null; hideCaption?: boolean | null; print?: TablePrintLayoutPatch },
): GeneratedTableLayout {
  const { spacingBefore: _before, spacingAfter: _after, indent: _indent, align: _align, ...rest } = layout;
  const next: GeneratedTableLayout = { ...rest, ...mergeTablePrintLayout(layoutPrint(layout), format.print ?? {}) };
  if (format.hideCaption !== undefined) {
    if (format.hideCaption === null) delete next.hideCaption;
    else next.hideCaption = format.hideCaption;
  }
  if (format.widthMode !== undefined) {
    if (format.widthMode === null) delete next.widthMode;
    else next.widthMode = format.widthMode;
  }
  if (format.decimals !== undefined) {
    if (format.decimals === null || !Number.isInteger(format.decimals)) delete next.decimals;
    else next.decimals = Math.max(0, Math.min(TABLE_DECIMALS_MAX, format.decimals));
  }
  return next;
}

/** The style of the cells, headers and title chosen on a selection of the table's cells; undefined takes them all out. */
export function withCellStyles(layout: GeneratedTableLayout, cellStyles: GeneratedTableLayout["cellStyles"]): GeneratedTableLayout {
  const { cellStyles: _previous, ...rest } = layout;
  return cellStyles && Object.keys(cellStyles).length ? { ...rest, cellStyles } : rest;
}

/** A column of the appraiser's taken out, with what was written in it. */
export function withoutExtraColumn(layout: GeneratedTableLayout, columnId: string): GeneratedTableLayout {
  return { ...layout, extraColumns: (layout.extraColumns ?? []).filter((column) => column.id !== columnId) };
}
