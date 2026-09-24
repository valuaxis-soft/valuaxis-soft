import type { AppSection } from "@/features/valuations/model";
import { ensureTerrenoSections } from "@/features/valuations/sections/terreno";

const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"];

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

export function resequenceSections(sections: AppSection[]) {
  let sectionIndex = 0;
  let globalBlockIndex = 0;
  return sections.map((section) => {
    if (section.enabled === false) return section;
    const label = roman[sectionIndex] ?? `${sectionIndex + 1}`;
    sectionIndex += 1;
    return {
      ...section,
      label,
      blocks: section.blocks.map((block, blockIndex) => {
        if (section.id === "caratula") {
          return { ...block, sectionLabel: `${label}.${blockIndex + 1}` };
        }
        if (!block.enabled) return { ...block, sectionLabel: "" };
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
