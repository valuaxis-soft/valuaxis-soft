/**
 * Video 7.4 (V7.4-20): a homologation factor captured as «=1/1.1» and then
 * typed over with 1.16 without "=" is stored as 1.16 and the market approach
 * recomputes with it: FRe 0.95 × 1.16 = 1.10, as the appraiser's Excel.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { factorInputText, parseFactorInput, withTypedComparableFactor } from "../../src/features/valuations/calculation/factor-input";
import { createComparable, getMarketCalculation, saveMarketSettings, updateComparable } from "../../src/features/valuations/calculation/market.service";
import { DEFAULT_FACTOR_SLOTS, comparableFormValues } from "../../src/features/valuations/calculation/market-types";
import { appliedFormulaDraft, typedFormulaDraft } from "../../src/features/valuations/components/editor/formula-editing";
import { createValuationFixture, prisma } from "./support";

after(() => prisma.$disconnect());

test("V7.4-20: 1.16 typed over «=1/1.1» is stored and gives the FRe 1.10 and its homologated value", async () => {
  const fixture = await createValuationFixture();
  const user = { ...fixture.user, permissions: [...fixture.user.permissions, "AVALUO_EDITAR"] };
  await saveMarketSettings(fixture.publicId, user, {
    comparableType: "TERRENO_VENTA", subjectArea: 200, baseArea: null, surfacePower: 6, adoptedUnitValue: 10_000,
    justification: "Inventado.", additionalAmount: 0, factorSlots: DEFAULT_FACTOR_SLOTS,
  });
  const ubicacion = { type: "UBICACION" as const };
  assert.equal(parseFactorInput("=1/1.1").kind, "ratings", "«=1/1.1» is kept as the ratings 1 and 1.1");
  // Same surface as the subject (Sup. 1): the FRe is 0.95 × Ubic.
  await createComparable(fixture.publicId, user, "TERRENO_VENTA", {
    location: "Calle Inventada 3", area: 200, price: 2_000_000,
    factors: [
      { type: "NEGOCIACION", value: 0.95, subjectRating: null, comparableRating: null, justification: null },
      { type: "UBICACION", value: null, subjectRating: 1, comparableRating: 1.1, justification: null },
    ],
    landUse: null, shape: "Regular", zone: null, frontage: null, depth: null, topography: "Plano", services: "Completos",
    notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
  });

  const before = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
  const stored = before.comparables[0];
  const shown = factorInputText(stored.factors.find((item) => item.type === "UBICACION"));
  assert.equal(shown, "=1/1.1", "the cell shows the formula when entered");

  for (const [typed, fre] of [["1.16", 1.102], ["1.06", 1.007]] as const) {
    // What the cell applies on leaving it, and the panel's save of the comparable.
    const applied = appliedFormulaDraft(typedFormulaDraft({ text: shown, initial: shown }, typed, null));
    assert.equal(applied, typed);
    const input = parseFactorInput(applied ?? "");
    if (input.kind !== "value") assert.fail(`«${applied}» is not a number`);
    await updateComparable(fixture.publicId, user, stored.id, comparableFormValues(withTypedComparableFactor(stored, ubicacion, input)));

    const after = await getMarketCalculation(fixture.publicId, fixture.organizationId, "TERRENO_VENTA");
    const factor = after.comparables[0].factors.find((item) => item.type === "UBICACION");
    assert.equal(factor?.value, Number(typed));
    assert.equal(factor?.subjectRating ?? null, null, "the old formula's ratings are gone");
    assert.equal(factorInputText(factor), typed, "entering the cell again shows the number");

    const avaluo = await prisma.avaluo.findUniqueOrThrow({ where: { UIdentificadorPublico: fixture.publicId } });
    const execution = await prisma.ejecucionCalculo.findFirstOrThrow({
      where: { IdVersionAvaluo: avaluo.IdVersionTrabajo ?? -1, SClaveCalculo: "MOTOR.MERCADO.TERRENO_VENTA" },
      include: { resultados: true },
    });
    const result = (key: string) => Number(execution.resultados.find((row) => row.SClaveResultado.endsWith(key))?.NValorNumerico);
    assert.ok(Math.abs(result(".comparables.1.factorResultante") - fre) < 1e-9, `FRe ${result(".comparables.1.factorResultante")}`);
    assert.equal(result(".comparables.1.factorResultante").toFixed(2), typed === "1.16" ? "1.10" : "1.01");
    assert.ok(Math.abs(result(".comparables.1.valorHomologado") - fre * 10_000) < 1e-6);
  }
});
