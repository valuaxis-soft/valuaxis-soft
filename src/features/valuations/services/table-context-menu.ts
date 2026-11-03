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
  | "format" | "clear"
  | "rename" | "move-left" | "move-right" | "column-width" | "sort-asc" | "sort-desc" | "hide-column" | "show-column" | "column-format"
  | "duplicate-row" | "move-row-up" | "move-row-down" | "hide-row" | "show-row"
  | "block-rename" | "block-copy" | "block-duplicate" | "block-move" | "block-hide" | "block-show" | "block-page-break" | "block-delete";

export type TableMenuItem = {
  action: TableMenuAction;
  label: string;
  disabled?: boolean;
  /** Why the item is disabled, shown as a tooltip. */
  hint?: string;
  destructive?: boolean;
  /** The item opens a submenu the component fills (the operations, the formats). */
  submenu?: "operations" | "formats";
};

export type TableMenuGroup = TableMenuItem[];

/** Why a structural item of a table the calculation lays out is disabled. */
export const GENERATED_STRUCTURE_HINT = "Las filas y columnas de esta tabla las fija el cálculo.";
/** Why a formula item of a table the calculation writes is disabled. */
export const GENERATED_FORMULA_HINT = "Las cifras de esta tabla las escribe el cálculo; cámbialas en su panel.";
/** Why the format items of a capture table are disabled. */
export const CAPTURE_FORMAT_HINT = "El formato de esta tabla lo fija el cálculo.";
/** Why a cell that is not an input cannot be edited. */
export const COMPUTED_CELL_HINT = "Esta cifra la calcula el sistema; no se escribe.";
/** Why a paste item is disabled. */
export const NO_PASTE_HINT = "No hay nada copiado.";
/** Why an item that needs a formula is disabled. */
export const NO_FORMULA_HINT = "La celda no tiene fórmula todavía.";
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
  canTransfer: boolean;
  hidden: boolean;
  canHide: boolean;
  pageBreakBefore: boolean;
  canPageBreak: boolean;
  canDelete: boolean;
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
      typing({ action: "fill-column", label: "Copiar fórmula a toda la columna" }, kind === "editable" && target.hasFormula, kind === "editable" ? NO_FORMULA_HINT : GENERATED_STRUCTURE_HINT),
      typing({ action: "fill-row", label: "Copiar fórmula a toda la fila" }, kind === "editable" && target.hasFormula, kind === "editable" ? NO_FORMULA_HINT : GENERATED_STRUCTURE_HINT),
      ...(kind === "editable" ? [typing({ action: "edit-formula", label: "Operaciones", submenu: "operations" })] : []),
      ...(target.hasFormula && kind === "editable" ? [{ action: "remove-formula" as const, label: "Quitar fórmula" }] : []),
    ],
    [
      disabledWhen({ action: "format", label: "Formato del valor…", submenu: "formats" }, kind !== "editable", formatHint),
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
      own({ action: "column-format", label: "Formato de la columna", submenu: "formats" }, true, ""),
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
  const transfer = (item: TableMenuItem) => disabledWhen(item, !target.canTransfer, "Este bloque no se copia ni se mueve.");
  return [
    [
      disabledWhen({ action: "block-rename", label: "Renombrar" }, !target.canRename, "El título de este bloque lo pone la plantilla."),
      transfer({ action: "block-copy", label: "Copiar" }),
      transfer({ action: "block-duplicate", label: "Duplicar" }),
      transfer({ action: "block-move", label: "Mover a…" }),
      disabledWhen(
        target.hidden ? { action: "block-show", label: "Mostrar en el dictamen" } : { action: "block-hide", label: "Ocultar en el dictamen" },
        !target.canHide,
        "Este bloque siempre se imprime.",
      ),
      disabledWhen(
        { action: "block-page-break", label: target.pageBreakBefore ? "Quitar el salto de página antes" : "Salto de página antes" },
        !target.canPageBreak,
        "Este bloque sigue al anterior.",
      ),
    ],
    [disabledWhen({ action: "block-delete", label: "Eliminar bloque…", destructive: true }, !target.canDelete, "Este bloque no se puede eliminar.")],
  ];
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
