import type { AppSection } from "../model";

/* ------------------------------------------------------------------ */
/*  Descriptor model                                                   */
/* ------------------------------------------------------------------ */

/**
 * Descriptor for a Section reorder operation.
 *
 * Moves a single AppSection within the sections array.
 * Vertical-only: before or after a target Section.
 */
export type SectionMoveDescriptor = {
  /** ID of the Section to move. */
  sourceId: string;
  /** ID of the target Section. */
  targetId: string;
  /** Whether to place the source before or after the target. */
  placement: "before" | "after";
};

/* ------------------------------------------------------------------ */
/*  Result type                                                        */
/* ------------------------------------------------------------------ */

export type SectionMoveResult = {
  /** The reordered AppSection array (same reference if unchanged). */
  sections: AppSection[];
  /** Whether the array was modified. */
  changed: boolean;
};

/* ------------------------------------------------------------------ */
/*  Pure movement engine                                               */
/* ------------------------------------------------------------------ */

/**
 * Reorder AppSections.
 *
 * Immutable: returns a new array when changed, same reference when unchanged.
 * Preserves every AppSection object reference — only array order changes.
 *
 * Rules:
 * - invalid source → unchanged
 * - invalid target → unchanged
 * - same source/target → unchanged
 * - no mutation, no duplication, no loss
 * - IDs preserved
 */
export function moveSection(
  sections: AppSection[],
  descriptor: SectionMoveDescriptor,
): SectionMoveResult {
  const { sourceId, targetId, placement } = descriptor;

  if (sourceId === targetId) {
    return { sections, changed: false };
  }

  const sourceIdx = sections.findIndex((s) => s.id === sourceId);
  if (sourceIdx < 0) {
    return { sections, changed: false };
  }

  const targetIdx = sections.findIndex((s) => s.id === targetId);
  if (targetIdx < 0) {
    return { sections, changed: false };
  }

  const next = [...sections];
  const [moved] = next.splice(sourceIdx, 1);

  // After removing the source, recalculate target index
  const adjustedTargetIdx = next.findIndex((s) => s.id === targetId);
  const insertIdx = placement === "before" ? adjustedTargetIdx : adjustedTargetIdx + 1;

  next.splice(insertIdx, 0, moved);

  return { sections: next, changed: true };
}
