"use client";

import { toast } from "sonner";

import { isOwnTable, tableRowsOf, withTableRows } from "@/features/valuations/calculation/generated-block-layout";
import type { Block, ContentLayout, TableContent } from "@/features/valuations/model";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { EditorTable } from "./construction-capture-table";
import { EditableContentLayout } from "./editable-content-layout-v2";
import { GeneratedTableEditor } from "./generated-table-editor";

export const PENDING_TABLE_NOTICE = {
  title: "Esta tabla todavía no está en el dictamen.",
  description: "Captura sus datos: en cuanto el cálculo tenga resultado podrás darle formato, renombrar sus encabezados y agregarle columnas.",
};

/**
 * The tables of a block the calculation writes, laid out as they print and
 * arranged as the tables of any block (video 8.10, 25:40: «aquí yo puedo
 * arrastrar… acá me las hicieron diferentes»): each one is dragged by its
 * handle to another row, or beside another table (two or three in a row),
 * with the same drop places as the editor's. A table of the appraiser's own
 * («Agregar → Tabla») is edited and deleted as in any block.
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
  const ids = new Set(tables.map((table) => table.id));
  const layout = resolveContentLayout(block);
  const tableLayout = tableRowsOf(layout, ids);
  const arranging = !props.readOnly && !pending && tables.length > 1;
  const renderTable = (table: TableContent) => (isOwnTable(table) ? (
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
  ));

  return (
    <div className="grid gap-4" data-generated-block-tables="">
      <EditableContentLayout
        container={{ concepts: [], images: [], tables, contentLayout: tableLayout }}
        allConcepts={[]}
        allContainers={[]}
        conceptCallbacks={NO_CONCEPTS}
        imageCallbacks={NO_IMAGES}
        tableCallbacks={{
          onAddColumn: props.onAddTableColumn,
          onAddRow: props.onAddTableRow,
          onRemove: props.onRemoveTable,
          onUpdate: props.onUpdateTable,
        }}
        readOnly={props.readOnly}
        containerRef={{ kind: "block", blockId: block.id }}
        renderTable={renderTable}
        onContentLayoutChange={arranging ? (next) => {
          const merged = withTableRows(layout, next, ids);
          if (JSON.stringify(merged) !== JSON.stringify(layout)) props.onLayoutChange(merged);
        } : undefined}
      />
    </div>
  );
}

const NO_CONCEPTS = { onRemove: () => undefined, onUpdate: () => undefined };
const NO_IMAGES = { onRemove: () => undefined, onUpdate: () => undefined };
