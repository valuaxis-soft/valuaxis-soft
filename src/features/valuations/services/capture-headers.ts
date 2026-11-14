/**
 * The headers of the capture tables of the calculation panels (Costos,
 * Ingresos) as the appraiser sets them (video 5.3): each header renamed, and
 * double headers combined over the columns he chooses, as in a configurable
 * table. Only how the panel shows them: what is captured, its columns and the
 * calculation do not change. Saved with the section (`captureHeaders`), by
 * table and column key.
 *
 * Pure TypeScript — no React, no side effects.
 */

/** A column of a capture table: its key, the header the panel gives it and the group it starts under. */
export type CaptureColumn = { key: string; label: string; group?: string; fixed?: boolean };

/** A double header: one title over consecutive columns. */
export type CaptureHeaderGroup = { id: string; title: string; columns: string[] };

/** What the appraiser set on the headers of one capture table. */
export type CaptureHeaders = {
  /** Headers renamed, by column key or group id. */
  labels?: Record<string, string>;
  /** The double headers as he left them; absent, the panel's own. */
  groups?: CaptureHeaderGroup[];
};

/** The headers of every capture table of a section, by table key. */
export type SectionCaptureHeaders = Record<string, CaptureHeaders>;

export type CaptureHeaderCell =
  | { kind: "column"; key: string; label: string; defaultLabel: string; rowSpan: 1 | 2; fixed: boolean }
  | { kind: "group"; id: string; title: string; defaultTitle: string; colSpan: number; columns: string[] };

/** How the header prints in the panel: the top row and, under the groups, their columns. */
export type CaptureHeaderLayout = { top: CaptureHeaderCell[]; bottom: Extract<CaptureHeaderCell, { kind: "column" }>[] };

const MAX_LABEL = 80;
/** The id of a double header of the panel, from its title: «Factores de Homologación» is «panel-factores-de-homologacion». */
const defaultGroupId = (title: string) =>
  `panel-${title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}`;

/** The panel's own double headers: each run of columns with the same group. */
function defaultGroups(columns: CaptureColumn[]): CaptureHeaderGroup[] {
  const groups: CaptureHeaderGroup[] = [];
  columns.forEach((column, index) => {
    if (!column.group) return;
    const last = groups.at(-1);
    if (last && columns[index - 1]?.group === column.group) last.columns.push(column.key);
    else groups.push({ id: defaultGroupId(column.group), title: column.group, columns: [column.key] });
  });
  return groups;
}

/** The header layout of a capture table with what the appraiser set. */
export function captureHeaderLayout(columns: CaptureColumn[], headers: CaptureHeaders | undefined): CaptureHeaderLayout {
  const labels = headers?.labels ?? {};
  const groups = headers?.groups ?? defaultGroups(columns);
  const panelTitles = new Map(defaultGroups(columns).map((group) => [group.id, group.title]));
  const groupOf = new Map(groups.flatMap((group) => group.columns.map((key) => [key, group] as const)));
  const anyGroup = columns.some((column) => groupOf.has(column.key));
  const cell = (column: CaptureColumn, rowSpan: 1 | 2) => ({
    kind: "column" as const,
    key: column.key,
    label: (!column.fixed && labels[column.key]?.trim()) || column.label,
    defaultLabel: column.label,
    rowSpan,
    fixed: Boolean(column.fixed),
  });
  const top: CaptureHeaderCell[] = [];
  const bottom: CaptureHeaderLayout["bottom"] = [];
  const printed = new Set<string>();
  let open: string | null = null;
  columns.forEach((column, index) => {
    const group = groupOf.get(column.key);
    if (group && open === group.id) {
      bottom.push(cell(column, 1));
      return;
    }
    // A group prints over its consecutive columns, once.
    if (!group || printed.has(group.id)) {
      open = null;
      top.push(cell(column, anyGroup ? 2 : 1));
      return;
    }
    printed.add(group.id);
    open = group.id;
    let span = 0;
    while (index + span < columns.length && groupOf.get(columns[index + span].key) === group) span += 1;
    const defaultTitle = panelTitles.get(group.id) ?? group.title;
    top.push({ kind: "group", id: group.id, title: labels[group.id]?.trim() || group.title, defaultTitle, colSpan: span, columns: columns.slice(index, index + span).map((item) => item.key) });
    bottom.push(cell(column, 1));
  });
  return { top, bottom };
}

/** A header renamed; empty, the panel's name again. */
export function withCaptureLabel(headers: CaptureHeaders | undefined, key: string, name: string): CaptureHeaders {
  const { [key]: _previous, ...labels } = headers?.labels ?? {};
  const text = name.trim().slice(0, MAX_LABEL);
  return { ...headers, labels: text ? { ...labels, [key]: text } : labels };
}

/**
 * A double header over the columns from `fromKey` to `toKey`, as combining
 * the cells above them; the columns leave the groups they were in, and a
 * group left empty is dropped. Fixed columns (#, actions) are never grouped.
 */
export function withCaptureGroup(headers: CaptureHeaders | undefined, columns: CaptureColumn[], fromKey: string, toKey: string, title: string): CaptureHeaders {
  let from = columns.findIndex((column) => column.key === fromKey);
  let to = columns.findIndex((column) => column.key === toKey);
  if (from === -1 || to === -1) return headers ?? {};
  if (from > to) [from, to] = [to, from];
  const chosen = columns.slice(from, to + 1).filter((column) => !column.fixed).map((column) => column.key);
  if (!chosen.length) return headers ?? {};
  const taken = new Set(chosen);
  const current = headers?.groups ?? defaultGroups(columns);
  const kept = current.map((group) => ({ ...group, columns: group.columns.filter((key) => !taken.has(key)) })).filter((group) => group.columns.length);
  const used = new Set(kept.map((group) => group.id));
  let index = 1;
  while (used.has(`grupo-${index}`)) index += 1;
  const group = { id: `grupo-${index}`, title: title.trim().slice(0, MAX_LABEL) || "Grupo", columns: chosen };
  const order = new Map(columns.map((column, position) => [column.key, position]));
  const groups = [...kept, group].sort((a, b) => (order.get(a.columns[0]) ?? 0) - (order.get(b.columns[0]) ?? 0));
  return { ...headers, groups };
}

/** The columns of a double header back to their own headers, in one row. */
export function withoutCaptureGroup(headers: CaptureHeaders | undefined, columns: CaptureColumn[], groupId: string): CaptureHeaders {
  const current = headers?.groups ?? defaultGroups(columns);
  const { [groupId]: _title, ...labels } = headers?.labels ?? {};
  return { ...headers, labels, groups: current.filter((group) => group.id !== groupId) };
}

/** The headers of a table as the panel gives them. */
export const isDefaultCaptureHeaders = (headers: CaptureHeaders | undefined) =>
  !headers || (!Object.keys(headers.labels ?? {}).length && headers.groups === undefined);

/** One table's headers within the section's; the table's entry goes when nothing is set. */
export function withTableHeaders(all: SectionCaptureHeaders | undefined, table: string, headers: CaptureHeaders): SectionCaptureHeaders {
  const { [table]: _previous, ...rest } = all ?? {};
  return isDefaultCaptureHeaders(headers) ? rest : { ...rest, [table]: headers };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_LABEL) : null);
const KEY = /^[\w.:-]{1,60}$/;

/** The headers as stored in the section's configuration, whatever is there. */
export function readCaptureHeaders(stored: unknown): SectionCaptureHeaders | undefined {
  if (!isRecord(stored)) return undefined;
  const result: SectionCaptureHeaders = {};
  for (const [table, value] of Object.entries(stored).slice(0, 30)) {
    if (!KEY.test(table) || !isRecord(value)) continue;
    const labels = isRecord(value.labels)
      ? Object.fromEntries(Object.entries(value.labels).slice(0, 60).flatMap(([key, label]) => (KEY.test(key) && text(label) ? [[key, text(label)!]] : [])))
      : {};
    const groups = Array.isArray(value.groups)
      ? value.groups.slice(0, 30).flatMap((group) => {
          if (!isRecord(group) || typeof group.id !== "string" || !KEY.test(group.id) || !Array.isArray(group.columns)) return [];
          const columns = group.columns.filter((key): key is string => typeof key === "string" && KEY.test(key)).slice(0, 60);
          return columns.length ? [{ id: group.id, title: text(group.title) ?? "Grupo", columns }] : [];
        })
      : undefined;
    const headers: CaptureHeaders = { ...(Object.keys(labels).length ? { labels } : {}), ...(groups ? { groups } : {}) };
    if (!isDefaultCaptureHeaders(headers)) result[table] = headers;
  }
  return Object.keys(result).length ? result : undefined;
}
