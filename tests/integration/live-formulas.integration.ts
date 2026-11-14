/**
 * Live formulas of the calculation panels on the local database (V5.2-08,
 * WA-04): a cost field that reads a concept of the document follows it when
 * the document is saved, and the conclusion with it; a deleted reference
 * keeps the last value; a formula with numbers of before is left alone. The
 * cells of the homologation, the comparable's card and the alternative
 * methods follow too, and the market with them. Values are invented.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { refreshLiveFormulas } from "../../src/features/valuations/calculation/live-formulas.service";
import { saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { getCostCalculation, saveCostCalculation } from "../../src/features/valuations/calculation/cost.service";
import { DEFAULT_LAND } from "../../src/features/valuations/calculation/cost-types";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import { createComparable, getMarketCalculation, saveMarketSettings } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS } from "../../src/features/valuations/calculation/market-types";
import { defaultStatisticalSettings } from "../../src/features/valuations/calculation/statistical-types";
import { getStatisticalCalculation, saveStatisticalCalculation } from "../../src/features/valuations/calculation/statistical.service";
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

/* ------------------------------------------------------------------ */
/*  The capture tables and the comparable's card                       */
/* ------------------------------------------------------------------ */

/** Four land comparables of 100 m² at $1,000,000 ($10,000/m²); the first with what `first` changes. */
async function landMarket(fixture: Fixture, first: Partial<ComparableInputPayload>) {
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA", subjectArea: 100, baseArea: null, surfacePower: 3, adoptedUnitValue: null,
    justification: null, additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS, rounding: null,
  });
  for (let index = 0; index < 4; index += 1) {
    await createComparable(fixture.publicId, user, "TERRENO_VENTA", {
      location: `Comparable inventado ${index + 1}`, area: 100, price: 1_000_000, factors: [],
      landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null,
      notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
      ...(index === 0 ? first : {}),
    });
  }
}

async function marketRow(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  return prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1, tipoComparable: { SClave: "TERRENO_VENTA" } } });
}

test("a homologation cell that reads a concept follows it, and the adopted value with it", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveDocument(fixture, "90");
  const typed = liveFormulaText("=[Valor de prueba]/100", await storedIndex(fixture));
  assert.ok(typed.ok, typed.ok ? "" : typed.message);
  await landMarket(fixture, {
    factors: [{ type: "NEGOCIACION", value: 0.9, subjectRating: null, comparableRating: null, justification: "Oferta" }],
    formulas: { "factors.NEGOCIACION": typed.text },
  });
  // 9,000 + 3 × 10,000: the mean, adopted when none is typed, is 9,750 and the market 975,000.
  let row = await marketRow(fixture);
  assert.equal(Number(row.NValorHomologadoUtilizado), 9750);
  assert.equal(Number(row.NValorMercado), 975_000);
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), []);

  // The concept goes from 90 to 80: the factor is 0.8, the adopted value 9,500 and the market 950,000.
  await saveDocument(fixture, "80");
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), ["MERCADO:TERRENO_VENTA"]);
  const market = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const [first] = market.comparables;
  assert.equal(first.factors.find((factor) => factor.type === "NEGOCIACION")?.value, 0.8);
  assert.equal(first.factors.find((factor) => factor.type === "NEGOCIACION")?.justification, "Oferta", "the justification stays");
  assert.match(first.formulas?.["factors.NEGOCIACION"] ?? "", /^=\{c:[^|]+\|80\}\/100$/);
  row = await marketRow(fixture);
  assert.equal(Number(row.NValorHomologadoUtilizado), 9500);
  assert.equal(Number(row.NValorMercado), 950_000);

  // The concept is deleted: the factor keeps 0.8 and nothing is saved.
  await saveDocument(fixture, null);
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), []);
  assert.equal(Number((await marketRow(fixture)).NValorMercado), 950_000);
});

test("a field of the comparable's card that reads a concept follows it without opening the card, and the market with it", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveDocument(fixture, "1000");
  const typed = liveFormulaText("=[Valor de prueba]*1000", await storedIndex(fixture));
  assert.ok(typed.ok, typed.ok ? "" : typed.message);
  await landMarket(fixture, { price: 1_000_000, formulas: { price: typed.text, area: "=50*2" } });
  assert.equal(Number((await marketRow(fixture)).NValorMercado), 1_000_000);

  // The concept goes from 1,000 to 1,200: the offer is 1,200,000 ($12,000/m²), the mean 10,500 and the market 1,050,000.
  await saveDocument(fixture, "1200");
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), ["MERCADO:TERRENO_VENTA"]);
  const [first] = (await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA")).comparables;
  assert.equal(first.price, 1_200_000);
  assert.equal(first.formulas?.area, "=50*2", "a formula with numbers stays as it was");
  const row = await marketRow(fixture);
  assert.equal(Number(row.NValorHomologadoUtilizado), 10_500);
  assert.equal(Number(row.NValorMercado), 1_050_000);
});

test("a cell of the alternative methods that reads a concept follows it", async () => {
  const fixture = await createValuationFixture();
  const user = editor(fixture);
  await saveDocument(fixture, "300");
  const index = await storedIndex(fixture);
  const price = liveFormulaText("=[Valor de prueba]*1000", index);
  const area = liveFormulaText("=[Valor de prueba]/2", index);
  assert.ok(price.ok && area.ok);
  const defaults = defaultStatisticalSettings("TERRENO_VENTA");
  await saveStatisticalCalculation(fixture.publicId, user, {
    settings: { ...defaults, subject: { area: "150" }, variables: [{ key: "area", coding: "DIRECT" }] },
    comparables: [
      { id: "rlm-1", reference: 1, price: 300_000, priceFormula: price.text, values: { area: area.text } },
      { id: "rlm-2", reference: 2, price: 200_000, values: { area: "100" } },
    ],
  });
  await saveDocument(fixture, "400");
  assert.deepEqual(await refreshLiveFormulas(fixture.publicId, user), ["ESTADISTICO:TERRENO_VENTA"]);
  const saved = await getStatisticalCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(saved.comparables[0].price, 400_000);
  assert.match(saved.comparables[0].priceFormula ?? "", /\|400\}\*1000$/);
  assert.match(saved.comparables[0].values.area, /\|400\}\/2$/);
  assert.deepEqual(saved.comparables[1].values, { area: "100" });
});
