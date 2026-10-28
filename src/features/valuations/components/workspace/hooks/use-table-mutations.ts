import type { TableContent } from "@/features/valuations/model";
import { appendTableColumn, ensureTableV2 } from "@/features/valuations/services/table";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { createTable } from "../model/content-factories";
import { changedTableCell, type EditorHistoryOptions } from "../model/editor-history";
import {
  ensureBlockContentIntegrity,
  withAddedApartadoContent,
  withAddedBlockContent,
} from "../model/section-content";
import type { EditorState } from "./use-editor-state";

/** Table edits: add (blank or homologation), update, add column/row, remove. */
export function useTableMutations({
  updateSectionBlocks,
}: Pick<EditorState, "updateSectionBlocks">) {
  const addTable = (sectionId: string, blockId: string, apartadoId?: string, preset?: "homologation") => {
    const table = createTable(preset);
    const added = { type: "table" as const, id: table.id };
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) {
          return withAddedBlockContent({ ...block, tables: [...block.tables, table] }, added);
        }
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            return withAddedApartadoContent({ ...subBlock, tables: [...subBlock.tables, table] }, added);
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
    // Each cell is its own undo step, and undoing it brings the editor to that cell. The
    // history reads these options once the update ran, so the change found is in them.
    const history: EditorHistoryOptions = { focus: { sectionId, blockId, tableId } };
    const update = (table: TableContent) => {
      if (table.id !== tableId) return table;
      const next = updater(table);
      const cell = changedTableCell(table, next);
      // Typing in one cell groups as text does; any other change (rows, columns, several cells) is a step of its own.
      if (cell) {
        history.groupKey = `table:${tableId}:${cell.rowId}:${cell.columnId}`;
        history.focus = { sectionId, blockId, tableId, ...cell };
      } else if (next.title !== table.title) {
        history.groupKey = `table:${tableId}:title`;
      }
      return next;
    };
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            return { ...block, tables: block.tables.map(update) };
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) =>
              subBlock.id === apartadoId ? { ...subBlock, tables: subBlock.tables.map(update) } : subBlock,
            ),
          };
        }),
      history,
    );
  };

  const addTableColumn = (sectionId: string, blockId: string, tableId: string, apartadoId?: string) => {
    updateTable(
      sectionId,
      blockId,
      tableId,
      // After the last column shown, in its zone: a homologation table shows it under its last header.
      (table) => appendTableColumn(ensureTableV2(table)) as unknown as TableContent,
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
