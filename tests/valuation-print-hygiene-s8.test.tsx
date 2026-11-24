/**
 * Audit of week 8 (23 nov 2026): the dictamen prints no empty concept (FAL-31),
 * no «Campo sin título», no block of empty tables such as INDIRECTOS (FAL-17),
 * and such a block takes no numeral, so the editor's tabs read what the
 * dictamen prints (FAL-18).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { resequenceSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import type { Block, Concept } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { getCanonicalSectionKey } from "../src/features/valuations/sections/section-registry";
import { formatConceptTitleWithColon } from "../src/features/valuations/services/concept-title";
import { blockPrintsNothing } from "../src/features/valuations/services/hidden-content";
import { printableSectionGroups } from "../src/features/valuations/services/printable-sections";

const render = (block: Block) => {
  const items = documentBlockFlowItems(block, { renderTitleBar: true });
  return renderToStaticMarkup(createElement(Fragment, null, ...items.map((item) => createElement(Fragment, { key: item.id }, item.node))));
};

const concept = (id: string, label: string, value: string): Concept => ({ id, label, value, enabled: true });
const block = (concepts: Concept[], tables: Block["tables"] = []): Block => ({
  id: "b", title: "TERRENO", sectionLabel: "V", enabled: true, required: false, concepts, apartados: [], tables, images: [],
});

test("FAL-31: an empty concept prints neither «Nuevo concepto:» nor «—»; one written prints", () => {
  const html = render(block([concept("a", "Nuevo concepto", ""), concept("b", "Calle", "  "), concept("c", "Topografía", "Plano")]));
  assert.doesNotMatch(html, /Nuevo concepto|Calle|—/);
  assert.match(html, /Topografía:/);
  assert.match(html, /Plano/);
});

test("FAL-31: a title deleted, stored as «Campo sin título», prints no title", () => {
  assert.equal(formatConceptTitleWithColon("Campo sin título"), "");
  assert.equal(formatConceptTitleWithColon("Superficie"), "Superficie:");
  const html = render(block([concept("a", "Campo sin título", "Lote en esquina")]));
  assert.doesNotMatch(html, /Campo sin título/);
  assert.match(html, /Lote en esquina/);
});

test("FAL-17: a block of tables with nothing written prints nothing, not even its title", () => {
  const empty = { id: "t", title: "INDIRECTOS", columns: ["Concepto", "Porcentaje", "Importe", "Observaciones"], rows: [["", "", "", ""]], enabled: true };
  const indirects = { ...block([], [empty]), title: "INDIRECTOS" };
  assert.equal(blockPrintsNothing(indirects), true);
  assert.equal(render(indirects), "");
  const written = { ...indirects, tables: [{ ...empty, rows: [["Proyecto", "5%", "", ""]] }] };
  assert.equal(blockPrintsNothing(written), false);
  assert.match(render(written), /Proyecto/);
  // A block still to be written (a concept without value) keeps its title as a heading.
  assert.equal(blockPrintsNothing(block([concept("a", "Calle", "")])), false);
});

test("FAL-17/18: the INDIRECTOS template takes no numeral and the tabs read what the dictamen prints", () => {
  const sections = resequenceSections(createInitialSections());
  const indirects = sections.find((section) => getCanonicalSectionKey(section.id) === "INDIRECTOS");
  assert.ok(indirects);
  assert.equal(indirects.label, "");
  assert.deepEqual(indirects.blocks.map((item) => item.sectionLabel), [""]);
  // Every numeral the dictamen prints is the one the editor shows on that block, in the same order and without gaps.
  const printed = printableSectionGroups(sections).flat().flatMap((section) => section.blocks.filter((item) => item.enabled && item.sectionLabel && !item.annex).map((item) => item.sectionLabel));
  const tabs = sections.filter((section) => section.enabled !== false).flatMap((section) => section.blocks.filter((item) => item.sectionLabel && !item.annex).map((item) => item.sectionLabel));
  assert.deepEqual(printed, tabs);
});

test("FAL-18: a section deleted from the tab strip neither prints nor takes numerals, even turned on again", () => {
  const sections = createInitialSections().map((section) => (getCanonicalSectionKey(section.id) === "INGRESOS" ? { ...section, removed: true, enabled: true } : section));
  const numbered = resequenceSections(sections);
  const income = numbered.find((section) => getCanonicalSectionKey(section.id) === "INGRESOS")!;
  assert.equal(income.label, "");
  assert.ok(income.blocks.every((item) => !item.sectionLabel));
  assert.ok(!printableSectionGroups(numbered).flat().some((section) => getCanonicalSectionKey(section.id) === "INGRESOS"));
});
