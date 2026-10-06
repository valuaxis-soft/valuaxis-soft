import type { Concept } from "@/features/valuations/model";

/** Average characters per value from which a list of concepts reads as prose (definitions, declarations). */
export const LONG_TEXT_AVERAGE_LENGTH = 100;

/**
 * Whether a container's concepts are mostly long texts. The printed document
 * sets those a little larger; the whole list changes size together so a short
 * definition does not sit smaller than its neighbours.
 */
export function isLongTextList(concepts: Array<Pick<Concept, "value" | "enabled">>) {
  const lengths = concepts
    .filter((concept) => concept.enabled !== false)
    .map((concept) => concept.value.trim().length)
    .filter((length) => length > 0);
  if (!lengths.length) return false;
  const total = lengths.reduce((sum, length) => sum + length, 0);
  return total / lengths.length >= LONG_TEXT_AVERAGE_LENGTH;
}
