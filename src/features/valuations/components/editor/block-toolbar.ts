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
  /**
   * A Block of the carátula: the template's ("Datos del bien", the assumptions,
   * the conclusion) and the appraiser's, all with the same controls (video 5.5).
   */
  | "caratula-block"
  /** A Block the calculation writes: its figures are edited in the calculation panel. */
  | "generated";

export const GENERATED_BLOCK_REASON = "Lo escribe el cálculo: sus conceptos y tablas se editan en el panel de cálculo.";
export const GENERATED_BLOCK_TITLE_REASON = "El título lo pone el cálculo.";
export const GENERATED_BLOCK_DELETE_REASON = "Lo escribe el cálculo: el cálculo lo volvería a crear. Si no debe imprimirse, ocúltalo.";
export const CARATULA_PAGE_BREAK_REASON = "La carátula se imprime en su propia página: sus bloques no tienen salto de página.";
/** The only conclusion of the carátula prints the commercial value the calculation writes, with its words. */
export const CARATULA_CONCLUSION_DELETE_REASON =
  "Este bloque imprime el valor comercial y la cifra en letras que escribe el cálculo: no se elimina. Puedes moverlo, copiarlo o duplicarlo.";
export const READ_ONLY_REASON = "El avalúo es de solo lectura.";

const enabled = (): BlockToolbarControlState => ({ enabled: true });
const locked = (reason: string): BlockToolbarControlState => ({ enabled: false, reason });

/**
 * The state of every control of a Block's toolbar. `transferLock` is why the
 * Block cannot be copied, duplicated or moved to another section, when it
 * cannot (see structureLockReason); `deleteLock` is why it cannot be deleted
 * (the only conclusion of the carátula).
 */
export function blockToolbarState(input: {
  kind: BlockToolbarKind;
  readOnly?: boolean;
  transferLock?: string | null;
  deleteLock?: string | null;
}): BlockToolbarState {
  const { kind, readOnly = false, transferLock = null, deleteLock = null } = input;
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
          delete: deleteLock ? locked(deleteLock) : enabled(),
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
