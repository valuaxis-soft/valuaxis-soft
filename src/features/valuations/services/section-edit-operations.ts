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

/** Removes a section the appraiser added. Registry sections are hidden, never removed. */
export function removeCustomSection(sections: AppSection[], sectionId: string): AppSection[] {
  if (!isCustomSectionId(sectionId) || !sections.some((section) => section.id === sectionId)) return sections;
  return sections.filter((section) => section.id !== sectionId);
}
