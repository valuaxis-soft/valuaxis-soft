/**
 * Live formulas of the calculation panels on the local database (V5.2-08,
 * WA-04): a cost field that reads a concept of the document follows it when
 * the document is saved, and the conclusion with it; a deleted reference
 * keeps the last value; a formula with numbers of before is left alone.
 * Values are invented.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { refreshLiveFormulas } from "../../src/features/valuations/calculation/live-formulas.service";
import { saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND } from "../../src/features/valuations/calculation/cost-types";
import { initialSectionsFor } from "../../src/features/valuations/components/workspace/model/initial-hydration";
import { buildSectionsPayload } from "../../src/features/valuations/components/workspace/model/save-payload";
import { loadCalculationMemory } from "../../src/features/valuations/memory/calculation-memory.service";
import type { AppSection } from "../../src/features/valuations/model";
import { getValuationByPublicId } from "../../src/features/valuations/repositories/valuation.repository";
import { buildFormulaIndex } from "../../src/features/valuations/services/formula-references";
import { liveFormulaText } from "../../src/features/valuations/services/live-formulas";
import { saveValuationSections, type SectionPayload } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({ ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] });

/** A document with one concept the cost approach reads ("Valor de prueba"), or without it. */
function documentWith(value: string | null): AppSection[] {
  return [{
    id: "costos",
    label: "VI",
    title: "ENF. COSTOS",
    sourceFile: "",
    enabled: true,
    required: false,
    blocks: [{
      id: "bloque-datos", title: "Datos del perito", sectionLabel: "", enabled: true, required: false,
      concepts: value === null ? [] : [{ id: "concepto-valor-prueba", label: "Valor de prueba", value, type: "number" }],
      apartados: [], tables: [], images: [],
    }],
  }];
}

const saveDocument = (fixture: Fixture, value: string | null) => saveValuationSections({
  publicId: fixture.publicId,
  organizationId: fixture.organizationId,
  user: editor(fixture),
  sections: JSON.parse(JSON.stringify(buildSectionsPayload(documentWith(value)))) as SectionPayload[],
});

/** The index of the document as the editor reads it back. */
async function storedIndex(fixture: Fixture) {
  const valuation = await getValuationByPublicId(fixture.publicId, fixture.organizationId);
  assert.ok(valuation);
  return buildFormulaIndex(initialSectionsFor(valuation));
}

async function summary(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1 } });
}

test("a cost field that reads a concept follows it when the document changes, and the conclusion follows", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveDocument(fixture, "20");
  const typed = liveFormulaText("=[Valor de prueba]*100", await storedIndex(fixture));
  assert.ok(typed.ok, typed.ok ? "" : typed.message);
  assert.match(typed.text, /^=\{c:[^|]+\|20\}\*100$/);

  await saveCostCalculation(fixture.publicId, user, {
    land: { ...DEFAULT_LAND, subjectArea: 100, unitValue: 2000 },
    constructions: [], installations: [], indirects: [],
    formulas: { "land.unitValue": typed.text, "land.subjectArea": "=50*2" },
  });
  await saveConclusionSettings(fixture.publicId, user, { method: { kind: "single", approach: "costos" }, justification: null, rounding: null });
  const before = await summary(fixture);
  assert.equal(Number(before.NValorEnfoqueCostos), 200_000);
  assert.equal(Number(before.NValorConcluido), 200_000);

  // Nothing changed in the document: nothing to save again.
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), []);

  // The concept changes from 20 to 35: the land unit value goes from 2,000 to 3,500.
  await saveDocument(fixture, "35");
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), ["COSTOS"]);
  const costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.land.unitValue, 3500);
  assert.match(costs.formulas?.["land.unitValue"] ?? "", /^=\{c:[^|]+\|35\}\*100$/);
  assert.equal(costs.formulas?.["land.subjectArea"], "=50*2", "a formula with numbers stays as it was");
  const after = await summary(fixture);
  assert.equal(Number(after.NValorEnfoqueCostos), 350_000, "the cost approach was recomputed");
  assert.equal(Number(after.NValorConcluido), 350_000, "and the conclusion with it");

  // The calculation memory prints the reference and the value it used.
  const { memory } = await loadCalculationMemory(user, fixture.publicId);
  const captured = memory.approaches.find((item) => item.key === "MOTOR.COSTOS")?.captured;
  assert.deepEqual(captured?.find((item) => item.label === "Terreno · Valor unitario"), {
    label: "Terreno · Valor unitario", formula: "=[Valor de prueba]*100", withValues: "=35*100", value: "3,500",
  });

  // The concept is deleted: the field keeps its last value and nothing is saved.
  await saveDocument(fixture, null);
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), []);
  assert.equal((await getCostCalculation(fixture.publicId, fixture.organizationId)).land.unitValue, 3500);
  assert.equal(Number((await summary(fixture)).NValorConcluido), 350_000);
});

test("a valuation without live formulas is left alone", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveDocument(fixture, "20");
  await saveCostCalculation(fixture.publicId, user, {
    land: { ...DEFAULT_LAND, subjectArea: 100, unitValue: 40 },
    constructions: [], installations: [], indirects: [],
    formulas: { "land.unitValue": "=20*2" },
  });
  await saveDocument(fixture, "35");
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), []);
  const costs = await getCostCalculation(fixture.publicId, fixture.organizationId);
  assert.equal(costs.land.unitValue, 40);
  assert.deepEqual(costs.formulas, { "land.unitValue": "=20*2" });
});
