"use client";

import type { ReactNode } from "react";

import type { Concept, Apartado, TableContent } from "../model";
import { findBoundaryTable, getTerrenoElementKind } from "../sections/terreno";
import { resolveContentLayout } from "../services/content-layout";
import { formatNumericValue } from "@/features/valuations/services/concept-value-format";
import { ensureTableV2 } from "../services/table";
import type { ApartadoHead } from "./document-block-renderer";
import { TABLE_HEADER_BAND } from "./document-theme";

const EMPTY_VALUE = "No se proporcionó";

/* ------------------------------------------------------------------ */
/*  terrenoApartadoHead — the fixed format of "Medidas y colindancias" */
/* ------------------------------------------------------------------ */

/**
 * "Medidas y colindancias" prints its table of measures and the source of the
 * boundaries in a format of its own; whatever else the appraiser added to the
 * Apartado follows as its remaining content rows. Other Apartados print as usual.
 */
export function terrenoApartadoHead(element: Apartado, displayLabel: string): ApartadoHead | null {
  if (getTerrenoElementKind(element) !== "boundaries") return null;
  const table = findBoundaryTable(element);
  const source = element.concepts[0];
  const printed = new Set([table ? `table:${table.id}` : "", source ? `concept:${source.id}` : ""]);
  const rows = resolveContentLayout(element).rows
    .map((row) => ({
      ...row,
      columns: row.columns
        .map((column) => ({ ...column, items: column.items.filter((item) => !printed.has(`${item.type}:${item.id}`)) }))
        .filter((column) => column.items.length > 0),
    }))
    .filter((row) => row.columns.length > 0);

  return {
    node: <BoundariesPreview label={displayLabel} title={element.title} table={table} source={source?.value} />,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/*  Terrain-specific presentational components                         */
/* ------------------------------------------------------------------ */

function ElementTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b-2 border-[var(--caratula-blue)] pb-0.5 text-[10.5px] font-black uppercase leading-tight text-[var(--caratula-blue)]">
      {children}
    </h2>
  );
}

function BoundariesPreview({ label, title, table, source }: {
  label: string;
  title: string;
  table: TableContent | undefined;
  source: string | undefined;
}) {
  return (
    <section>
      <ElementTitle>{[label, title].filter(Boolean).join(" ")}</ElementTitle>
      {table ? <BoundaryTable table={table} /> : null}
      <p className="mt-1.5 text-[9.5px] leading-tight text-slate-700">
        <strong>Linderos y colindancias según:</strong> {source || "Escrituras públicas..."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function BoundaryTable({ table }: { table: TableContent }) {
  const t2 = ensureTableV2(table);
  const displayColumns = t2.columns;

  return (
    <table className="mt-1.5 w-full table-fixed border-collapse text-[9px] leading-tight">
      <thead className={TABLE_HEADER_BAND}>
        <tr>
          {displayColumns.map((column, index) => (
            <th className={`border border-slate-400 px-2 py-1 text-left font-bold ${index === 0 ? "w-[24%]" : index === 1 ? "w-[18%]" : ""}`} key={`${table.id}-column-${column.id}`}>
              {column.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t2.rows.map((row, rowIndex) => (
          <tr className="odd:bg-slate-50" key={`${table.id}-row-${row.id}`}>
            {displayColumns.map((column, cellIndex) => {
              const cell = row.cells[column.id];
              const value = cell?.kind === "value" ? cell.value : "";
              return (
                <td className="border border-slate-300 px-2 py-1 align-top" key={`${table.id}-cell-${row.id}-${column.id}`}>
                  {cellIndex === 1
                    ? formatDistance(value, table.boundaryDistanceFormats?.[rowIndex])
                    : value || EMPTY_VALUE}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function formatDistance(
  value: string | undefined,
  format: Pick<Concept, "valueFormat" | "customUnit"> = { valueFormat: "m" },
) {
  const distance = value?.trim();
  return distance ? formatNumericValue(distance, format) : EMPTY_VALUE;
}
