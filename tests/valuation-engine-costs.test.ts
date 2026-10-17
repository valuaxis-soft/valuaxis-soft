/**
 * The cost approach must reproduce the Excel books cell by cell. Inputs and
 * expected values come from the workbooks (docs/fase0, validated in Python).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXCEL_PROFILES, type EngineConfig } from "../src/features/valuations/engine/config";
import { computeCostApproach, type SpecialInstallationInput } from "../src/features/valuations/engine/costs";
import { SURFACE_SLOT } from "../src/features/valuations/engine/factors";
import { Trace } from "../src/features/valuations/engine/trace";

function close(actual: number | undefined, expected: number, label: string) {
  assert.ok(actual !== undefined, `${label}: sin valor`);
  const tolerance = 1e-12 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`);
}

/** Factors before and after the surface factor, in capture order. */
function slots(before: number[], after: number[]) {
  const factor = (value: number, key: string) => ({ key, label: key, value });
  return [
    ...before.map((value, index) => factor(value, `antes${index + 1}`)),
    SURFACE_SLOT,
    ...after.map((value, index) => factor(value, `despues${index + 1}`)),
  ];
}

test("Arandas: the cost approach matches the dictamen to the cent", () => {
  const trace = new Trace();
  const installations: SpecialInstallationInput[] = [
    [6, 2, 30, 9000],
    [1, 2, 30, 35000],
    [11.55, 2, 70, 14361.99],
    [3.54, 2, 70, 14361.99],
    [4, 2, 10, 30648],
    [1, 2, 70, 90000],
    [4, 2, 20, 4000],
    [4, 2, 20, 3500],
  ].map(([quantity, age, usefulLife, unitReplacementCost], index) => ({
    ref: String(index + 1),
    share: "P",
    quantity,
    age,
    usefulLife,
    conservation: 0.975,
    unitReplacementCost,
  }));

  const result = computeCostApproach({
    land: {
      kind: "urban",
      subjectArea: 169.78,
      referenceArea: 169.78,
      marketUnitValue: 9000,
      surfacePower: 3,
      factors: slots([1, 1], [1, 1, 1]),
    },
    constructions: [{ ref: "T-1", area: 467.27, age: 2, usefulLife: 70, conservation: 0.98, unitReplacementCost: 14361.99 }],
    specialInstallations: installations,
  }, EXCEL_PROFILES.ARANDAS, trace);

  const value = (key: string) => trace.find(key)?.value;
  close(value("costos.terreno.factorSuperficie"), 1, "Y18");
  close(value("costos.terreno.valorParcial"), 1528020, "U18");
  assert.equal(result.land, 1528000, "V20");
  close(value("costos.construcciones.T-1.factorEdad"), 0.9931086431711854, "R26");
  close(value("costos.construcciones.T-1.factorResultante"), 0.9732464703077617, "T26");
  close(value("costos.construcciones.T-1.vrnParcial"), 6710927.067299999, "N30");
  close(value("costos.construcciones.T-1.vnrUnitario"), 13977.75607409537, "S30");
  close(value("costos.construcciones.T-1.vnrParcial"), 6531386.080742544, "V30");
  assert.equal(result.constructions, 6530000, "V33");
  close(value("costos.construcciones.valorUnitarioMedio"), 13974.789736126864, "N33");

  const expectedInstallations = [
    [0.9529972556347212, 8576.975300712491, 51461.85180427495],
    [0.9529972556347212, 33354.90394721524, 33354.90394721524],
    [0.9682809270919057, 13906.44099208468, 160619.39345857807],
    [0.9682809270919057, 13906.44099208468, 49228.80111197977],
    [0.8725654156282531, 26742.3848581747, 106969.5394326988],
    [0.9682809270919057, 87145.28343827151, 87145.28343827151],
    [0.9361845508710339, 3744.7382034841357, 14978.952813936543],
    [0.9361845508710339, 3276.6459280486188, 13106.583712194475],
  ];
  expectedInstallations.forEach(([resultant, netUnit, partial], index) => {
    const key = `costos.instalaciones.${index + 1}`;
    close(value(`${key}.factorResultante`), resultant, `T${39 + index}`);
    close(value(`${key}.vnrUnitario`), netUnit, `S${50 + index}`);
    close(value(`${key}.vnrParcial`), partial, `V${50 + index}`);
  });
  close(value("costos.instalaciones.privativas"), 516865.3097191494, "V59");
  assert.equal(value("costos.instalaciones.comunes"), 0, "V60");
  assert.equal(result.specialInstallations, 517000, "V63");
  // 1,528,000 + 6,530,000 + 517,000 = 8,575,000: a half, rounded away from zero.
  assert.equal(result.physicalValue, 8580000, "U65");
});

// Installations shared by the TU, TCH, TR and TRC templates: fence and pump.
const templateInstallations: SpecialInstallationInput[] = [
  { ref: "1", share: "P", quantity: 140, age: 15, usefulLife: 30, conservation: 0.975, completion: 0.5, unitReplacementCost: 550 },
  { ref: "2", share: "P", quantity: 1, age: 7, usefulLife: 20, conservation: 0.975, unitReplacementCost: 20000 },
];

test("TU template: physical value 1,050,000", () => {
  const result = computeCostApproach({
    land: { kind: "urban", subjectArea: 160, referenceArea: 160, marketUnitValue: 7000, surfacePower: 3, factors: slots([0.95, 0.9], [1.05]) },
    specialInstallations: templateInstallations,
  }, EXCEL_PROFILES.TU);
  assert.equal(result.physicalValue, 1050000);
});

const tchInput = {
  land: { kind: "urban" as const, subjectArea: 160, referenceArea: 140, marketUnitValue: 5000, surfacePower: 3, factors: slots([0.95, 0.9], [1.05]) },
  constructions: [{ ref: "T-1", area: 250, age: 7, usefulLife: 70, conservation: 0.98, unitReplacementCost: 12550 }],
  specialInstallations: templateInstallations,
};

test("TCH template: 3,740,000 with its inverted surface factor, 3,680,000 with the correct one", () => {
  const trace = new Trace();
  const asExcel = computeCostApproach(tchInput, EXCEL_PROFILES.TCH, trace);
  close(trace.find("costos.terreno.factorSuperficie")?.value, 1.0455159171494204, "Y18");
  assert.equal(asExcel.physicalValue, 3740000);

  const corrected: EngineConfig = {
    ...EXCEL_PROFILES.TCH,
    surfaceOrientation: { ...EXCEL_PROFILES.TCH.surfaceOrientation, costs: "reference-over-subject" },
  };
  assert.equal(computeCostApproach(tchInput, corrected).physicalValue, 3680000);
});

test("TR template: rural land, installations and crops, no rounding", () => {
  const result = computeCostApproach({
    land: { kind: "rural", fractions: [{ label: "I", areaSquareMetres: 3857.5, unitValuePerHectare: 6900000, factor: 1 }] },
    specialInstallations: templateInstallations,
    otherAssets: [{ ref: "1", quantity: 1500, age: 3, usefulLife: 6, conservation: 0.95, riskFactor: 0.9, unitReplacementCost: 85 }],
  }, EXCEL_PROFILES.TR);
  close(result.physicalValue, 2767708.270675873, "T64");
});

test("TRC template: rural land with a construction and two crops", () => {
  const result = computeCostApproach({
    land: { kind: "rural", fractions: [{ label: "I", areaSquareMetres: 3857.5, unitValuePerHectare: 6800000, factor: 1 }] },
    constructions: [{ ref: "T-1", area: 250, age: 7, usefulLife: 70, conservation: 0.98, unitReplacementCost: 13732.09 }],
    specialInstallations: templateInstallations,
    otherAssets: [
      { ref: "1", quantity: 1500, age: 3, usefulLife: 6, conservation: 0.95, riskFactor: 0.6, unitReplacementCost: 85 },
      { ref: "2", quantity: 500, age: 7, usefulLife: 40, conservation: 1, riskFactor: 0.95, unitReplacementCost: 1320 },
    ],
  }, EXCEL_PROFILES.TRC);
  close(result.physicalValue, 6509348.219682156, "U84");
});

test("a floor on the age factor keeps an item older than its useful life from going negative", () => {
  const item = { ref: "T-1", area: 100, age: 80, usefulLife: 70, conservation: 1, unitReplacementCost: 1000 };
  const asExcel = computeCostApproach({ constructions: [item] }, EXCEL_PROFILES.TCH);
  assert.ok(asExcel.constructions < 0, "el Excel da un valor negativo");
  const floored = computeCostApproach({ constructions: [item] }, { ...EXCEL_PROFILES.TCH, ageFactor: { exponent: 1.4, floor: 0, extendUsefulLife: false } });
  assert.equal(floored.constructions, 0);
  // The appraiser's rule: the useful life becomes age + 1, so the item keeps a small value.
  const extended = computeCostApproach({ constructions: [item] }, { ...EXCEL_PROFILES.TR, ageFactor: { exponent: 1.4, floor: 0, extendUsefulLife: true } });
  assert.ok(Math.abs(extended.constructions - (1 - (80 / 81) ** 1.4) * 100 * 1000) < 1e-6, String(extended.constructions));
  assert.ok(extended.constructions > 0);
  // Exactly at the useful life it applies too: 70 of 70 years is valued as 70 of 71.
  const atLimit = computeCostApproach({ constructions: [{ ...item, age: 70 }] }, { ...EXCEL_PROFILES.TR, ageFactor: { exponent: 1.4, floor: 0, extendUsefulLife: true } });
  assert.ok(Math.abs(atLimit.constructions - (1 - (70 / 71) ** 1.4) * 100 * 1000) < 1e-6);
});

test("every figure is traced back to its inputs", () => {
  const trace = new Trace();
  computeCostApproach(tchInput, EXCEL_PROFILES.TCH, trace);
  const partial = trace.find("costos.construcciones.T-1.vnrParcial");
  assert.ok(partial);
  assert.deepEqual(Object.keys(partial.inputs), ["vnrUnitario", "superficie", "gradoTerminacion", "indiviso"]);
  assert.equal(trace.find("costos.valorFisico")?.rounding, -4);
  assert.equal(new Set(trace.steps.map((step) => step.key)).size, trace.steps.length, "claves únicas");
});

test("factors with a formula in the book take it when empty; a typed value overrides it, and only it", () => {
  // TCH, VI. ENF. COSTOS: R26 = 1 − (7/70)^1.4, T26 = Q26·R26·S26, Y18 = (160/140)^(1/3), P18 = J18·K18·L18·M18·N18·O18.
  const formula = new Trace();
  const asBook = computeCostApproach(tchInput, EXCEL_PROFILES.TCH, formula);
  close(formula.find("costos.construcciones.T-1.factorEdad")?.value, 0.9601892829446502, "R26");
  close(formula.find("costos.construcciones.T-1.factorResultante")?.value, 0.9409854972857572, "T26");
  close(formula.find("costos.instalaciones.1.factorEdad")?.value, 0.6210708583724005, "R47");
  close(formula.find("costos.instalaciones.2.factorResultante")?.value, 0.7507668190698836, "T48");
  close(formula.find("costos.terreno.factorResultante")?.value, 0.9386119146208922, "P18");
  assert.equal(formula.find("costos.construcciones.T-1.factorEdad")?.formula, "1 − (edad / vida útil)^1.4");
  assert.equal(asBook.physicalValue, 3740000, "U69");

  // The appraiser types an age factor of 0.9 for T-1: FRe = 0.98 × 0.9 × 1, the formula stays at hand.
  const typed = new Trace();
  const withAge = computeCostApproach({ ...tchInput, constructions: [{ ...tchInput.constructions[0], ageFactor: 0.9 }] }, EXCEL_PROFILES.TCH, typed);
  const age = typed.find("costos.construcciones.T-1.factorEdad");
  assert.equal(age?.value, 0.9);
  assert.equal(age?.formula, "capturado por el valuador");
  close(age?.inputs.formula as number, 0.9601892829446502, "fórmula a la vista");
  close(typed.find("costos.construcciones.T-1.factorResultante")?.value, 0.98 * 0.9 * 1, "T26 con edad capturada");
  close(typed.find("costos.construcciones.T-1.vnrParcial")?.value, 0.98 * 0.9 * 12550 * 250, "V34");
  assert.equal(withAge.land, asBook.land, "the land does not move");
  assert.equal(withAge.specialInstallations, asBook.specialInstallations);

  // A typed FRe replaces the product; a typed Sup. of the land replaces its formula.
  const resultant = new Trace();
  computeCostApproach({
    ...tchInput,
    land: { ...tchInput.land, surfaceFactor: 1 },
    specialInstallations: [{ ...templateInstallations[0], resultantFactor: 0.5 }, templateInstallations[1]],
  }, EXCEL_PROFILES.TCH, resultant);
  assert.equal(resultant.find("costos.terreno.factorSuperficie")?.value, 1);
  close(resultant.find("costos.terreno.factorSuperficie")?.inputs.formula as number, 1.0455159171494204, "Y18 a la vista");
  close(resultant.find("costos.terreno.factorResultante")?.value, 0.95 * 0.9 * 1 * 1.05, "P18 con Sup. capturado");
  assert.equal(resultant.find("costos.instalaciones.1.factorResultante")?.value, 0.5);
  close(resultant.find("costos.instalaciones.1.vnrParcial")?.value, 0.5 * 550 * 140 * 1 * 0.5, "V55");
  close(resultant.find("costos.instalaciones.2.factorResultante")?.value, 0.7507668190698836, "T48 sigue la fórmula");

  const landResultant = new Trace();
  computeCostApproach({ ...tchInput, land: { ...tchInput.land, resultantFactor: 1 } }, EXCEL_PROFILES.TCH, landResultant);
  assert.equal(landResultant.find("costos.terreno.factorResultante")?.value, 1);
  assert.equal(landResultant.find("costos.terreno.valorParcial")?.value, 5000 * 160);
});
