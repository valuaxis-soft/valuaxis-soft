import type { TableContent } from "@/features/valuations/model";
import { ensureTableV2 } from "@/features/valuations/services/table";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { createTable } from "../model/content-factories";
import { ensureBlockContentIntegrity } from "../model/section-content";
import type { EditorState } from "./use-editor-state";

/** Table edits: add (blank or homologation), update, add column/row, remove. */
export function useTableMutations({
  updateSectionBlocks,
}: Pick<EditorState, "updateSectionBlocks">) {
  const addTable = (sectionId: string, blockId: string, apartadoId?: string, preset?: "homologation") => {
    const table = createTable(preset);
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) {
          const updated = { ...block, tables: [...block.tables, table] };
          return ensureBlockContentIntegrity(updated);
        }
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, tables: [...subBlock.tables, table] };
            // Reconcile content layout so the new table appears in the form
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  const addHomologationTable = (sectionId: string, blockId: string, apartadoId?: string) => {
    addTable(sectionId, blockId, apartadoId, "homologation");
  };

  const updateTable = (
    sectionId: string,
    blockId: string,
    tableId: string,
    updater: (table: TableContent) => TableContent,
    apartadoId?: string,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            return {
              ...block,
              tables: block.tables.map((table) => (table.id === tableId ? updater(table) : table)),
            };
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) =>
              subBlock.id === apartadoId
                ? {
                    ...subBlock,
                    tables: subBlock.tables.map((table) =>
                      table.id === tableId ? updater(table) : table,
                    ),
                  }
                : subBlock,
            ),
          };
        }),
      { groupKey: `table:${tableId}` },
    );
  };

  const addTableColumn = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateTable(
      sectionId,
      blockId,
      tableId,
      (table) => {
        const v2 = ensureTableV2(table);
        const newColId = `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const newCol = { id: newColId, name: `Columna ${v2.columns.length + 1}` };
        const newRows = v2.rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [newColId]: { kind: "value" as const, value: "" } },
        }));
        return { ...v2, columns: [...v2.columns, newCol], rows: newRows } as unknown as TableContent;
      },
      apartadoId,
    );
  };

  const addTableRow = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateTable(
      sectionId,
      blockId,
      tableId,
      (table) => {
        const v2 = ensureTableV2(table);
        const newRowId = `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const cells: Record<string, { kind: "value"; value: string }> = {};
        for (const col of v2.columns) {
          cells[col.id] = { kind: "value", value: "" };
        }
        return { ...v2, rows: [...v2.rows, { id: newRowId, cells }] } as unknown as TableContent;
      },
      apartadoId,
    );
  };

  const removeTable = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) {
          const updated = { ...block, tables: block.tables.filter((table) => table.id !== tableId) };
          return ensureBlockContentIntegrity(updated);
        }
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, tables: subBlock.tables.filter((table) => table.id !== tableId) };
            // Reconcile content layout to remove the stale ref
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  return {
    addHomologationTable,
    addTable,
    addTableColumn,
    addTableRow,
    removeTable,
    updateTable,
  };
}
