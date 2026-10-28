/**
 * How the sections of the dictamen are laid out: chapters numbered in roman
 * numerals and the annexes after the conclusion ("ANEXO 1", "ANEXO 2"…), and
 * where each section, block and apartado starts on the printed pages.
 */
import { getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";

/** A chapter carries a roman numeral; an annex prints "ANEXO n" and numbers nothing inside it. */
export type SectionDocumentRole = "chapter" | "annex";

/**
 * Where a block or an apartado starts: "auto" flows after the one before and
 * goes to the next page with its first content when they do not fit together;
 * "new-page" always opens a page; "continue" starts right where the one before
 * ended, its title staying at the foot of the page if its content goes on.
 */
export type PageBreakMode = "auto" | "new-page" | "continue";

/**
 * Where a section starts: on a page of its own (as always), or right after the
 * section before, on the same page, so it leaves no empty space.
 */
export type SectionPageBreak = "new-page" | "continue";

export const PAGE_BREAK_LABELS: Record<PageBreakMode, string> = {
  auto: "Automático",
  "new-page": "Iniciar en nueva página",
  continue: "Continuar donde terminó el anterior",
};

export const SECTION_PAGE_BREAK_LABELS: Record<SectionPageBreak, string> = {
  "new-page": "Iniciar en nueva página",
  continue: "Continuar donde terminó la sección anterior",
};

export function isSectionDocumentRole(value: unknown): value is SectionDocumentRole {
  return value === "chapter" || value === "annex";
}

export function isPageBreakMode(value: unknown): value is PageBreakMode {
  return value === "auto" || value === "new-page" || value === "continue";
}

export function isSectionPageBreak(value: unknown): value is SectionPageBreak {
  return value === "new-page" || value === "continue";
}

/** The page break of a block or apartado; one saved before the choice had three values reads from its old flag. */
export function resolvePageBreak(item: { pageBreak?: PageBreakMode; startOnNewPage?: boolean }): PageBreakMode {
  if (isPageBreakMode(item.pageBreak)) return item.pageBreak;
  return item.startOnNewPage ? "new-page" : "auto";
}

/** The patch that sets the page break, keeping the old flag in step for whatever still reads it. */
export function pageBreakPatch(mode: PageBreakMode): { pageBreak: PageBreakMode; startOnNewPage: boolean } {
  return { pageBreak: mode, startOnNewPage: mode === "new-page" };
}

type StructuredSection = { id: string; enabled?: boolean; documentRole?: SectionDocumentRole };

const isConclusionSection = (section: { id: string }) => getCanonicalSectionKey(section.id) === "CONCLUSIONES";

/**
 * Whether the section is an annex: as the appraiser chose it, or, when he did
 * not choose, because it comes after the conclusion. The carátula and the
 * conclusion are always chapters.
 */
export function sectionDocumentRole(section: StructuredSection, sections: readonly StructuredSection[]): SectionDocumentRole {
  if (section.id === "caratula" || isConclusionSection(section)) return "chapter";
  if (isSectionDocumentRole(section.documentRole)) return section.documentRole;
  const conclusionIndex = sections.findIndex(isConclusionSection);
  if (conclusionIndex === -1) return "chapter";
  return sections.indexOf(section) > conclusionIndex ? "annex" : "chapter";
}

/** Whether the appraiser may choose between chapter and annex: every section but the carátula and the conclusion. */
export function canChooseDocumentRole(section: { id: string }) {
  return section.id !== "caratula" && !isConclusionSection(section);
}

/** The label an annex prints when the appraiser did not write his own. */
export const annexLabel = (position: number) => `ANEXO ${position}`;

/** Where a new section goes: a chapter just before the conclusion, an annex at the end. */
export function insertSectionByRole<T extends { id: string }>(sections: T[], section: T, role: SectionDocumentRole): T[] {
  const conclusionIndex = sections.findIndex(isConclusionSection);
  if (role === "annex" || conclusionIndex === -1) return [...sections, section];
  return [...sections.slice(0, conclusionIndex), section, ...sections.slice(conclusionIndex)];
}

/**
 * The printed sections in groups that share their pages: a section that
 * continues the one before joins its group, so the paginator lays them out
 * as one flow; any other starts a group, and so a page, of its own. The
 * carátula never shares its pages.
 */
export function groupSectionsForPrint<T extends { id: string; pageBreak?: SectionPageBreak }>(sections: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const section of sections) {
    const previous = groups.at(-1);
    const joins = section.pageBreak === "continue"
      && section.id !== "caratula"
      && previous !== undefined
      && previous[0].id !== "caratula";
    if (joins) previous.push(section);
    else groups.push([section]);
  }
  return groups;
}
