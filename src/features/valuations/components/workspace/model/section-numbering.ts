import type { AppSection, Block } from "@/features/valuations/model";
import { ensureTerrenoSections } from "@/features/valuations/sections/terreno";
import { blockContentHidden } from "@/features/valuations/services/hidden-content";
import { annexLabel, sectionDocumentRole } from "@/features/valuations/services/document-structure";
import {
  blockLeftOutOfReport,
  excludedReportApproaches,
  sectionLeftOutOfReport,
} from "@/features/valuations/services/report-approaches";

export function normalizeEditorSections(sections: AppSection[]) {
  return ensureTerrenoSections(
    resequenceSections(sections),
  );
}

/**
 * Name shown in tabs and headings. Hidden sections have no number (numbering
 * skips them) and their stored label is only the section key.
 */
export function sectionDisplayName(section: Pick<AppSection, "enabled" | "label" | "title">) {
  if (section.enabled === false) return `${section.title} · oculta`;
  return section.label ? `${section.label}. ${section.title}` : section.title;
}

/** The block without the annex mark: it belongs to a chapter. */
function asChapterBlock(block: Block): Block {
  if (block.annex === undefined) return block;
  const { annex: _annex, ...rest } = block;
  return rest;
}

/**
 * Numbers the document. Chapters take roman numerals and so do their blocks,
 * one count across the document; the sections after the conclusion (or the
 * ones the appraiser made annexes) print "ANEXO 1", "ANEXO 2"… on the title of
 * their first block and number nothing inside. A section or a page left out
 * of the dictamen takes no number.
 */
export function resequenceSections(sections: AppSection[]) {
  const excluded = excludedReportApproaches(sections);
  let sectionIndex = 0;
  let annexIndex = 0;
  let globalBlockIndex = 0;
  return sections.map((section) => {
    if (section.enabled === false) return section;
    // A blank number is not printed: the section is not in the dictamen.
    if (sectionLeftOutOfReport(section)) {
      return { ...section, label: "", blocks: section.blocks.map((block) => ({ ...asChapterBlock(block), sectionLabel: "" })) };
    }
    const prints = (block: Block) => block.enabled && !blockContentHidden(block) && !blockLeftOutOfReport(block, excluded);

    if (sectionDocumentRole(section, sections) === "annex") {
      annexIndex += 1;
      const label = section.annexTitle?.trim() || annexLabel(annexIndex);
      let labeled = false;
      return {
        ...section,
        label,
        blocks: section.blocks.map((block) => {
          // The annex's label goes on the title of its first printed block; the rest print their titles only.
          const takesLabel = !labeled && prints(block);
          if (takesLabel) labeled = true;
          return { ...block, annex: true, sectionLabel: takesLabel ? label : "" };
        }),
      };
    }

    // Sections the appraiser adds may push the count past the registry's: the numerals keep going.
    const label = toRomanNumeral(sectionIndex + 1);
    sectionIndex += 1;
    return {
      ...section,
      label,
      blocks: section.blocks.map((original, blockIndex) => {
        const block = asChapterBlock(original);
        if (section.id === "caratula") {
          return { ...block, sectionLabel: `${label}.${blockIndex + 1}` };
        }
        // A block that prints nothing (hidden, all its content hidden, or left out of the dictamen) takes no number.
        if (!prints(block)) return { ...block, sectionLabel: "" };
        globalBlockIndex += 1;
        return { ...block, sectionLabel: toRomanNumeral(globalBlockIndex) };
      }),
    };
  });
}

function toRomanNumeral(position: number) {
  const digits: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remainder = position;
  let result = "";
  for (const [value, digit] of digits) {
    while (remainder >= value) {
      result += digit;
      remainder -= value;
    }
  }
  return result;
}
