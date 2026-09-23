import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { ComparableInputPayload } from "../../src/features/valuations/calculation/market-schemas";
import {
  createComparable,
  deleteComparable,
  getMarketCalculation,
  saveMarketSettings,
  updateComparable,
} from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, type ComparableFactorDto, type FactorType } from "../../src/features/valuations/calculation/market-types";
import { concludeValuation, reopenValuation, saveValuationSections } from "../../src/features/valuations/services/valuation-workflow.service";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

type Fixture = Awaited<ReturnType<typeof createValuationFixture>>;

const editor = (fixture: Fixture) => ({
  ...fixture.user,
  permissions: [...fixture.user.permissions, "AVALUO_EDITAR"],
});

function factor(type: FactorType, subjectRating: number | null, comparableRating: number | null, value: number | null = null): ComparableFactorDto {
  return { type, value, subjectRating, comparableRating, justification: null };
}

function comparable(location: string, area: number, price: number, factors: ComparableFactorDto[]): ComparableInputPayload {
  return {
    location, area, price, factors,
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: "Plano", services: "Completos",
    notes: null, sourceName: "Altos 360", contactName: null, contactPhone: "348 249 3129", url: null, offerDate: "2026-05-04",
  };
}

// The five land comparables of the Arandas dictamen.
const neg = factor("NEGOCIACION", null, null, 0.95);
const arandas = [
  comparable("Villa Toledo", 140, 1260000, [neg, factor("UBICACION", 1, 1), factor("ZONA", 0.9, 1), factor("FRENTE", 1, 1), factor("USO_SUELO", 1.1, 1.05)]),
  comparable("Virreyes", 140, 1220000, [neg, factor("UBICACION", 1, 1), factor("ZONA", 0.9, 1.05), factor("FRENTE", 1, 1), factor("USO_SUELO", 1.1, 1.05)]),
  comparable("16 de Septiembre", 192.5, 2032590, [neg, factor("UBICACION", 1, 1), factor("ZONA", 0.9, 1), factor("FRENTE", 1, 1), factor("USO_SUELO", 1.1, 1)]),
  comparable("Encino y Araucaria", 196.62, 2261130, [neg, factor("UBICACION", 1, 1.15), factor("ZONA", 0.9, 1), factor("FRENTE", 1, 1.15), factor("USO_SUELO", 1.1, 1)]),
  comparable("Mixtecos", 140, 1330000, [neg, factor("UBICACION", null, null, 1), factor("ZONA", 0.9, 1), factor("FRENTE", 1, 1), factor("USO_SUELO", 1.1, 1.05)]),
];

async function loadArandas(fixture: Fixture) {
  const user = editor(fixture);
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA",
    subjectArea: 169.78,
    baseArea: null,
    surfacePower: 6,
    adoptedUnitValue: 9000,
    justification: "Valor dentro del rango homologado.",
    additionalAmount: 0,
    factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  for (const item of arandas) await createComparable(fixture.publicId, user, "TERRENO_VENTA", item);
  return user;
}

async function storedApproach(fixture: Fixture) {
  const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
  const versionId = avaluo.IdVersionTrabajo ?? avaluo.IdVersionFinal;
  const approach = await prisma.enfoqueMercado.findFirstOrThrow({ where: { IdVersionAvaluo: versionId ?? -1 } });
  const executions = await prisma.ejecucionCalculo.findMany({ where: { IdVersionAvaluo: versionId ?? -1 }, include: { resultados: true } });
  return { approach, executions };
}

test("capturing the Arandas comparables stores the dictamen's market value and its trace", async () => {
  const fixture = await createValuationFixture();
  await loadArandas(fixture);

  const calculation = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(calculation.comparables.length, 5);
  assert.deepEqual(calculation.comparables.map((item) => item.reference), [1, 2, 3, 4, 5]);
  assert.equal(calculation.comparables[1].factors.find((item) => item.type === "ZONA")?.comparableRating, 1.05);
  assert.equal(calculation.comparables[0].contactPhone, "348 249 3129");

  const { approach, executions } = await storedApproach(fixture);
  assert.equal(Number(approach.NValorMercado), 1528000);
  assert.ok(Math.abs(Number(approach.NValorPromedioHomologado) - 8353.341571216495) < 1e-6);
  assert.equal(Number(approach.NValorHomologadoUtilizado), 9000);
  assert.equal(executions.length, 1, "one stored execution per approach");
  assert.equal(executions[0].SClaveCalculo, "MOTOR.MERCADO.TERRENO_VENTA");
  const homologated = executions[0].resultados.find((row) => row.SClaveResultado === "mercado.comparables.3.valorHomologado");
  assert.ok(Math.abs(Number(homologated?.NValorNumerico) - 10140.714396501335) < 1e-6);
});

test("editing and deleting comparables recompute the result and keep references in order", async () => {
  const fixture = await createValuationFixture();
  const user = await loadArandas(fixture);
  const before = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");

  await deleteComparable(fixture.publicId, user, before.comparables[0].id);
  const afterDelete = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.deepEqual(afterDelete.comparables.map((item) => [item.reference, item.location]), [
    [1, "Virreyes"], [2, "16 de Septiembre"], [3, "Encino y Araucaria"], [4, "Mixtecos"],
  ]);

  await updateComparable(fixture.publicId, user, afterDelete.comparables[0].id, { ...arandas[1], price: 1300000 });
  const { approach, executions } = await storedApproach(fixture);
  assert.equal(executions.length, 1, "the previous execution is replaced");
  // Four comparables, the first one more expensive: the mean moves, the adopted value does not.
  assert.notEqual(Number(approach.NValorPromedioHomologado).toFixed(6), "8353.341571");
  assert.equal(Number(approach.NValorMercado), 1528000);
});

test("a concluded valuation rejects edits, and reopening copies comparables, factors and settings", async () => {
  const fixture = await createValuationFixture();
  const user = await loadArandas(fixture);
  // Concluding needs the document structure, created on the first save.
  await saveValuationSections({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user,
    sections: [{ id: "mercadoVenta", label: "VII", title: "ENFOQUE DE MERCADO EN VENTA", blocks: [] }],
  });
  await concludeValuation({ publicId: fixture.publicId, organizationId: fixture.organizationId, user });

  await assert.rejects(
    createComparable(fixture.publicId, user, "TERRENO_VENTA", arandas[0]),
    (error: Error & { status?: number }) => error.status === 409,
  );
  const concluded = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(concluded.locked, true);
  assert.equal(concluded.comparables.length, 5, "the final version still shows its comparables");

  await reopenValuation({
    publicId: fixture.publicId,
    organizationId: fixture.organizationId,
    user: { ...user, permissions: [...user.permissions, "AVALUO_REABRIR"] },
    reason: "Revisión de comparables",
    acceptedText: "Acepto reabrir el avalúo",
  });
  const reopened = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  assert.equal(reopened.locked, false);
  assert.equal(reopened.comparables.length, 5);
  assert.equal(reopened.settings.surfacePower, 6);
  assert.equal(reopened.comparables[3].factors.find((item) => item.type === "UBICACION")?.comparableRating, 1.15);
});
