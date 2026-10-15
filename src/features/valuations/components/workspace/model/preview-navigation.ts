import type { AppSection } from "@/features/valuations/model";

/** The sections the preview can browse: the ones that print, plus the one it shows now. */
function browsableSections(sections: Pick<AppSection, "id" | "enabled">[], currentId: string) {
  return sections.filter((section) => section.enabled !== false || section.id === currentId);
}

/**
 * The section before or after the one the preview shows, skipping hidden
 * sections; null at either end or when the current one is not in the list.
 */
export function adjacentPreviewSectionId(
  sections: Pick<AppSection, "id" | "enabled">[],
  currentId: string,
  direction: -1 | 1,
): string | null {
  const browsable = browsableSections(sections, currentId);
  const index = browsable.findIndex((section) => section.id === currentId);
  if (index < 0) return null;
  return browsable[index + direction]?.id ?? null;
}

/** "3 de 15": the place of the shown section among the ones that print. */
export function previewSectionPosition(sections: Pick<AppSection, "id" | "enabled">[], currentId: string) {
  const browsable = browsableSections(sections, currentId);
  return { index: browsable.findIndex((section) => section.id === currentId) + 1, total: browsable.length };
}
