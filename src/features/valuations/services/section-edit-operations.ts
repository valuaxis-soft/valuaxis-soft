import type { AppSection } from "../model";
import { isCustomSectionId } from "../sections/section-registry";

/** The title a section the appraiser adds starts with; he renames it from the tab. */
export const NEW_SECTION_TITLE = "NUEVA SECCIÓN";

/** The longest tab title; the database keeps the section name in 220 characters. */
export const SECTION_TITLE_MAX = 120;

const sameTitle = (a: string, b: string) => a.trim().toLocaleUpperCase() === b.trim().toLocaleUpperCase();

/**
 * Renames a section's tab. The printed banner follows: a block titled like the
 * section (the one a custom section starts with) takes the new title too. An
 * empty title leaves the section as it was; the array is the same reference
 * when nothing changes.
 */
export function renameSection(sections: AppSection[], sectionId: string, title: string): AppSection[] {
  const next = title.trim().slice(0, SECTION_TITLE_MAX);
  const section = sections.find((item) => item.id === sectionId);
  if (!section || !next || next === section.title) return sections;
  return sections.map((item) => item.id !== sectionId ? item : {
    ...item,
    title: next,
    titleEdited: true,
    blocks: item.blocks.map((block) => (sameTitle(block.title, item.title) ? { ...block, title: next } : block)),
  });
}

/** Removes a section the appraiser added. */
export function removeCustomSection(sections: AppSection[], sectionId: string): AppSection[] {
  if (!isCustomSectionId(sectionId) || !sections.some((section) => section.id === sectionId)) return sections;
  return sections.filter((section) => section.id !== sectionId);
}

/** Whether the appraiser can delete or hide the section: a required one (carátula, datos generales, conclusión) stays. */
export function canRemoveSection(section: Pick<AppSection, "required">) {
  return !section.required;
}

/**
 * Deletes a section. One the appraiser added leaves the document; a registry
 * section stays in it hidden and marked removed, out of the tab strip, so it
 * is deleted for good once saved and can still be restored. A required
 * section is not deleted. The array is the same reference when nothing changes.
 */
export function removeSection(sections: AppSection[], sectionId: string): AppSection[] {
  const section = sections.find((item) => item.id === sectionId);
  if (!section || !canRemoveSection(section) || section.removed) return sections;
  if (section.custom || isCustomSectionId(sectionId)) return removeCustomSection(sections, sectionId);
  return sections.map((item) => (item.id === sectionId ? { ...item, enabled: false, removed: true } : item));
}

/** Brings back a registry section the appraiser deleted, visible, at its place. */
export function restoreSection(sections: AppSection[], sectionId: string): AppSection[] {
  const section = sections.find((item) => item.id === sectionId);
  if (!section?.removed) return sections;
  return sections.map((item) => {
    if (item.id !== sectionId) return item;
    const { removed: _removed, ...rest } = item;
    return { ...rest, enabled: true };
  });
}

/** The sections the tab strip shows: all but the deleted ones. */
export function listedSections(sections: AppSection[]) {
  return sections.some((section) => section.removed) ? sections.filter((section) => !section.removed) : sections;
}

/**
 * The document after the tab strip was reordered: the listed sections in
 * their new order, each deleted one kept after the listed section it followed.
 */
export function withListedOrder(sections: AppSection[], reordered: AppSection[]): AppSection[] {
  if (!sections.some((section) => section.removed)) return reordered;
  // The deleted sections that follow each listed one (null: those before the first).
  const removedAfter = new Map<string | null, AppSection[]>();
  let previousListed: string | null = null;
  for (const section of sections) {
    if (!section.removed) {
      previousListed = section.id;
      continue;
    }
    removedAfter.set(previousListed, [...(removedAfter.get(previousListed) ?? []), section]);
  }
  return [
    ...(removedAfter.get(null) ?? []),
    ...reordered.flatMap((section) => [section, ...(removedAfter.get(section.id) ?? [])]),
  ];
}
