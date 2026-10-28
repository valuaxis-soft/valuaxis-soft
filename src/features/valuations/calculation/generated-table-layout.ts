/**
 * The columns of a table the calculation writes, as the appraiser sets them:
 * columns hidden, headers renamed and columns added with text of its own that
 * does not enter the calculation. The calculation keeps writing the table
 * (its figures are never typed here); what the appraiser set is applied over
 * it every time, and the table keeps what the calculation wrote, so a column
 * hidden today can be shown again.
 */
import type { Block, TableContent } from "../model";
import {
  ensureTableV2,
  getDisplayColumns,
  type GeneratedExtraColumn,
  type GeneratedTableLayout,
  type HeaderGroup,
  type StructuralZone,
  type TableColumn,
  type TableV2,
} from "../services/table";

/** Columns the appraiser may add to one table. */
export const MAX_EXTRA_COLUMNS = 4;

/** The table as the calculation wrote it, before the appraiser's columns. */
export function sourceOf(table: TableContent | TableV2): TableV2 {
  const normalized = ensureTableV2(table);
  return normalized.schema?.generated?.source ?? normalized;
}

/** What the appraiser set on the table; empty when nothing. */
export function layoutOf(table: TableContent | TableV2): GeneratedTableLayout {
  return ensureTableV2(table).schema?.generated?.layout ?? {};
}

const isEmptyLayout = (layout: GeneratedTableLayout) =>
  !layout.hidden?.length && !Object.values(layout.labels ?? {}).some((label) => label.trim()) && !layout.extraColumns?.length;

/** The columns of the calculation, in order, with the ones added after the column each follows. */
function orderedColumns(source: TableV2, extras: GeneratedExtraColumn[]): (TableColumn | GeneratedExtraColumn)[] {
  const columns: (TableColumn | GeneratedExtraColumn)[] = getDisplayColumns(source);
  const known = new Set(columns.map((column) => column.id));
  // In the order they were added: each one after the column it follows (or the last one added after it).
  for (const extra of extras) {
    if (extra.after === null || !known.has(extra.after)) {
      columns.push(extra);
    } else {
      let index = columns.findIndex((column) => column.id === extra.after);
      while (index + 1 < columns.length && "values" in columns[index + 1] && (columns[index + 1] as GeneratedExtraColumn).after === extra.after) index += 1;
      columns.splice(index + 1, 0, extra);
    }
    known.add(extra.id);
  }
  return columns;
}

/**
 * The table the calculation wrote with what the appraiser set: hidden columns
 * out, headers renamed and added columns in their place, under the header
 * group of the column they follow. Without anything set, the table as written.
 */
export function applyTableLayout(table: TableContent | TableV2, layout: GeneratedTableLayout): TableContent {
  const source = sourceOf(table);
  if (isEmptyLayout(layout)) return source as unknown as TableContent;
  const hidden = new Set(layout.hidden ?? []);
  const labels = layout.labels ?? {};
  const extras = (layout.extraColumns ?? []).slice(0, MAX_EXTRA_COLUMNS);
  const label = (id: string, name: string) => labels[id]?.trim() || name;

  const ordered = orderedColumns(source, extras).filter((column) => !hidden.has(column.id));
  const columns: TableColumn[] = ordered.map((column) => ("values" in column
    ? { id: column.id, name: column.name.trim() || "Nueva columna" }
    : { ...column, name: label(column.id, column.name) }));
  const rows = source.rows.map((row) => ({
    ...row,
    cells: Object.fromEntries(ordered.map((column) => [
      column.id,
      "values" in column ? { kind: "value" as const, value: column.values[row.id] ?? "" } : row.cells[column.id] ?? { kind: "value" as const, value: "" },
    ])),
  }));

  const schema = source.schema ?? { zones: [] };
  // An added column joins the zone (and so the header group) of the column it follows.
  const zoneOf = new Map(schema.zones.flatMap((zone) => zone.columnIds.map((id) => [id, zone.id] as const)));
  for (const column of ordered) {
    if ("values" in column) zoneOf.set(column.id, (column.after && zoneOf.get(column.after)) || "");
  }
  const zones: StructuralZone[] = schema.zones.length
    ? groupedZones(ordered.map((column) => column.id), zoneOf, schema.zones)
    : [];
  const headerGroups: HeaderGroup[] | undefined = schema.headerGroups?.map((group) => ({ ...group, title: label(group.id, group.title) }));
  const { generated: _previous, ...rest } = schema;
  const { schema: _sourceSchema, ...plainSource } = source;
  return {
    ...source,
    columns,
    rows,
    schema: {
      ...rest,
      zones,
      ...(headerGroups ? { headerGroups } : {}),
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

/** Every table of the blocks, by id in lower case (saved ids come back in lower case). */
function tablesById(blocks: Block[]) {
  const tables = new Map<string, TableContent>();
  for (const block of blocks) {
    for (const table of [...block.tables, ...block.apartados.flatMap((apartado) => apartado.tables)]) tables.set(table.id.toLowerCase(), table);
  }
  return tables;
}

/**
 * The blocks the calculation just wrote, with the columns the appraiser set
 * on the same tables of the blocks they replace.
 */
export function withTableLayouts(blocks: Block[], previous: Block[]): Block[] {
  const layouts = new Map([...tablesById(previous)].flatMap(([id, table]) => {
    const layout = layoutOf(table);
    return isEmptyLayout(layout) ? [] : [[id, layout] as const];
  }));
  if (!layouts.size) return blocks;
  const apply = (tables: TableContent[]) => tables.map((table) => {
    const layout = layouts.get(table.id.toLowerCase());
    return layout ? applyTableLayout(table, layout) : table;
  });
  return blocks.map((block) => ({
    ...block,
    tables: apply(block.tables),
    apartados: block.apartados.map((apartado) => ({ ...apartado, tables: apply(apartado.tables) })),
  }));
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

/** A column of the appraiser's taken out, with what was written in it. */
export function withoutExtraColumn(layout: GeneratedTableLayout, columnId: string): GeneratedTableLayout {
  return { ...layout, extraColumns: (layout.extraColumns ?? []).filter((column) => column.id !== columnId) };
}
