import assert from "node:assert/strict";
import test from "node:test";

import { initialSectionsFor } from "../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { hydrateApartadoMetadata } from "../src/features/valuations/metadata";
import type { AppSection } from "../src/features/valuations/model";
import type { ValuationDetail } from "../src/features/valuations/repositories/valuation.repository";
import { createInitialSections } from "../src/features/valuations/sections";

const consideraciones = (sections: AppSection[]) => sections.find((section) => section.id === "consideraciones")!;

test("the full save sends whether an apartado is hidden", () => {
  const sections = createInitialSections().map((section) => section.id !== "consideraciones" ? section : {
    ...section,
    blocks: section.blocks.map((block) => ({
      ...block,
      apartados: block.apartados.map((apartado, index) => index === 0 ? { ...apartado, enabled: false } : apartado),
    })),
  });
  const payload = buildSectionsPayload(sections).find((section) => section.id === "consideraciones")!;
  assert.deepEqual(payload.blocks[0].subBlocks.map((subBlock) => subBlock.enabled), [false, true, true]);
});

test("a stored apartado reads back hidden only when it was saved hidden", () => {
  // As the save stores it: the node keeps the payload it was sent.
  assert.equal(hydrateApartadoMetadata({ kind: "subBlock", payload: { enabled: false } }).enabled, false);
  assert.equal(hydrateApartadoMetadata({ kind: "subBlock", payload: { enabled: true } }).enabled, true);
  // Saved before its visibility was stored, or with anything else: it shows.
  assert.equal(hydrateApartadoMetadata({ kind: "subBlock", payload: {} }).enabled, true);
  assert.equal(hydrateApartadoMetadata({ payload: { enabled: "no" } }).enabled, true);
  assert.equal(hydrateApartadoMetadata(null).enabled, true);
});

test("the editor opens a valuation with its hidden apartados hidden", () => {
  const detail = {
    folio: "F-1", client: "", location: "", postalCode: "", valuationKind: "comercial", propertyKind: "casa",
    sections: [{
      id: "consideraciones", label: "CONSIDERACIONES", title: "CONSIDERACIONES", enabled: true, required: false, startOnNewPage: false,
      blocks: [{
        id: "b1", label: "CONSIDERACIONES", title: "CONSIDERACIONES PREVIAS AL AVALÚO", enabled: true, required: false, sortOrder: 0, startOnNewPage: false,
        concepts: [], tables: [], images: [],
        subBlocks: [
          { id: "a1", title: "CONSIDERACIONES GENERALES", enabled: false, sortOrder: 0, startOnNewPage: false, concepts: [], tables: [], images: [] },
          { id: "a2", title: "DEFINICIONES", enabled: true, sortOrder: 1, startOnNewPage: false, concepts: [], tables: [], images: [] },
        ],
      }],
    }],
  } as unknown as ValuationDetail;
  const apartados = consideraciones(initialSectionsFor(detail)).blocks[0].apartados;
  assert.deepEqual(apartados.map((apartado) => [apartado.title, apartado.enabled]), [
    ["CONSIDERACIONES GENERALES", false],
    ["DEFINICIONES", true],
  ]);
});
