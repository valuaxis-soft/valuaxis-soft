"use client";

import type { ReactNode } from "react";

import type { Concept, Apartado, TableContent } from "../model";
import { findBoundaryDistanceColumnId, findBoundarySource, findBoundaryTable, getTerrenoElementKind } from "../sections/terreno";
import { resolveContentLayout } from "../services/content-layout";
import { formatNumericValue } from "@/features/valuations/services/concept-value-format";
import { type NumberPresentation } from "@/features/valuations/services/number-presentation";
import { useNumberPresentation } from "./number-presentation-context";
import { ensureTableV2, type TableCellV2, type TableV2 } from "../services/table";
import type { ApartadoHead } from "./document-block-renderer";
import { DocumentTable } from "./document-table";

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
  const source = findBoundarySource(element);
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
    node: <BoundariesPreview label={displayLabel} title={element.title} table={table} source={source} />,
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
  source: Concept | undefined;
}) {
  const sourceTitle = source?.label.trim().replace(/:\s*$/, "");
  return (
    <section>
      <ElementTitle>{[label, title].filter(Boolean).join(" ")}</ElementTitle>
      {table && table.enabled !== false ? <BoundaryTable table={table} /> : null}
      {/* Its title and its value are the concept's own, edited under the table in the editor. */}
      {source?.value.trim() ? (
        <p className="mt-1.5 text-[9.5px] leading-tight text-slate-700">
          <strong>{sourceTitle}:</strong> {source.value}
        </p>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

/**
 * The table of measures, printed as the other tables of the dictamen: its
 * distances with their unit, in whichever column "Distancia" was moved to,
 * and "No se proporcionó" where nothing was written.
 */
function BoundaryTable({ table }: { table: TableContent }) {
  const presentation = useNumberPresentation();
  const t2 = ensureTableV2(table);
  const distanceColumnId = findBoundaryDistanceColumnId(table);
  const printed: TableV2 = {
    ...t2,
    schema: { ...t2.schema, zones: t2.schema?.zones ?? [], hideCaption: true },
    rows: t2.rows.map((row, rowIndex) => ({
      ...row,
      cells: Object.fromEntries(t2.columns.map((column): [string, TableCellV2] => {
        const cell = row.cells[column.id];
        const value = cell?.kind === "value" ? cell.value : "";
        const shown = column.id === distanceColumnId
          ? formatDistance(value, table.boundaryDistanceFormats?.[rowIndex], presentation)
          : value.trim() || EMPTY_VALUE;
        return [column.id, { kind: "value", value: shown }];
      })),
    })),
  };

  return (
    <div className="mt-1.5">
      <DocumentTable table={printed as unknown as TableContent} variant="report" />
    </div>
  );
}
/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function formatDistance(
  value: string | undefined,
  format: Pick<Concept, "valueFormat" | "customUnit"> = { valueFormat: "m" },
  presentation?: NumberPresentation,
) {
  const distance = value?.trim();
  return distance ? formatNumericValue(distance, format, presentation) : EMPTY_VALUE;
}
