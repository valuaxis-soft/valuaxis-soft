import {
  getValuationByPublicId,
  type ValuationSectionDto,
} from "@/features/valuations/repositories/valuation.repository";
import { findSectionDefinition, normalizeSectionKey } from "@/features/valuations/sections/section-registry";

export function resolveSection(sections: ValuationSectionDto[], sectionKey: string) {
  const normalizedKey = normalizeSectionKey(sectionKey);
  return sections.find(
    (section) =>
      section.id === sectionKey ||
      section.label === sectionKey ||
      normalizeSectionKey(section.id) === normalizedKey ||
      normalizeSectionKey(section.label) === normalizedKey ||
      normalizeSectionKey(section.title) === normalizedKey,
  );
}

export async function getValuationSection(input: {
  organizationId: number;
  sectionKey: string;
  valuationId: string;
}) {
  const valuation = await getValuationByPublicId(input.valuationId, input.organizationId);
  if (!valuation) return null;

  const section = resolveSection(valuation.sections, input.sectionKey);
  if (!section) return null;

  return {
    definition: findSectionDefinition(input.sectionKey) ?? null,
    section,
    valuation,
  };
}
