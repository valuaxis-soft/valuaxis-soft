import { useMemo } from "react";
import {
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { TableContent } from "@/features/valuations/model";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TABLE_TITLE,
  ensureTableV2,
  getTableHeaderLayout,
  type TableColumn,
  type TableNote,
  type TableResultGroup,
  type TableSummaryBox,
  type TableV2,
} from "../services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "../services/table-formula-engine";
import { TABLE_HEADER_BAND } from "./document-theme";

const EMPTY_VALUE = "No se proporcionó";

export function DocumentTable({
  table,
  variant = "document",
}: {
  table: TableContent;
  variant?: "document" | "report" | "compact";
}) {
  if (variant === "report") return <ReportDocumentTable table={table} />;
  if (variant === "compact") return <CompactDocumentTable table={table} />;
  return <DefaultDocumentTable table={table} />;
}

/* ================================================================== */
/*  Schema-aware header rendering (uses shared helper)                  */
/* ================================================================== */

function renderSchemaHeader(tableV2: TableV2, columns: TableColumn[]) {
  const layout = getTableHeaderLayout(tableV2);
  const columnMap = new Map(columns.map((c) => [c.id, c]));
  const cell = "border-r border-white px-1.5 py-1 text-center align-middle text-wrap font-bold break-words last:border-r-0";

  if (!layout.hasGroups) {
    return (
      <thead className={TABLE_HEADER_BAND}>
        <tr>
          {columns.map((column) => (
            <th className={cell} key={column.id}>
              {column.name.trim() || EMPTY_VALUE}
            </th>
          ))}
        </tr>
      </thead>
    );
  }

  return (
    <thead className={TABLE_HEADER_BAND}>
      <tr>
        {layout.topRow.map((item) => {
          if (item.kind === "column") {
            const column = columnMap.get(item.columnId);
            return (
              <th rowSpan={item.rowSpan} className={cell} key={item.columnId}>
                {column?.name.trim() || EMPTY_VALUE}
              </th>
            );
          }
          return (
            <th colSpan={item.colSpan} className={cn(cell, "border-b")} key={item.group.id}>
              {item.group.title}
            </th>
          );
        })}
      </tr>
      {layout.bottomRow && (
        <tr>
          {layout.bottomRow.map((colId) => {
            const column = columnMap.get(colId);
            return (
              <th className="border-r border-white px-1.5 py-0.5 text-center text-wrap text-[0.9em] font-semibold break-words" key={colId}>
                {column?.name.trim() || EMPTY_VALUE}
              </th>
            );
          })}
        </tr>
      )}
    </thead>
  );
}

/* ================================================================== */
/*  Summary boxes                                                      */
/* ================================================================== */

const ALIGN_ORDER = { start: 0, center: 1, end: 2 } as const;
const LONG_LABEL = 60;
const BOX_ALIGN = { start: "mr-auto", center: "mx-auto", end: "ml-auto" } as const;

/** Boxes of one position, grouped in lines: a box joins the line while it sits further right than the one before. */
function summaryLines(boxes: TableSummaryBox[], position: TableSummaryBox["position"]) {
  const lines: TableSummaryBox[][] = [];
  for (const box of boxes) {
    if (box.position !== position || !box.rows.length) continue;
    const line = lines.at(-1);
    const previous = line?.at(-1);
    if (line && previous && ALIGN_ORDER[box.align ?? "start"] > ALIGN_ORDER[previous.align ?? "start"]) line.push(box);
    else lines.push([box]);
  }
  return lines;
}

/**
 * The boxes a table carries above or below it. They belong to the table's own
 * item of the page flow, so the subtotals and the final value never part from it.
 */
function SummaryBoxes({ tableV2, position }: { tableV2: TableV2; position: TableSummaryBox["position"] }) {
  const lines = summaryLines(tableV2.schema?.summaryBoxes ?? [], position);
  if (!lines.length) return null;

  return (
    <div className={cn("flex flex-col gap-1.5 text-[10px] leading-snug text-slate-900", position === "top" ? "mb-1.5" : "mt-1.5")} data-table-summary={position}>
      {lines.map((line) => (
        <div className="flex items-start gap-3" key={line[0].id}>
          {line.map((box) => {
            const marked = box.rows.some((row) => row.mark !== undefined);
            return (
              <div className={cn("flex min-w-0 items-start gap-2", BOX_ALIGN[box.align ?? "start"])} key={box.id}>
                {box.caption ? <span className="py-px font-bold">{box.caption}</span> : null}
                <table className="border-collapse border border-[var(--caratula-dark-blue)]">
                  <tbody>
                    {box.rows.map((row, index) => (
                      <tr
                        className={cn(
                          "[-webkit-print-color-adjust:exact] [print-color-adjust:exact]",
                          row.emphasis === "total" && "bg-[var(--caratula-dark-blue)] font-bold text-white",
                          row.emphasis === "strong" && "bg-slate-200 font-bold",
                          marked && "border-b border-[var(--caratula-dark-blue)] last:border-b-0",
                        )}
                        key={index}
                      >
                        {marked ? (
                          <td className="w-6 border-r border-[var(--caratula-dark-blue)] px-1 py-px text-center font-bold">{row.mark ? "x" : ""}</td>
                        ) : null}
                        {/* Short labels stay on one line when boxes share a line; a sentence-long one wraps. */}
                        <th
                          className={cn("px-2 py-px text-right", row.emphasis ? "font-bold" : "font-semibold", row.label.length > LONG_LABEL ? "text-wrap" : "whitespace-nowrap")}
                          scope="row"
                        >
                          {row.label}
                        </th>
                        <td className="min-w-[96px] px-2 py-px text-right whitespace-nowrap tabular-nums">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The notes a table carries above or below it, in the same item of the page flow. */
function TableNotes({ tableV2, position }: { tableV2: TableV2; position: TableNote["position"] }) {
  const notes = (tableV2.schema?.notes ?? []).filter((note) => note.position === position && note.text.trim());
  if (!notes.length) return null;
  return (
    <div className={cn("text-[10px] leading-snug text-slate-900", position === "top" ? "mb-1.5" : "mt-1.5")} data-table-notes={position}>
      {notes.map((note, index) => (
        <p className="text-justify" key={index}>
          {note.label ? <strong>{note.label} </strong> : null}
          {note.text}
        </p>
      ))}
    </div>
  );
}

const CELL_ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Alignment and wrapping the schema gives the cells of a column. */
function cellPresentation(tableV2: TableV2, columnId: string) {
  const presentation = tableV2.schema?.columnPresentation?.[columnId];
  return cn(
    presentation?.align && CELL_ALIGN[presentation.align],
    presentation?.noWrap ? "whitespace-nowrap tabular-nums" : "whitespace-normal text-wrap break-words",
  );
}

/* ================================================================== */
/*  Result group rendering                                             */
/* ================================================================== */

function ResultGroups({ groups, tableV2, formulaResults }: { groups: TableResultGroup[]; tableV2: TableV2; formulaResults: Map<string, { ok: boolean; value?: number }> }) {
  if (!groups.length) return null;

  const byAlign = {
    start: groups.filter((g) => g.align === "start" || !g.align),
    center: groups.filter((g) => g.align === "center"),
    end: groups.filter((g) => g.align === "end"),
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="flex items-start justify-between gap-4 text-[10px]">
        <div className="flex flex-col gap-1">
          {byAlign.start.map((group) =>
            group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="font-medium text-slate-600">{item.label}</span>
                {item.formula ? (
                  <span className="font-mono text-blue-600">
                    {renderResultValue(item, tableV2, formulaResults)}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">{EMPTY_VALUE}</span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1 text-center">
          {byAlign.center.map((group) =>
            group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="font-medium text-slate-600">{item.label}</span>
                {item.formula ? (
                  <span className="font-mono text-blue-600">
                    {renderResultValue(item, tableV2, formulaResults)}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">{EMPTY_VALUE}</span>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-1 text-right">
          {byAlign.end.map((group) =>
            group.items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="font-medium text-slate-600">{item.label}</span>
                {item.formula ? (
                  <span className="font-mono text-blue-600">
                    {renderResultValue(item, tableV2, formulaResults)}
                  </span>
                ) : (
                  <span className="text-slate-400 italic">{EMPTY_VALUE}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function renderResultValue(
  item: { id: string; formula?: { expression: { type: string; name?: string; args?: unknown[] } } },
  tableV2: TableV2,
  formulaResults: Map<string, { ok: boolean; value?: number }>,
): string {
  if (!item.formula) return "";
  const key = `result:${item.id}`;
  const result = formulaResults.get(key);
  if (!result) return "#PENDING";
  if (!result.ok) return "#ERROR";
  return String(result.value ?? "");
}

/* ================================================================== */
/*  DefaultDocumentTable                                               */
/* ================================================================== */

function DefaultDocumentTable({ table }: { table: TableContent }) {
  const tableV2 = ensureTableV2(table);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);
  const columns = tableV2.columns.length ? tableV2.columns : [{ id: "__empty", name: "" }];

  return (
    <figure>
      <figcaption className="mb-1 text-[10px] font-bold uppercase text-[var(--caratula-blue)]">
        {tableV2.title.trim() || EMPTY_VALUE}
      </figcaption>
      <SummaryBoxes tableV2={tableV2} position="top" />
      <div className="overflow-hidden border border-[var(--caratula-blue)]">
        <table className="w-full border-collapse table-fixed text-left text-[9px] leading-tight">
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} />
            ))}
          </colgroup>
          {renderSchemaHeader(tableV2, columns)}
          <tbody>
            {tableV2.rows.length ? tableV2.rows.map((row) => (
              <tr className="border-t border-slate-300 odd:bg-slate-50" key={row.id}>
                {columns.map((column) => {
                  const displayValue = getCellDisplayValue(tableV2, row.id, column.id, formulaResults);
                  return (
                    <td className="border-r border-slate-300 px-1.5 py-1 align-top text-wrap break-words last:border-r-0" key={column.id}>
                      {displayValue || EMPTY_VALUE}
                    </td>
                  );
                })}
              </tr>
            )) : (
              <tr>
                <td className="px-1.5 py-1 italic text-slate-400" colSpan={columns.length}>{EMPTY_VALUE}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {tableV2.schema?.resultGroups && (
        <ResultGroups groups={tableV2.schema.resultGroups} tableV2={tableV2} formulaResults={formulaResults} />
      )}
      <SummaryBoxes tableV2={tableV2} position="bottom" />
    </figure>
  );
}

function ReportDocumentTable({ table }: { table: TableContent }) {
  const tableV2 = ensureTableV2(table);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);
  // A table still named as the editor created it, or one whose schema hides its title, prints no caption.
  const title = tableV2.title.trim();
  const caption = tableV2.schema?.hideCaption || title === DEFAULT_TABLE_TITLE ? "" : title;
  const density = tableV2.schema?.density;

  return (
    <div className="w-full overflow-hidden">
      <TableNotes tableV2={tableV2} position="top" />
      <SummaryBoxes tableV2={tableV2} position="top" />
      {/* Column widths follow the content so amounts stay on one line; wider
          tables (homologation, costs) use a smaller font to fit the page, and
          the rest print at the size of the concepts around them. */}
      <table className={cn(
        "w-full border-collapse",
        density === "compact" ? "text-[9px] leading-[1.35]"
          : density === "dense" ? "text-[10px] leading-[1.35]"
            : tableV2.columns.length > 7 ? "text-[10px]" : "text-[11px]",
      )}>
        <colgroup>
          {tableV2.columns.map((column) => (
            <col key={column.id} />
          ))}
        </colgroup>
        {caption ? <TableCaption className="mt-0 mb-1 text-[11px]">{caption}</TableCaption> : null}
        {renderSchemaHeader(tableV2, tableV2.columns)}
        <TableBody>
          {tableV2.rows.map((row) => (
            // Gray and white rows alternate, first one gray, as in the appraiser's own format.
            <TableRow className="border-slate-200 odd:bg-slate-100" key={row.id}>
              {tableV2.columns.map((column) => (
                <TableCell className={cn("px-2", density ? "py-[3px]" : "py-1", cellPresentation(tableV2, column.id))} key={column.id}>{getCellDisplayValue(tableV2, row.id, column.id, formulaResults)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
      {tableV2.schema?.resultGroups && (
        <ResultGroups groups={tableV2.schema.resultGroups} tableV2={tableV2} formulaResults={formulaResults} />
      )}
      <SummaryBoxes tableV2={tableV2} position="bottom" />
      <TableNotes tableV2={tableV2} position="bottom" />
    </div>
  );
}

function CompactDocumentTable({ table }: { table: TableContent }) {
  const tableV2 = ensureTableV2(table);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);

  return (
    <table className="w-full border-collapse table-fixed text-[8.5px]">
      <colgroup>
        {tableV2.columns.map((column) => (
          <col key={column.id} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {tableV2.columns.map((column) => (
            <th className="border border-slate-300 px-1 py-0.5 text-left text-wrap font-bold break-words" key={column.id}>{column.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableV2.rows.map((row) => (
          <tr key={row.id}>
            {tableV2.columns.map((column) => (
              <td className="overflow-hidden break-words border border-slate-300 px-1 py-0.5" key={column.id}>
                {getCellDisplayValue(tableV2, row.id, column.id, formulaResults)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
