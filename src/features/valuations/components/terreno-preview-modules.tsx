"use client";

import type { ReactNode } from "react";

import type { Block, Concept, Apartado, TableContent } from "../model";
import { getTerrenoElementKind } from "../sections/terreno";
import { formatNumericValue } from "@/features/valuations/services/concept-value-format";
import { ensureTableV2 } from "../services/table";
import { DocumentBlockTitleBar } from "./document-block-title-bar";

const EMPTY_VALUE = "No se proporcionó";

/* ------------------------------------------------------------------ */
/*  TerrainMainModule — fixed semantic content of main terrain block   */
/* ------------------------------------------------------------------ */

export function TerrainMainModule({ block }: { block: Block }) {
  const subBlocks = block.apartados.filter((sb) => sb.enabled);

  return (
    <>
      <section>
        <DocumentBlockTitleBar label={block.sectionLabel} title={block.title} />
      </section>
      {subBlocks.map((element) => (
        <TerrainElement key={element.id} element={element} parentLabel={block.sectionLabel} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  TerrainElement — routes sub-blocks to terrain-specific renderers   */
/* ------------------------------------------------------------------ */

function TerrainElement({ element, parentLabel }: { element: Apartado; parentLabel: string }) {
  const kind = getTerrenoElementKind(element);
  // Boundaries: temporarily specialized (canonical Table not ready)
  if (kind === "boundaries") return <BoundariesPreview element={element} parentLabel={parentLabel} />;
  // Access/Topography/Sketch: no longer rendered in fixed module
  // Old valuations with these elements will render through generic ContentLayoutV2 path
  return null;
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

function BoundariesPreview({ element, parentLabel }: { element: Apartado; parentLabel: string }) {
  const table = element.tables[0];
  const source = element.concepts[0]?.value || "Escrituras públicas...";

  return (
    <section>
      <ElementTitle>{subBlockLabel(parentLabel, 0)} MEDIDAS Y COLINDANCIAS</ElementTitle>
      {table ? <BoundaryTable table={table} /> : null}
      <p className="mt-1.5 text-[9.5px] leading-tight text-slate-700">
        <strong>Linderos y colindancias según:</strong> {source}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */

function BoundaryTable({ table }: { table: TableContent }) {
  const t2 = ensureTableV2(table);
  const displayColumns = t2.columns.slice(0, 3);

  return (
    <table className="mt-1.5 w-full table-fixed border-collapse text-[9px] leading-tight">
      <thead className="bg-[var(--caratula-dark-blue)] text-white">
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

function subBlockLabel(parentLabel: string, index: number) {
  return `${parentLabel.trim().replace(/\.+$/, "")}.${index + 1}`;
}
