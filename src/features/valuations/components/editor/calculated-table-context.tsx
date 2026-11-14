"use client";

import { createContext, useContext } from "react";

import type { MenuReasons } from "../../services/table-context-menu";
import type { DeleteConfirmation } from "./delete-confirm";

/** Why a cell the calculation writes is not typed, as the cells of the capture panels say it. */
export const CALCULATED_CELL_HINT = "Esta cifra la calcula el sistema; cámbiala en su panel de cálculo.";
/** The same, in a capture table of the construction section. */
export const CAPTURE_CELL_HINT = "Esta cifra la calcula el sistema: el VUR es VUT − Edad; la conservación y el valor unitario vienen del enfoque de costos.";
const CALCULATED_COLUMN_HINT = "Esta columna la escribe el cálculo: ocúltala en el dictamen en lugar de eliminarla.";
const CALCULATED_ROW_HINT = "Esta fila la escribe el cálculo, en su orden: ocúltala en el dictamen en lugar de eliminarla o moverla.";
const CALCULATED_SORT_HINT = "Las filas de esta tabla siguen el orden del cálculo.";
const CAPTURE_COLUMN_HINT = "Esta columna entra al enfoque de costos: ocúltala en el dictamen en lugar de eliminarla.";
const CAPTURE_COMPUTED_COLUMN_HINT = "Esta columna la calcula el sistema: ocúltala en el dictamen en lugar de eliminarla.";
/** Why a table the calculation writes is not removed. */
export const CALCULATED_TABLE_REMOVE_HINT = "Esta tabla la escribe el cálculo: ocúltala con su bloque o quita el enfoque del dictamen en su panel.";

/**
 * A table the calculation writes, edited like any configurable table: which
 * of its rows and columns the calculation writes. Their cells show the
 * figures and are not typed; the rows and columns are hidden, not deleted.
 * Without it (`null`), every cell, row and column is the appraiser's.
 */
export type CalculatedTableLock = {
  row: (rowId: string) => boolean;
  column: (columnId: string) => boolean;
  /**
   * A capture table of the construction section: its rows are the
   * appraiser's (inserted, duplicated, moved and deleted) and only the
   * columns of the system are locked.
   */
  capture?: CaptureTableLock;
};

export type CaptureTableLock = {
  /** Columns whose data enter the cost approach: hidden, not deleted. */
  keyColumn: (columnId: string) => boolean;
  /** What deleting a row asks first; null when it goes at once. */
  rowRemoval: (rowId: string) => DeleteConfirmation | null;
  /** Why the table is not removed. */
  removeHint: string;
};

const CalculatedTableContext = createContext<CalculatedTableLock | null>(null);

export const CalculatedTableProvider = CalculatedTableContext.Provider;

/** The lock of the table being edited; null in the appraiser's own tables. */
export const useCalculatedTable = () => useContext(CalculatedTableContext);

/** What a column's menu does not offer on a table the calculation writes. */
export function calculatedColumnReasons(lock: CalculatedTableLock | null, columnId: string): MenuReasons | undefined {
  if (!lock) return undefined;
  if (lock.capture) return captureColumnReasons(lock, columnId);
  return {
    "sort-asc": CALCULATED_SORT_HINT,
    "sort-desc": CALCULATED_SORT_HINT,
    ...(lock.column(columnId) ? { "delete-column": CALCULATED_COLUMN_HINT } : {}),
  };
}

/** What a row's menu does not offer on a table the calculation writes. */
export function calculatedRowReasons(lock: CalculatedTableLock | null, rowId: string): MenuReasons | undefined {
  if (!lock?.row(rowId) || lock.capture) return undefined;
  return {
    "delete-row": CALCULATED_ROW_HINT,
    "duplicate-row": CALCULATED_ROW_HINT,
    "move-row-up": CALCULATED_ROW_HINT,
    "move-row-down": CALCULATED_ROW_HINT,
  };
}

/** What a cell's menu does not offer: deleting the row or the column the calculation writes. */
export function calculatedCellReasons(lock: CalculatedTableLock | null, rowId: string, columnId: string): MenuReasons | undefined {
  if (!lock) return undefined;
  if (lock.capture) return captureColumnReasons(lock, columnId);
  const reasons: MenuReasons = {
    ...(lock.row(rowId) ? { "delete-row": CALCULATED_ROW_HINT } : {}),
    ...(lock.column(columnId) ? { "delete-column": CALCULATED_COLUMN_HINT } : {}),
  };
  return Object.keys(reasons).length ? reasons : undefined;
}

/** On a capture table, only the columns of the cost approach and of the system keep their place. */
function captureColumnReasons(lock: CalculatedTableLock, columnId: string): MenuReasons | undefined {
  if (lock.column(columnId)) return { "delete-column": CAPTURE_COMPUTED_COLUMN_HINT };
  if (lock.capture?.keyColumn(columnId)) return { "delete-column": CAPTURE_COLUMN_HINT };
  return undefined;
}
