/**
 * The right-click menu of every table of the editor, as a spreadsheet's: the
 * same items in the same order in a configurable table (Datos, Terreno,
 * Construcciones, Consideraciones), in a capture table of the calculation
 * panels (Costos, tipos de construcción, homologación, comparables, métodos
 * alternativos) and in a table the calculation writes for the dictamen. What
 * a table cannot do stays in the menu, disabled, with the reason.
 *
 * Pure TypeScript — no React, no side effects. The components render the
 * groups this module gives and run the action chosen.
 */

/**
 * What kind of table the menu is for: one the appraiser edits cell by cell
 * (`editable`), one whose cells are captured but whose columns are the
 * calculation's (`capture`), or one the calculation writes (`generated`).
 */
export type TableMenuKind = "editable" | "capture" | "generated";

export type TableMenuAction =
  | "cut" | "copy" | "paste" | "paste-values"
  | "insert-row-above" | "insert-row-below" | "insert-column-left" | "insert-column-right" | "delete-row" | "delete-column"
  | "edit-formula" | "fill-column" | "fill-row" | "remove-formula"
  | "format" | "format-decimals" | "clear"
  | "rename" | "move-left" | "move-right" | "column-width" | "sort-asc" | "sort-desc" | "hide-column" | "show-column" | "column-format" | "column-decimals"
  | "duplicate-row" | "move-row-up" | "move-row-down" | "hide-row" | "show-row"
  | "block-rename" | "block-copy" | "block-duplicate" | "block-move" | "block-hide" | "block-show" | "block-page-break" | "block-delete";

export type TableMenuItem = {
  action: TableMenuAction;
  label: string;
  disabled?: boolean;
  /** Why the item is disabled, shown as a tooltip. */
  hint?: string;
  destructive?: boolean;
  /**
   * The item opens a submenu the component fills: the operations, or the
   * "Unidades de valor" and "Decimales" of a value, the same as a concept's.
   */
  submenu?: "operations" | "units" | "decimals";
};

export type TableMenuGroup = TableMenuItem[];

/** Why a structural item of a table the calculation lays out is disabled. */
export const GENERATED_STRUCTURE_HINT = "Las filas y columnas de esta tabla las fija el cálculo.";
/** Why a formula item of a table the calculation writes is disabled. */
export const GENERATED_FORMULA_HINT = "Las cifras de esta tabla las escribe el cálculo; cámbialas en su panel.";
/** Why the format items of a capture table are disabled, and where the printed table takes its format. */
export const CAPTURE_FORMAT_HINT = "Esta tabla es de captura. Su formato al imprimir (título, ancho, espacio, sangría y decimales) se elige en «Formato de la tabla» de su bloque en el dictamen.";
/** Why a cell that is not an input cannot be edited. */
export const COMPUTED_CELL_HINT = "Esta cifra la calcula el sistema; no se escribe.";
/** Why a paste item is disabled. */
export const NO_PASTE_HINT = "No hay nada copiado.";
/** Why an item that needs a formula is disabled. */
export const NO_FORMULA_HINT = "La celda no tiene fórmula todavía.";
/** Why "Copiar a toda la columna/fila" is disabled: there is nothing to copy. */
export const EMPTY_CELL_HINT = "La celda está vacía: escribe un valor o una fórmula para copiarlo.";
/** Why a row or a column cannot be deleted. */
export const LAST_COLUMN_HINT = "La tabla no puede quedarse sin columnas.";
export const LAST_ROW_HINT = "La tabla no puede quedarse sin filas.";
export const FIXED_COLUMN_HINT = "Esta columna forma parte de la estructura de la tabla.";
export const NO_NEW_ROWS_HINT = "Esta tabla no toma filas nuevas desde aquí.";

export type CellMenuTarget = {
  kind: "cell";
  /** The cell takes typing (a value or a formula). */
  editable: boolean;
  /** The cell holds a formula: it can be copied to its column and its row. */
  hasFormula: boolean;
  /** The cell holds a written value (not a formula): it is copied to the empty cells of its column and its row. */
  hasValue?: boolean;
  /** Something is in the clipboard to paste. */
  canPaste: boolean;
  canInsertRow: boolean;
  canInsertColumn: boolean;
  canDeleteColumn: boolean;
  canDeleteRow: boolean;
};

export type ColumnMenuTarget = {
  kind: "column";
  canInsertBeside: boolean;
  canRename: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDelete: boolean;
  hidden: boolean;
  /** The column can be hidden in the dictamen (a generated table hides it with its layout). */
  canHide: boolean;
};

export type RowMenuTarget = {
  kind: "row";
  canInsert: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hidden: boolean;
  canHide: boolean;
  canDelete: boolean;
};

export type BlockMenuTarget = {
  kind: "block";
  canRename: boolean;
  /** Copied and duplicated. */
  canTransfer: boolean;
  /** Moved to another section; absent, as `canTransfer`. */
  canMove?: boolean;
  hidden: boolean;
  canHide: boolean;
  pageBreakBefore: boolean;
  canPageBreak: boolean;
  canDelete: boolean;
  /** Why each disabled item is disabled, over the general reasons. */
  hints?: Partial<Record<"rename" | "transfer" | "move" | "hide" | "pageBreak" | "delete", string>>;
};

export type TableMenuTarget = CellMenuTarget | ColumnMenuTarget | RowMenuTarget | BlockMenuTarget;

const disabledWhen = (item: TableMenuItem, disabled: boolean, hint: string): TableMenuItem =>
  disabled ? { ...item, disabled: true, hint } : item;

/** Structure items: a generated table has none; the others follow what the table allows. */
const structural = (kind: TableMenuKind) => (item: TableMenuItem, allowed: boolean, hint: string) =>
  disabledWhen(item, kind === "generated" || !allowed, kind === "generated" ? GENERATED_STRUCTURE_HINT : hint);

function cellMenu(kind: TableMenuKind, target: CellMenuTarget): TableMenuGroup[] {
  const structure = structural(kind);
  const editable = kind !== "generated" && target.editable;
  const editableHint = kind === "generated" ? GENERATED_FORMULA_HINT : COMPUTED_CELL_HINT;
  const typing = (item: TableMenuItem, allowed = true, hint = NO_FORMULA_HINT) =>
    disabledWhen(item, !editable || !allowed, editable ? hint : editableHint);
  const canFill = target.hasFormula || Boolean(target.hasValue);
  const fillCopies = target.hasFormula ? "fórmula" : "valor";
  const formatHint = kind === "editable" ? NO_FORMULA_HINT : kind === "capture" ? CAPTURE_FORMAT_HINT : GENERATED_FORMULA_HINT;
  return [
    [
      typing({ action: "cut", label: "Cortar" }),
      { action: "copy", label: "Copiar" },
      typing({ action: "paste", label: "Pegar" }, target.canPaste, NO_PASTE_HINT),
      typing({ action: "paste-values", label: "Pegar solo valores" }, target.canPaste, NO_PASTE_HINT),
    ],
    [
      structure({ action: "insert-row-above", label: "Insertar fila arriba" }, target.canInsertRow, NO_NEW_ROWS_HINT),
      structure({ action: "insert-row-below", label: "Insertar fila abajo" }, target.canInsertRow, NO_NEW_ROWS_HINT),
      structure({ action: "insert-column-left", label: "Insertar columna a la izquierda" }, target.canInsertColumn, FIXED_COLUMN_HINT),
      structure({ action: "insert-column-right", label: "Insertar columna a la derecha" }, target.canInsertColumn, FIXED_COLUMN_HINT),
      structure({ action: "delete-row", label: "Eliminar fila", destructive: true }, target.canDeleteRow, LAST_ROW_HINT),
      structure({ action: "delete-column", label: "Eliminar columna", destructive: true }, target.canDeleteColumn, LAST_COLUMN_HINT),
    ],
    [
      typing({ action: "edit-formula", label: target.hasFormula ? "Editar fórmula…" : "Insertar fórmula…" }),
      // The formula, or the value written, goes to the empty cells of its column or row that take typing.
      typing({ action: "fill-column", label: `Copiar ${fillCopies} a toda la columna` }, canFill, EMPTY_CELL_HINT),
      typing({ action: "fill-row", label: `Copiar ${fillCopies} a toda la fila` }, canFill, EMPTY_CELL_HINT),
      ...(kind === "editable" ? [typing({ action: "edit-formula", label: "Operaciones", submenu: "operations" })] : []),
      ...(target.hasFormula && kind === "editable" ? [{ action: "remove-formula" as const, label: "Quitar fórmula" }] : []),
    ],
    [
      // "Unidades de valor" and "Decimales", as in the concepts (video 5.7); right there on the value's right click.
      disabledWhen({ action: "format", label: "Unidades de valor", submenu: "units" }, kind !== "editable", formatHint),
      disabledWhen({ action: "format-decimals", label: "Decimales", submenu: "decimals" }, kind !== "editable", formatHint),
      typing({ action: "clear", label: "Limpiar contenido" }),
    ],
  ];
}

function columnMenu(kind: TableMenuKind, target: ColumnMenuTarget): TableMenuGroup[] {
  const structure = structural(kind);
  const own = (item: TableMenuItem, allowed: boolean, hint: string) =>
    disabledWhen(item, kind !== "editable" || !allowed, kind === "editable" ? hint : GENERATED_STRUCTURE_HINT);
  return [
    [
      structure({ action: "insert-column-left", label: "Insertar columna a la izquierda" }, target.canInsertBeside, FIXED_COLUMN_HINT),
      structure({ action: "insert-column-right", label: "Insertar columna a la derecha" }, target.canInsertBeside, FIXED_COLUMN_HINT),
      disabledWhen({ action: "rename", label: "Renombrar" }, !target.canRename, "El nombre de esta columna lo pone el cálculo."),
      structure({ action: "move-left", label: "Mover a la izquierda" }, target.canMoveLeft, "La columna ya es la primera."),
      structure({ action: "move-right", label: "Mover a la derecha" }, target.canMoveRight, "La columna ya es la última."),
      own({ action: "column-width", label: "Ancho de columna…" }, true, ""),
      own({ action: "column-format", label: "Unidades de valor de la columna", submenu: "units" }, true, ""),
      own({ action: "column-decimals", label: "Decimales de la columna", submenu: "decimals" }, true, ""),
      own({ action: "sort-asc", label: "Ordenar A→Z" }, true, ""),
      own({ action: "sort-desc", label: "Ordenar Z→A" }, true, ""),
      disabledWhen(
        target.hidden ? { action: "show-column", label: "Mostrar en el dictamen" } : { action: "hide-column", label: "Ocultar en el dictamen" },
        !target.canHide,
        "Esta columna no se puede ocultar.",
      ),
    ],
    [structure({ action: "delete-column", label: "Eliminar columna", destructive: true }, target.canDelete, LAST_COLUMN_HINT)],
  ];
}

function rowMenu(kind: TableMenuKind, target: RowMenuTarget): TableMenuGroup[] {
  const structure = structural(kind);
  return [
    [
      structure({ action: "insert-row-above", label: "Insertar fila arriba" }, target.canInsert, NO_NEW_ROWS_HINT),
      structure({ action: "insert-row-below", label: "Insertar fila abajo" }, target.canInsert, NO_NEW_ROWS_HINT),
      structure({ action: "duplicate-row", label: "Duplicar fila" }, target.canInsert, NO_NEW_ROWS_HINT),
      structure({ action: "move-row-up", label: "Mover arriba" }, target.canMoveUp, "La fila ya es la primera."),
      structure({ action: "move-row-down", label: "Mover abajo" }, target.canMoveDown, "La fila ya es la última."),
      disabledWhen(
        target.hidden ? { action: "show-row", label: "Mostrar fila en el dictamen" } : { action: "hide-row", label: "Ocultar fila en el dictamen" },
        !target.canHide,
        "Las filas de esta tabla las fija el cálculo.",
      ),
    ],
    [structure({ action: "delete-row", label: "Eliminar fila", destructive: true }, target.canDelete, LAST_ROW_HINT)],
  ];
}

function blockMenu(target: BlockMenuTarget): TableMenuGroup[] {
  const hints = target.hints ?? {};
  const transferHint = hints.transfer ?? "Este bloque no se copia ni se mueve.";
  const transfer = (item: TableMenuItem) => disabledWhen(item, !target.canTransfer, transferHint);
  return [
    [
      disabledWhen({ action: "block-rename", label: "Renombrar" }, !target.canRename, hints.rename ?? "El título de este bloque lo pone la plantilla."),
      transfer({ action: "block-copy", label: "Copiar" }),
      transfer({ action: "block-duplicate", label: "Duplicar" }),
      disabledWhen({ action: "block-move", label: "Mover a…" }, !(target.canMove ?? target.canTransfer), hints.move ?? transferHint),
      disabledWhen(
        target.hidden ? { action: "block-show", label: "Mostrar en el dictamen" } : { action: "block-hide", label: "Ocultar en el dictamen" },
        !target.canHide,
        hints.hide ?? "Este bloque siempre se imprime.",
      ),
      disabledWhen(
        { action: "block-page-break", label: target.pageBreakBefore ? "Quitar el salto de página antes" : "Salto de página antes" },
        !target.canPageBreak,
        hints.pageBreak ?? "Este bloque sigue al anterior.",
      ),
    ],
    [disabledWhen({ action: "block-delete", label: "Eliminar bloque…", destructive: true }, !target.canDelete, hints.delete ?? "Este bloque no se puede eliminar.")],
  ];
}

/** A cell of a capture table's row or column, as "Copiar fórmula/valor a toda la fila/columna" sees it; null when it has no field. */
export type CaptureFillCell = { takesTyping: boolean; text: string; hasFormula: boolean } | null;

/**
 * Where "Copiar fórmula/valor a toda la fila/columna" of a capture table writes the
 * formula (or the value) of the cell at `from`: the other cells of the row or column that
 * take typing and are empty. A capture's formulas are arithmetic without
 * references (=1345*235), so each copy is the same formula; what is already
 * captured is never overwritten, as in the editor's own tables.
 */
export function captureFillTargets(cells: CaptureFillCell[], from: number): number[] {
  return cells.flatMap((cell, index) => (index !== from && cell?.takesTyping && !cell.hasFormula && !cell.text.trim() ? [index] : []));
}

/** The groups of the menu for what was right-clicked, in the order they are shown; a separator goes between groups. */
export function tableContextMenu(kind: TableMenuKind, target: TableMenuTarget): TableMenuGroup[] {
  switch (target.kind) {
    case "cell":
      return cellMenu(kind, target);
    case "column":
      return columnMenu(kind, target);
    case "row":
      return rowMenu(kind, target);
    case "block":
      return blockMenu(target);
  }
}
