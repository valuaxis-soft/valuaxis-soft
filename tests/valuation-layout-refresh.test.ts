/**
 * Video 8.3 (24 Nov 2026): a valuation worked before a change of format
 * («Bugambilias») kept the conclusion it was created with: the approaches as
 * plain concepts and no concluded value in its box. The refresh adds what the
 * current format needs, keeps what the appraiser did, runs once, and
 * «Deshacer» takes back exactly that.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONCLUSION_KEYS, isConcludedValueBlock } from "../src/features/valuations/calculation/conclusion-document";
import type { AppSection, Block, Concept } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import {
  LAYOUT_VERSION,
  layoutRefreshPolicy,
  layoutStepsFor,
  layoutVersionOf,
  refreshDocumentLayout,
  revertLayoutRefresh,
} from "../src/features/valuations/services/layout-refresh";

const concept = (id: string, label: string, value = ""): Concept => ({ id, label, value, enabled: true });

/** The conclusion as a firm template of before carried it: the approaches, the appraiser's title and text, no concluded value. */
function oldConclusion(extra: Concept[] = []): AppSection {
  const fresh = createInitialSections().find((section) => section.id === "conclusiones")!;
  const block: Block = {
    ...fresh.blocks[0],
    id: "conclusiones-block-1",
    title: "CONCLUSIÓN DEL VALOR",
    enabled: true,
    concepts: [
      concept("c-1", "Valor por enfoque de costos", "8510000.00"),
      concept("c-2", "Valor por enfoque de mercado", "8260000.00"),
      { ...concept("c-3", "Valor por enfoque de ingresos", "3640000.00"), enabled: false },
      ...extra,
      concept("c-9", "Observaciones finales", "Texto propio del valuador."),
    ],
    apartados: [],
  };
  const declarations: Block = { ...fresh.blocks[1], id: "conclusiones-block-2", title: "DECLARACIONES, SUPUESTOS Y CONDICIONES LIMITANTES." };
  return { ...fresh, blocks: [block, declarations] };
}

function document(conclusion: AppSection): AppSection[] {
  return createInitialSections().map((section) => (section.id === "conclusiones" ? conclusion : section));
}

const conclusionOf = (sections: AppSection[]) => sections.find((section) => section.id === "conclusiones")!;

test("a fresh valuation is already in the current format: nothing changes and it is not marked unsaved", () => {
  const sections = createInitialSections();
  const result = refreshDocumentLayout(sections);
  assert.equal(result.changes.length, 0);
  assert.equal(result.sections, sections);
});

test("an old conclusion gets the concluded value and its words after the resumen, keeping every concept, value and flag", () => {
  const sections = document(oldConclusion());
  const result = refreshDocumentLayout(sections);
  const block = conclusionOf(result.sections).blocks[0];
  assert.deepEqual(block.concepts.map((item) => item.label), [
    "Valor por enfoque de costos", "Valor por enfoque de mercado", "Valor por enfoque de ingresos",
    "Valor concluido", "Valor concluido con letra", "Observaciones finales",
  ]);
  assert.ok(isConcludedValueBlock(block), "the conclusion prints in the despacho's format");
  assert.equal(block.concepts.find((item) => item.label === "Valor concluido")?.calculationKey, CONCLUSION_KEYS.value);
  assert.equal(block.concepts[2].enabled, false, "the hidden approach stays hidden");
  assert.equal(block.concepts[0].value, "8510000.00");
  assert.equal(block.concepts.at(-1)?.value, "Texto propio del valuador.");
  assert.equal(conclusionOf(result.sections).blocks[1].title, "DECLARACIONES, SUPUESTOS Y CONDICIONES LIMITANTES.");
  assert.equal(layoutVersionOf(result.sections), LAYOUT_VERSION);
  // The other sections are the same objects: nothing else is touched.
  sections.forEach((section, index) => {
    if (section.id !== "conclusiones" && section.id !== "caratula") assert.equal(result.sections[index], section);
  });
});

test("running it twice changes nothing the second time", () => {
  const once = refreshDocumentLayout(document(oldConclusion())).sections;
  const twice = refreshDocumentLayout(once);
  assert.equal(twice.changes.length, 0);
  assert.equal(twice.sections, once);
});

test("a concluded value the appraiser renamed before it had its key keeps his name and value and takes the key", () => {
  const sections = document(oldConclusion([concept("c-4", "Valor comercial", "8500000.00"), concept("c-5", "Cifra con letra", "OCHO MILLONES…")]));
  const result = refreshDocumentLayout(sections);
  const block = conclusionOf(result.sections).blocks[0];
  assert.equal(block.concepts.length, 6, "nothing added");
  assert.deepEqual(
    block.concepts.filter((item) => item.calculationKey).map((item) => [item.label, item.value, item.calculationKey]),
    [["Valor comercial", "8500000.00", CONCLUSION_KEYS.value], ["Cifra con letra", "OCHO MILLONES…", CONCLUSION_KEYS.words]],
  );
  assert.deepEqual(result.changes.map((change) => change.kind), ["concept-keyed", "concept-keyed"]);
});

test("a conclusion without any resumen gets the template's block first; the appraiser's blocks follow in their order", () => {
  const conclusion = oldConclusion();
  const sections = document({ ...conclusion, blocks: [conclusion.blocks[1]] });
  const result = refreshDocumentLayout(sections);
  const blocks = conclusionOf(result.sections).blocks;
  assert.equal(blocks.length, 2);
  assert.ok(isConcludedValueBlock(blocks[0]));
  assert.equal(blocks[1], conclusion.blocks[1]);
});

test("«Deshacer» takes back only what the refresh did and keeps the document from refreshing again on its own", () => {
  const sections = document(oldConclusion([concept("c-4", "Valor comercial", "8500000.00")]));
  const { sections: refreshed, changes } = refreshDocumentLayout(sections);
  // The appraiser writes after the refresh; the undo keeps it.
  const edited = refreshed.map((section) => (section.id !== "conclusiones" ? section : {
    ...section,
    blocks: section.blocks.map((block, index) => (index ? block : { ...block, concepts: block.concepts.map((item) => (item.id === "c-9" ? { ...item, value: "Escrito después" } : item)) })),
  }));
  const reverted = revertLayoutRefresh(edited, changes);
  const block = conclusionOf(reverted).blocks[0];
  assert.deepEqual(block.concepts.map((item) => item.label), ["Valor por enfoque de costos", "Valor por enfoque de mercado", "Valor por enfoque de ingresos", "Valor comercial", "Observaciones finales"]);
  assert.equal(block.concepts.find((item) => item.id === "c-4")?.calculationKey, undefined);
  assert.equal(block.concepts.at(-1)?.value, "Escrito después");
  assert.equal(layoutVersionOf(reverted), LAYOUT_VERSION);
  assert.equal(layoutStepsFor({ policy: "all", version: layoutVersionOf(reverted) }).length, 0, "not refreshed again on opening");
  assert.equal(layoutStepsFor({ policy: "all", version: layoutVersionOf(reverted), force: true }).length > 0, true, "the button still can");
});

test("the policy: all takes every pending step; new only those shipped before the valuation was created", () => {
  assert.equal(layoutRefreshPolicy(undefined), "all");
  assert.equal(layoutRefreshPolicy(" NEW "), "new");
  assert.equal(layoutStepsFor({ policy: "all", version: 0, createdAt: "2026-10-01T12:00:00Z" }).length, LAYOUT_VERSION);
  assert.equal(layoutStepsFor({ policy: "new", version: 0, createdAt: "2026-10-01T12:00:00Z" }).length, 0);
  assert.equal(layoutStepsFor({ policy: "new", version: 0, createdAt: "2026-11-25T12:00:00Z" }).length, LAYOUT_VERSION);
  assert.equal(layoutStepsFor({ policy: "all", version: LAYOUT_VERSION }).length, 0);
});
