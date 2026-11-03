/**
 * The toolbar of a Block, the same in every section of the editor: the same
 * controls, in the same order, whatever the Block holds or who writes it.
 * A control that cannot apply to a Block is shown disabled and says why,
 * instead of being left out (observations of 2 Nov 2026: "los controles no
 * son iguales entre pestañas").
 *
 * Pure: no React, no side effects.
 */

/** The controls, in the order the toolbar prints them after the drag handle and the title. */
export const BLOCK_TOOLBAR_CONTROLS = [
  "transfer",
  "move",
  "visibility",
  "pageBreak",
  "alignment",
  "add",
  "subblock",
  "delete",
] as const;

export type BlockToolbarControl = (typeof BLOCK_TOOLBAR_CONTROLS)[number];

/** Why the control is shown disabled; absent when it works. */
export type BlockToolbarControlState = { enabled: boolean; reason?: string };

export type BlockToolbarState = Record<BlockToolbarControl, BlockToolbarControlState>;

export type BlockToolbarKind =
  /** A Block of the appraiser's own, in any section but the carátula. */
  | "content"
  /** A Block of the carátula the appraiser added or the template gave ("Datos del bien"). */
  | "caratula-block"
  /** A fixed Block of the carátula: the assumptions and the conclusion. */
  | "caratula-fixed"
  /** A Block the calculation writes: its figures are edited in the calculation panel. */
  | "generated";

export const GENERATED_BLOCK_REASON = "Lo escribe el cálculo: sus conceptos y tablas se editan en el panel de cálculo.";
export const GENERATED_BLOCK_DELETE_REASON = "Lo escribe el cálculo: el cálculo lo volvería a crear. Si no debe imprimirse, ocúltalo.";
export const CARATULA_PAGE_BREAK_REASON = "La carátula se imprime en su propia página: sus bloques no tienen salto de página.";
export const CARATULA_FIXED_BLOCK_REASON = "Bloque fijo de la carátula: se edita en sus propios campos y no se mueve ni se elimina.";
export const TEMPLATE_BLOCK_DELETE_REASON = "Bloque de la plantilla de la carátula: si no debe imprimirse, ocúltalo.";
export const READ_ONLY_REASON = "El avalúo es de solo lectura.";

const enabled = (): BlockToolbarControlState => ({ enabled: true });
const locked = (reason: string): BlockToolbarControlState => ({ enabled: false, reason });

/**
 * The state of every control of a Block's toolbar. `transferLock` is why the
 * Block cannot be copied, duplicated or moved to another section, when it
 * cannot (see structureLockReason); `deletable` says whether the carátula
 * Block was added by the appraiser (the template's are hidden, not deleted).
 */
export function blockToolbarState(input: {
  kind: BlockToolbarKind;
  readOnly?: boolean;
  transferLock?: string | null;
  deletable?: boolean;
}): BlockToolbarState {
  const { kind, readOnly = false, transferLock = null, deletable = true } = input;
  const transfer = transferLock ? locked(transferLock) : enabled();
  const state: BlockToolbarState = (() => {
    switch (kind) {
      case "content":
        return {
          transfer,
          move: enabled(),
          visibility: enabled(),
          pageBreak: enabled(),
          alignment: enabled(),
          add: enabled(),
          subblock: enabled(),
          delete: enabled(),
        };
      case "caratula-block":
        return {
          transfer,
          move: enabled(),
          visibility: enabled(),
          pageBreak: locked(CARATULA_PAGE_BREAK_REASON),
          alignment: enabled(),
          add: enabled(),
          subblock: enabled(),
          delete: deletable ? enabled() : locked(TEMPLATE_BLOCK_DELETE_REASON),
        };
      case "caratula-fixed":
        return {
          transfer,
          move: locked(CARATULA_FIXED_BLOCK_REASON),
          visibility: enabled(),
          pageBreak: locked(CARATULA_PAGE_BREAK_REASON),
          alignment: enabled(),
          add: locked(CARATULA_FIXED_BLOCK_REASON),
          subblock: locked(CARATULA_FIXED_BLOCK_REASON),
          delete: locked(CARATULA_FIXED_BLOCK_REASON),
        };
      case "generated":
        return {
          transfer: locked(transferLock ?? GENERATED_BLOCK_REASON),
          move: enabled(),
          visibility: enabled(),
          pageBreak: enabled(),
          alignment: enabled(),
          add: locked(GENERATED_BLOCK_REASON),
          subblock: locked(GENERATED_BLOCK_REASON),
          delete: locked(GENERATED_BLOCK_DELETE_REASON),
        };
    }
  })();
  if (!readOnly) return state;
  return Object.fromEntries(
    BLOCK_TOOLBAR_CONTROLS.map((control) => [control, state[control].enabled ? locked(READ_ONLY_REASON) : state[control]]),
  ) as BlockToolbarState;
}

/** The reasons of the controls that are disabled, by control; an enabled control has none. */
export function blockToolbarLocks(state: BlockToolbarState): Partial<Record<BlockToolbarControl, string>> {
  return Object.fromEntries(
    BLOCK_TOOLBAR_CONTROLS.filter((control) => !state[control].enabled).map((control) => [control, state[control].reason ?? ""]),
  );
}

/** The controls of a toolbar state, in the order they are printed. */
export function blockToolbarControls(state: BlockToolbarState): BlockToolbarControl[] {
  return BLOCK_TOOLBAR_CONTROLS.filter((control) => control in state);
}

/* ------------------------------------------------------------------ */
/*  Labels of the editor's structure                                   */
/* ------------------------------------------------------------------ */

/**
 * One word for each level of the document, in every section: a tab is a
 * "sección", what it holds are "bloques" and inside them "subbloques". The
 * button that adds a Block says so ("+ Sección" used to create a Block).
 */
export const BLOCK_TERM = "bloque";
export const ADD_BLOCK_LABEL = "Bloque";
export const SUBBLOCK_TERM = "subbloque";
export const ADD_SUBBLOCK_LABEL = "Subbloque";
