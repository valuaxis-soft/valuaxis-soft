"use client";

import { ArrowDown, ArrowUp, Columns2, Rows2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  isOwnTable,
  moveTableRow,
  placeTableAlone,
  placeTableBeside,
  tablePlacement,
} from "@/features/valuations/calculation/generated-block-layout";
import type { Block, ContentLayout, TableContent } from "@/features/valuations/model";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { cn } from "@/lib/utils";
import { EditorTable } from "./construction-capture-table";
import { GeneratedTableEditor } from "./generated-table-editor";

export const PENDING_TABLE_NOTICE = {
  title: "Esta tabla todavía no está en el dictamen.",
  description: "Captura sus datos: en cuanto el cálculo tenga resultado podrás darle formato, renombrar sus encabezados y agregarle columnas.",
};

/**
 * The tables of a block the calculation writes, laid out as they print: in
 * rows, two or three side by side, each with the controls of any table
 * (24 nov 2026: «recuerden nuestras tablas no son fijas»). Over each one,
 * «Junto a la anterior» / «En su renglón» and up / down; a table of the
 * appraiser's own («Agregar → Tabla») is edited and deleted as in any block.
 */
export function GeneratedBlockTables(props: {
  block: Block;
  /** Its tables are where its calculation is captured. */
  capture: boolean;
  /** The dictamen does not have the block yet: its tables are captured, not formatted. */
  pending: boolean;
  /** The valuation is read only. */
  readOnly: boolean;
  onLayoutChange: (layout: ContentLayout) => void;
  onUpdateTable: (tableId: string, updater: (table: TableContent) => TableContent) => void;
  onAddTableColumn: (tableId: string) => void;
  onAddTableRow: (tableId: string) => void;
  onRemoveTable: (tableId: string) => void;
}) {
  const { block, pending } = props;
  const tables = block.tables.filter((table) => !ensureTableV2(table).schema?.plain);
  if (!tables.length) return null;
  const byId = new Map(tables.map((table) => [table.id, table]));
  const layout = resolveContentLayout(block);
  const rows = layout.rows
    .map((row) => ({ id: row.id, tables: row.columns.flatMap((column) => column.items.flatMap((item) => (item.type === "table" && byId.has(item.id) ? [byId.get(item.id)!] : [])) ) }))
    .filter((row) => row.tables.length);
  const arranging = !props.readOnly && !pending && tables.length > 1;
  const change = (next: ContentLayout) => {
    if (next !== layout) props.onLayoutChange(next);
  };

  return (
    <div className="grid gap-4" data-generated-block-tables="">
      {rows.map((row) => (
        <div
          key={row.id}
          className={cn("grid min-w-0 gap-3", row.tables.length === 2 && "xl:grid-cols-2", row.tables.length === 3 && "xl:grid-cols-3")}
          data-generated-table-row={row.tables.length}
        >
          {row.tables.map((table) => {
            const placement = tablePlacement(layout, table.id);
            return (
              <div key={table.id} className="grid min-w-0 content-start gap-1.5">
                {arranging ? (
                  <div className="flex flex-wrap items-center justify-end gap-1" data-table-placement={table.id}>
                    {placement.alone ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" title="Imprimir esta tabla en su propio renglón" onClick={() => change(placeTableAlone(layout, table.id))}>
                        <Rows2 data-icon="inline-start" /> En su renglón
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={!placement.beside}
                        title={placement.beside ? "Imprimir esta tabla a un lado de la tabla anterior" : "Arriba no hay una tabla con lugar a un lado (hasta tres por renglón)"}
                        onClick={() => change(placeTableBeside(layout, table.id))}
                      >
                        <Columns2 data-icon="inline-start" /> Junto a la anterior
                      </Button>
                    )}
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Subir la tabla" title="Subir la tabla" disabled={!placement.up} onClick={() => change(moveTableRow(layout, table.id, -1))}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Bajar la tabla" title="Bajar la tabla" disabled={!placement.down} onClick={() => change(moveTableRow(layout, table.id, 1))}>
                      <ArrowDown />
                    </Button>
                  </div>
                ) : null}
                {isOwnTable(table) ? (
                  <EditorTable
                    table={table}
                    readOnly={props.readOnly}
                    onAddColumn={props.onAddTableColumn}
                    onAddRow={props.onAddTableRow}
                    onRemove={props.onRemoveTable}
                    onUpdate={props.onUpdateTable}
                  />
                ) : (
                  <GeneratedTableEditor
                    table={table}
                    readOnly={props.readOnly}
                    capture={props.capture}
                    onUpdate={(updater) => {
                      if (pending) {
                        toast.info(PENDING_TABLE_NOTICE.title, { id: "capture-pending-table", description: PENDING_TABLE_NOTICE.description });
                        return;
                      }
                      props.onUpdateTable(table.id, updater);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

