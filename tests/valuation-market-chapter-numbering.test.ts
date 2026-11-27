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

test("the first comparable renumbers nothing: the empty template pages took no numeral and its fichas print without one (video 8.14); tabs and dictamen read the same", () => {
  const before = resequenceSections(createInitialSections());
  const after = resequenceSections(withFirstComparable(before));

  // Before: of the three template pages of the market only the summary prints; the comparables and the
  // homologation are tables with nothing written, which print nothing and take no numeral (FAL-17/18).
  assert.equal(numerals(before, "MERCADO_VENTA"), 1);
  // After: the calculation's page stands in for the three, one block with its apartados;
  // the comparable's ficha adds a page to «Croquis y fotografías de comparables», with no numeral of its own.
  assert.equal(numerals(after, "MERCADO_VENTA"), 1);
  assert.equal(numerals(after, "CROQUIS_COMPARABLES"), numerals(before, "CROQUIS_COMPARABLES"));
  const croquis = after.find((item) => getCanonicalSectionKey(item.id) === "CROQUIS_COMPARABLES")!;
  const fichas = croquis.blocks.find((block) => block.id.endsWith("-fotos"))!;
  assert.equal(fichas.sectionLabel, "");

  const shift = (key: string) => fromRoman(tabs(before)[key]) - fromRoman(tabs(after)[key]);
  for (const key of ["MERCADO_VENTA", "MERCADO_RENTAS", "CROQUIS_COMPARABLES", "CONCLUSIONES"]) {
    assert.equal(shift(key), 0, key);
  }

  // The tabs read exactly what the dictamen prints, before and after.
  assert.deepEqual(tabs(before), printed(before));
  assert.deepEqual(tabs(after), printed(after));
});

test("the fichas of two markets push no chapter; with the chapter's own block hidden, the first ficha block carries its numeral", () => {
  const rent: MarketCalculationDto = { settings: defaultMarketSettings("INMUEBLE_RENTA"), comparables: [{ ...comparable, id: "c-2" }], locked: false };
  const withBoth = (sections: AppSection[]) => withFirstComparable(sections).map((section) =>
    getCanonicalSectionKey(section.id) === "CROQUIS_COMPARABLES"
      ? withGeneratedBlocks(section, "INMUEBLE_RENTA", marketPhotoBlocks(rent), { kind: "fotos", position: "end" })
      : section);
  const before = resequenceSections(createInitialSections());
  const after = resequenceSections(withBoth(before));
  assert.equal(numerals(after, "CROQUIS_COMPARABLES"), 1);
  assert.equal(tabs(after).CONCLUSIONES, tabs(before).CONCLUSIONES);

  // The template's block hidden: the chapter keeps one numeral, on its first ficha block.
  const hidden = resequenceSections(after.map((section) =>
    getCanonicalSectionKey(section.id) === "CROQUIS_COMPARABLES"
      ? { ...section, blocks: section.blocks.map((block) => (block.id.endsWith("-fotos") ? block : { ...block, enabled: false })) }
      : section));
  const croquis = hidden.find((item) => getCanonicalSectionKey(item.id) === "CROQUIS_COMPARABLES")!;
  assert.deepEqual(croquis.blocks.filter((block) => block.enabled).map((block) => Boolean(block.sectionLabel)), [true, false]);
  assert.equal(croquis.label, tabs(before).CROQUIS_COMPARABLES);
  assert.equal(tabs(hidden).CONCLUSIONES, tabs(before).CONCLUSIONES);
  assert.deepEqual(tabs(hidden), printed(hidden));
});
