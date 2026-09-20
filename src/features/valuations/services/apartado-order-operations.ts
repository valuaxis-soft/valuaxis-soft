import type { Apartado } from "../model";

/* ------------------------------------------------------------------ */
/*  Descriptor model                                                   */
/* ------------------------------------------------------------------ */

/**
 * Descriptor for an Apartado reorder operation.
 *
 * Moves a single SubBlock within its parent Block's apartados array.
 * Vertical-only: before or after a target SubBlock.
 */
export type ApartadoMoveDescriptor = {
  /** ID of the SubBlock to move. */
  sourceId: string;
  /** ID of the target SubBlock. */
  targetId: string;
  /** Whether to place the source before or after the target. */
  placement: "before" | "after";
};

/* ------------------------------------------------------------------ */
/*  Result type                                                        */
/* ------------------------------------------------------------------ */

export type ApartadoMoveResult = {
  /** The reordered Apartado array (same reference if unchanged). */
  apartados: Apartado[];
  /** Whether the array was modified. */
  changed: boolean;
};

/* ------------------------------------------------------------------ */
/*  Pure movement engine                                               */
/* ------------------------------------------------------------------ */

/**
 * Reorder SubBlocks within a Block.
 *
 * Immutable: returns a new array when changed, same reference when unchanged.
 * Preserves every SubBlock object reference — only array order changes.
 *
 * Rules:
 * - invalid source → unchanged
 * - invalid target → unchanged
 * - same source/target → unchanged
 * - no mutation, no duplication, no loss
 * - IDs preserved
 */
export function moveApartado(
  subBlocks: Apartado[],
  descriptor: ApartadoMoveDescriptor,
): ApartadoMoveResult {
  const { sourceId, targetId, placement } = descriptor;

  if (sourceId === targetId) {
    return { apartados: subBlocks, changed: false };
  }

  const sourceIdx = subBlocks.findIndex((sb) => sb.id === sourceId);
  if (sourceIdx < 0) {
    return { apartados: subBlocks, changed: false };
  }

  const targetIdx = subBlocks.findIndex((sb) => sb.id === targetId);
  if (targetIdx < 0) {
    return { apartados: subBlocks, changed: false };
  }

  const next = [...subBlocks];
  const [moved] = next.splice(sourceIdx, 1);

  // After removing the source, recalculate target index
  const adjustedTargetIdx = next.findIndex((sb) => sb.id === targetId);
  const insertIdx = placement === "before" ? adjustedTargetIdx : adjustedTargetIdx + 1;

  next.splice(insertIdx, 0, moved);

  return { apartados: next, changed: true };
}
