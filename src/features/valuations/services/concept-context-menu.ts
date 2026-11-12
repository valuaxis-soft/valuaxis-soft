/**
 * The right-click menu of a concept (its label and value), the same in every
 * section: the actions its ⋮ menu and "Seleccionar conceptos" already offer,
 * in the same order as the menus of the block titles and the tables. What a
 * concept cannot do stays in the menu, disabled, with the reason: a concept
 * the calculation writes keeps its spacing and its row style, and its value,
 * order and place are the calculation's.
 *
 * Pure TypeScript — no React, no side effects. The component renders the
 * groups this module gives and runs the action chosen.
 */

export type ConceptMenuAction =
  | "bold" | "italic" | "underline"
  | "value-format" | "data-type" | "date-format" | "row-style" | "spacing-before" | "spacing-after" | "join-lines"
  | "move-up" | "move-down" | "duplicate" | "move-to" | "select"
  | "delete";

export type ConceptMenuItem = {
  action: ConceptMenuAction;
  label: string;
  disabled?: boolean;
  /** Why the item is disabled, shown as a tooltip. */
  hint?: string;
  destructive?: boolean;
  /** The item opens a submenu of choices the component fills. */
  submenu?: boolean;
};

export type ConceptMenuGroup = ConceptMenuItem[];

/** Why what the calculation owns in a concept it writes is disabled. */
export const GENERATED_CONCEPT_HINT = "Lo escribe el cálculo: el dato, su lugar y su formato se cambian en el panel de cálculo.";
/** Why a value the calculation writes cannot be deleted. */
export const GENERATED_CONCEPT_DELETE_HINT = "Es un valor calculado: el cálculo lo volvería a escribir. Si no debe imprimirse, oculta el bloque.";
export const READ_ONLY_CONCEPT_HINT = "El avalúo es de solo lectura.";
export const NO_TEXT_MARKS_HINT = "Solo los textos llevan negrita, cursiva o subrayado.";
export const EMPTY_VALUE_HINT = "El concepto no tiene dato todavía.";
export const NO_VALUE_FORMAT_HINT = "Las fechas, los teléfonos y los párrafos no llevan formato del valor.";
export const SOURCE_FORMAT_HINT = "Lo toma del concepto ligado: cámbialo en el original.";
export const NOT_A_DATE_HINT = "Solo las fechas tienen formato de fecha.";
export const NO_LINE_BREAKS_HINT = "El dato no tiene saltos de línea.";
export const NO_ROW_STYLE_HINT = "El renglón se elige desde el bloque o subbloque.";
export const FIRST_CONCEPT_HINT = "Ya es el primero.";
export const LAST_CONCEPT_HINT = "Ya es el último.";
export const DRAG_TO_ORDER_HINT = "Arrástralo con la flecha para cambiarlo de lugar.";
export const NO_TRANSFER_HINT = "Este concepto no se mueve a otro bloque desde aquí.";
export const NO_SELECTION_HINT = "Este bloque no elige varios conceptos a la vez.";

export type ConceptMenuTarget = {
  /** The calculation writes the concept: only its presentation is the appraiser's. */
  generated: boolean;
  readOnly: boolean;
  /** The value is a text that takes bold, italic or underline. */
  takesTextMarks: boolean;
  hasValue: boolean;
  /** "Formato del valor": offered, owned by a linked concept, or not for this type. */
  valueFormat: "enabled" | "source-owned" | "unsupported";
  date: boolean;
  hasLineBreaks: boolean;
  /** The container prints its rows as columns or labels ("Renglón"). */
  canRowStyle: boolean;
  /** Absent: the concept is ordered by dragging it. */
  order?: { canMoveUp: boolean; canMoveDown: boolean };
  canDuplicate: boolean;
  canMoveTo: boolean;
  /** The container chooses several concepts at once ("Seleccionar conceptos"). */
  canSelect: boolean;
  canDelete: boolean;
};

const disabledWhen = (item: ConceptMenuItem, disabled: boolean, hint: string): ConceptMenuItem =>
  disabled ? { ...item, disabled: true, hint } : item;

/** The groups of the menu, in the order they are shown; a separator goes between groups. */
export function conceptContextMenu(target: ConceptMenuTarget): ConceptMenuGroup[] {
  const { generated, readOnly } = target;
  // What the appraiser sets on any concept, the one the calculation writes too.
  const presentation = (item: ConceptMenuItem, allowed = true, hint = "") =>
    disabledWhen(item, readOnly || !allowed, readOnly ? READ_ONLY_CONCEPT_HINT : hint);
  // What belongs to the value, its type and its place: the calculation's in a concept it writes.
  const own = (item: ConceptMenuItem, allowed = true, hint = "", generatedHint = GENERATED_CONCEPT_HINT) =>
    disabledWhen(item, readOnly || generated || !allowed, readOnly ? READ_ONLY_CONCEPT_HINT : generated ? generatedHint : hint);
  const marks = (item: ConceptMenuItem) =>
    own(item, target.takesTextMarks && target.hasValue, target.takesTextMarks ? EMPTY_VALUE_HINT : NO_TEXT_MARKS_HINT);
  const valueFormatHint = target.valueFormat === "source-owned" ? SOURCE_FORMAT_HINT : NO_VALUE_FORMAT_HINT;
  return [
    [
      marks({ action: "bold", label: "Negrita (N)" }),
      marks({ action: "italic", label: "Cursiva (K)" }),
      marks({ action: "underline", label: "Subrayado (S)" }),
    ],
    [
      own({ action: "value-format", label: "Formato del valor", submenu: true }, target.valueFormat === "enabled", valueFormatHint),
      own({ action: "data-type", label: "Tipo de dato", submenu: true }),
      own({ action: "date-format", label: "Formato de fecha", submenu: true }, target.date, NOT_A_DATE_HINT),
      presentation({ action: "row-style", label: "Renglón", submenu: true }, target.canRowStyle, NO_ROW_STYLE_HINT),
      presentation({ action: "spacing-before", label: "Espacio antes", submenu: true }),
      presentation({ action: "spacing-after", label: "Espacio después", submenu: true }),
      own({ action: "join-lines", label: "Unir líneas" }, target.hasLineBreaks, NO_LINE_BREAKS_HINT),
    ],
    [
      own({ action: "move-up", label: "Subir concepto" }, Boolean(target.order?.canMoveUp), target.order ? FIRST_CONCEPT_HINT : DRAG_TO_ORDER_HINT),
      own({ action: "move-down", label: "Bajar concepto" }, Boolean(target.order?.canMoveDown), target.order ? LAST_CONCEPT_HINT : DRAG_TO_ORDER_HINT),
      own({ action: "duplicate", label: "Duplicar" }, target.canDuplicate, NO_TRANSFER_HINT),
      own({ action: "move-to", label: "Mover a…" }, target.canMoveTo, NO_TRANSFER_HINT),
      presentation({ action: "select", label: "Seleccionar varios…" }, target.canSelect, NO_SELECTION_HINT),
    ],
    [own({ action: "delete", label: "Eliminar concepto…", destructive: true }, target.canDelete, "", GENERATED_CONCEPT_DELETE_HINT)],
  ];
}

/** The blank lines the spacing submenus offer. */
export const SPACING_CHOICES = [0, 1, 2, 3, 4, 5] as const;

/** The spacing submenus' choices, with the concept's own value among them when it is larger. */
export function spacingChoices(current: number | undefined): number[] {
  const value = Math.max(0, Math.round(current ?? 0));
  return SPACING_CHOICES.includes(value as (typeof SPACING_CHOICES)[number]) ? [...SPACING_CHOICES] : [...SPACING_CHOICES, value];
}
