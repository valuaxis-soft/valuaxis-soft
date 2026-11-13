/**
 * Video 5.1 (V5.1-04): with one row only in the resumen de valores, the
 * concluded value is that row's value, whatever "Se concluye con" said
 * before; with two rows the method concludes again. Checked on the server
 * (what is stored and printed) and in what the editor writes in the document.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { conclusionValues } from "../../src/features/valuations/calculation/conclusion-document";
import { getConclusionCalculation, saveConclusionSettings } from "../../src/features/valuations/calculation/conclusion.service";
import { canConclude, conclusionEngineConfig, conclusionInput, type ConclusionSummaryRow } from "../../src/features/valuations/calculation/conclusion-types";
import { concludeValue } from "../../src/features/valuations/engine/conclusion";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

const LAND: ConclusionSummaryRow = { source: "mercado-terrenos", label: "Valor de terreno por enfoque de mercado (prueba)" };
const COSTS: ConclusionSummaryRow = { source: "costos", label: "Valor por enfoque de costos" };

/** A valuation whose cost approach gives 300,000 and whose land market gives 600,000. */
async function valuation() {
  const fixture = await createValuationFixture();
  const { IdVersionTrabajo } = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  assert.ok(IdVersionTrabajo);
  const land = await prisma.tipoComparable.findUniqueOrThrow({ where: { SClave: "TERRENO_VENTA" } });
  await prisma.enfoqueCosto.create({ data: { IdVersionAvaluo: IdVersionTrabajo, NValorFisicoTotal: 300_000 } });
  await prisma.enfoqueMercado.create({ data: { IdVersionAvaluo: IdVersionTrabajo, IdTipoComparable: land.IdTipoComparable, NValorMercado: 600_000 } });
  return { ...fixture, versionId: IdVersionTrabajo };
}

type Valuation = Awaited<ReturnType<typeof valuation>>;

const save = (fixture: Valuation, summaryRows: ConclusionSummaryRow[]) =>
  saveConclusionSettings(fixture.publicId, fixture.user, { method: { kind: "single", approach: "costos" }, justification: null, summaryRows });

/** The concluded value stored by the server and the one the editor writes in the dictamen's «Valor concluido». */
async function concluded(fixture: Valuation) {
  const stored = await prisma.resumenValor.findUniqueOrThrow({ where: { IdVersionAvaluo: fixture.versionId } });
  const calculation = await getConclusionCalculation(fixture.publicId, fixture.organizationId);
  assert.ok(canConclude(calculation));
  const result = concludeValue(conclusionInput(calculation), conclusionEngineConfig(calculation));
  const written = conclusionValues(calculation, result)["valor concluido"];
  return { stored: Number(stored.NValorConcluido), printed: typeof written === "string" ? written : written.amount };
}

test("a resumen with only the land row concludes with the land value from the start", async () => {
  const fixture = await valuation();
  await save(fixture, [LAND]);
  assert.deepEqual(await concluded(fixture), { stored: 600_000, printed: 600_000 });
});

test("taking rows away until one is left concludes with that one; two rows conclude by the method again", async () => {
  const fixture = await valuation();
  await save(fixture, [COSTS, LAND]);
  assert.deepEqual(await concluded(fixture), { stored: 300_000, printed: 300_000 }, "two rows: «Se concluye con» costos");
  await save(fixture, [LAND]);
  assert.deepEqual(await concluded(fixture), { stored: 600_000, printed: 600_000 }, "the cost row taken away");
  await save(fixture, [COSTS]);
  assert.deepEqual(await concluded(fixture), { stored: 300_000, printed: 300_000 });
  await save(fixture, []);
  assert.deepEqual(await concluded(fixture), { stored: 300_000, printed: 300_000 }, "no rows: the three approaches and the method, as always");
});
