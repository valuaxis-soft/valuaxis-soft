import { useMemo } from "react";
import {
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import type { TableContent } from "@/features/valuations/model";
import { cn } from "@/lib/utils";
import { ensureTableV2, type TableV2, type TableResultGroup, type TableColumn, getTableHeaderLayout } from "../services/table";
import { evaluateTableFormulas, getCellDisplayValue } from "../services/table-formula-engine";

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

  if (!layout.hasGroups) {
    return (
      <thead className="bg-[var(--caratula-dark-blue)] text-white">
        <tr>
          {columns.map((column) => (
            <th className="border-r border-white/30 px-1.5 py-1 text-wrap font-bold break-words last:border-r-0" key={column.id}>
              {column.name.trim() || EMPTY_VALUE}
            </th>
          ))}
        </tr>
      </thead>
    );
  }

  return (
    <thead className="bg-[var(--caratula-dark-blue)] text-white">
      <tr>
        {layout.topRow.map((cell) => {
          if (cell.kind === "column") {
            const column = columnMap.get(cell.columnId);
            return (
              <th rowSpan={cell.rowSpan} className="border-r border-white/30 px-1.5 py-1 text-wrap font-bold break-words last:border-r-0" key={cell.columnId}>
                {column?.name.trim() || EMPTY_VALUE}
              </th>
            );
          }
          return (
            <th colSpan={cell.colSpan} className="border-r border-white/30 px-1.5 py-1 text-center text-wrap font-bold last:border-r-0" key={cell.group.id}>
              {cell.group.title}
            </th>
          );
        })}
      </tr>
      {layout.bottomRow && (
        <tr>
          {layout.bottomRow.map((colId) => {
            const column = columnMap.get(colId);
            return (
              <th className="border-r border-white/30 px-1.5 py-0.5 text-wrap text-[8px] font-semibold break-words last:border-r-0" key={colId}>
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
    </figure>
  );
}

function ReportDocumentTable({ table }: { table: TableContent }) {
  const tableV2 = ensureTableV2(table);
  const formulaResults = useMemo(() => evaluateTableFormulas(tableV2), [tableV2]);

  return (
    <div className="w-full overflow-hidden">
      {/* Column widths follow the content so amounts stay on one line; wider
          tables (homologation, costs) use a smaller font to fit the page. */}
      <table className={cn(
        "w-full border-collapse",
        tableV2.columns.length > 7 ? "text-[10px]" : tableV2.columns.length > 5 ? "text-xs" : "text-sm",
      )}>
        <colgroup>
          {tableV2.columns.map((column) => (
            <col key={column.id} />
          ))}
        </colgroup>
        <TableCaption>{tableV2.title}</TableCaption>
        {renderSchemaHeader(tableV2, tableV2.columns)}
        <TableBody>
          {tableV2.rows.map((row) => (
            <TableRow key={row.id}>
              {tableV2.columns.map((column) => (
                <TableCell className="whitespace-normal text-wrap break-words" key={column.id}>{getCellDisplayValue(tableV2, row.id, column.id, formulaResults)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
      {tableV2.schema?.resultGroups && (
        <ResultGroups groups={tableV2.schema.resultGroups} tableV2={tableV2} formulaResults={formulaResults} />
      )}
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
