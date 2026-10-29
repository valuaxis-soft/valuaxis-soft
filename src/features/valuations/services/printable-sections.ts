import type { AppSection, Block } from "@/features/valuations/model";
import { NOTICE_SECTION_KEYS } from "@/features/accreditation/accreditation-notice";
import { findSectionDefinition, getCanonicalSectionKey } from "@/features/valuations/sections/section-registry";
import { groupSectionsForPrint } from "./document-structure";
import { excludedReportApproaches, sectionForReport } from "./report-approaches";

/**
 * The sections the dictamen prints, in the groups that share their pages: the
 * visible ones, without the approaches left out of the dictamen, a section
 * that continues the one before joined to its group.
 *
 * With `unaccreditedNotice`, Consideraciones and Conclusión always print, as
 * they carry the "DOCUMENTO SIN VALIDEZ OFICIAL" notice: one the appraiser hid
 * or deleted prints only its heading and the notice, none of its content.
 */
export function printableSectionGroups(sections: AppSection[], options: { unaccreditedNotice?: boolean } = {}): AppSection[][] {
  const excluded = excludedReportApproaches(sections);
  const source = options.unaccreditedNotice ? withNoticeSections(sections) : sections;
  const printed = source
    .filter((section) => section.enabled !== false)
    .map((section) => sectionForReport(section, excluded))
    .filter((section): section is AppSection => section !== null);
  return groupSectionsForPrint(printed);
}

const NOTICE_SECTION_HEADINGS: Record<(typeof NOTICE_SECTION_KEYS)[number], { id: string; title: string; heading: string }> = {
  CONSIDERACIONES: { id: "consideraciones", title: "CONSIDERACIONES", heading: "CONSIDERACIONES PREVIAS AL AVALÚO" },
  CONCLUSIONES: { id: "conclusiones", title: "CONCLUSIÓN", heading: "CONCLUSIÓN DEL VALOR" },
};

function noticeHeadingBlock(heading: string): Block {
  return {
    id: "unaccredited-notice-heading",
    title: heading,
    sectionLabel: "",
    enabled: true,
    required: true,
    concepts: [],
    apartados: [],
    tables: [],
    images: [],
  };
}

function withNoticeSections(sections: AppSection[]): AppSection[] {
  let result = sections;
  for (const key of NOTICE_SECTION_KEYS) {
    const { id, title, heading } = NOTICE_SECTION_HEADINGS[key];
    const index = result.findIndex((section) => getCanonicalSectionKey(section.id) === key);
    if (index >= 0) {
      if (result[index].enabled !== false) continue;
      const hidden = result[index];
      const stub: AppSection = { ...hidden, enabled: true, removed: undefined, excludedFromReport: undefined, blocks: [noticeHeadingBlock(heading)] };
      result = result.map((section, position) => (position === index ? stub : section));
      continue;
    }
    // Not in the document at all: at its place in the registry's order.
    const order = findSectionDefinition(key)?.order ?? Number.MAX_SAFE_INTEGER;
    const stub: AppSection = { id, label: "", title, sourceFile: "", enabled: true, required: true, blocks: [noticeHeadingBlock(heading)] };
    const before = result.findIndex((section) => (findSectionDefinition(section.id)?.order ?? -1) > order);
    result = before < 0 ? [...result, stub] : [...result.slice(0, before), stub, ...result.slice(before)];
  }
  return result;
}
