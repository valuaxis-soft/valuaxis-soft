import assert from "node:assert/strict";
import test from "node:test";

import { MARKET_TEMPLATE_BLOCK_IDS, marketDocumentBlocks, marketPhotoBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { defaultMarketSettings, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { resequenceSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import type { AppSection } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { getCanonicalSectionKey } from "../src/features/valuations/sections/section-registry";
import { printableSectionGroups } from "../src/features/valuations/services/printable-sections";

/** An invented land for sale, with one photo, as «Pegar anuncio» leaves it. */
const comparable: ComparableDto = {
  id: "c-1", reference: 1, location: "Calle Inventada 245, col. Centro, C.P. 47180, Villa Ejemplo, Jalisco", area: 320, price: 1_850_000,
  landUse: null, shape: null, zone: null, frontage: 10, depth: null, topography: null, services: null, notes: null,
  sourceName: "Inmobiliaria Ejemplo", contactName: null, contactPhone: null, url: null, offerDate: null,
  photos: [{ id: "foto-1", title: "Anuncio", url: "/organizaciones/x/foto-1.jpg" }],
  factors: [],
};
const calculation: MarketCalculationDto = { settings: defaultMarketSettings("TERRENO_VENTA"), comparables: [comparable], locked: false };

/** What the calculation sync writes when the first comparable is saved (use-calculation-document-sync). */
function withFirstComparable(sections: AppSection[]) {
  return sections.map((section) => {
    const key = getCanonicalSectionKey(section.id);
    if (key === "MERCADO_VENTA") {
      return withGeneratedBlocks(section, "TERRENO_VENTA", marketDocumentBlocks(calculation, null), {
        placeholderIds: MARKET_TEMPLATE_BLOCK_IDS, comparables: calculation.comparables,
      });
    }
    if (key === "CROQUIS_COMPARABLES") return withGeneratedBlocks(section, "TERRENO_VENTA", marketPhotoBlocks(calculation), { kind: "fotos", position: "end" });
    return section;
  });
}

const tabs = (sections: AppSection[]) =>
  Object.fromEntries(sections.filter((item) => item.enabled !== false && item.label && !item.blocks.some((block) => block.annex)).map((item) => [getCanonicalSectionKey(item.id), item.label]));
/** The numeral the dictamen prints on the first numbered block of each chapter. */
const printed = (sections: AppSection[]) => Object.fromEntries(printableSectionGroups(sections).flat().flatMap((item) => {
  const first = item.blocks.find((block) => block.enabled && block.sectionLabel);
  return first && !first.annex ? [[getCanonicalSectionKey(item.id), first.sectionLabel]] : [];
}));
/** How many numerals a chapter takes. */
const numerals = (sections: AppSection[], key: string) =>
  sections.find((item) => getCanonicalSectionKey(item.id) === key)?.blocks.filter((block) => block.sectionLabel).length ?? 0;

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const fromRoman = (label: string) => [...label].reduce((total, char, index, all) =>
  total + (ROMAN[char] < (ROMAN[all[index + 1]] ?? 0) ? -ROMAN[char] : ROMAN[char]), 0);

test("the first comparable renumbers only after its photos' page: the empty template pages took no numeral; tabs and dictamen read the same", () => {
  const before = resequenceSections(createInitialSections());
  const after = resequenceSections(withFirstComparable(before));

  // Before: of the three template pages of the market only the summary prints; the comparables and the
  // homologation are tables with nothing written, which print nothing and take no numeral (FAL-17/18).
  assert.equal(numerals(before, "MERCADO_VENTA"), 1);
  // After: the calculation's page stands in for the three, one block with its apartados;
  // the comparable's photo adds a page to «Croquis y fotografías de comparables».
  assert.equal(numerals(after, "MERCADO_VENTA"), 1);
  assert.equal(numerals(after, "CROQUIS_COMPARABLES"), numerals(before, "CROQUIS_COMPARABLES") + 1);

  const shift = (key: string) => fromRoman(tabs(before)[key]) - fromRoman(tabs(after)[key]);
  assert.equal(shift("MERCADO_VENTA"), 0);
  assert.equal(shift("MERCADO_RENTAS"), 0);
  assert.equal(shift("CROQUIS_COMPARABLES"), 0);
  // One more after the page of the comparable's photos.
  assert.equal(shift("CONCLUSIONES"), -1);

  // The tabs read exactly what the dictamen prints, before and after.
  assert.deepEqual(tabs(before), printed(before));
  assert.deepEqual(tabs(after), printed(after));
});
