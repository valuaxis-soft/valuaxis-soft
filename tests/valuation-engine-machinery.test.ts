/**
 * Machinery and equipment (MEH) against the firm's book, from its inputs
 * (docs/fase0/metodologia/01-costos.md §3.8, 02-mercado-homologacion.md §3.5).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeMachineryCost,
  computeMachineryMarket,
  conservationFactor,
  modeRating,
  type MachineryCostInput,
} from "../src/features/valuations/engine/machinery";

function close(actual: number, expected: number, label: string) {
  const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected}`);
}

const factors = (conservation: number, maintenance: number, technological = 1, economic = 1) =>
  ({ conservation, maintenance, technological, economic });

// IV. ENF. COSTOS: US$65,000 at 17.65, gastos C34:O34, 14 of 30 years, rating 8.
const costInput = (conservationTwice: boolean): MachineryCostInput => ({
  item: {
    quotedPrice: 65000,
    exchangeRate: 17.65,
    otherFactor: 1,
    expenses: [0.01, 0.02, 0.01, 0.03, 0.02, 0].map((rate, index) => ({ concept: `gasto ${index + 1}`, rate })),
    age: 14,
    usefulLife: 30,
    rating: 8,
    factors: factors(0.975, 0.95),
  },
  attachments: [
    { ref: "A-1", quotedPrice: 117000, expenseRates: [0.03, 0.04, 0.02], age: 10, usefulLife: 20, factors: factors(0.95, 1) },
    { ref: "A-2", quotedPrice: 185000, expenseRates: [], age: 5, usefulLife: 20, factors: factors(1, 0.95) },
  ],
  conservationTwice,
});

test("MEH costos reproduce W42 y V61 del libro (conservación dos veces)", () => {
  const result = computeMachineryCost(costInput(true));
  close(result.item.quotedMxn, 1147250, "R28");
  close(result.item.installedValue, 1250502.5, "W34");
  close(result.item.ageFactor, 0.6395605718342495, "J42");
  close(result.item.resultantFactor, 0.5923929796614735, "U42");
  close(result.item.value, 740788.9020491218, "W42");
  close(result.attachments[0].value, 60576.75, "V56");
  close(result.attachments[1].value, 131812.5, "V57");
  close(result.attachmentsTotal, 192389.25, "V59");
  assert.equal(result.physicalValue, 933000);
  assert.equal(result.trace.find("meh.valorFisico")?.rounding, -3);
});

test("MEH costos con la conservación una sola vez dan 952,000", () => {
  assert.equal(computeMachineryCost(costInput(false)).physicalValue, 952000);
});

test("MEH mercado reproduce la mediana y el valor redondeado", () => {
  const result = computeMachineryMarket({
    usefulLife: 30,
    offers: [
      { id: "1", price: 1680000, surcharge: 0.07, age: 8, rating: 8, factors: factors(0.9, 0.95, 1) },
      { id: "2", price: 1890000, surcharge: 0.08, age: 7, rating: 9, factors: factors(0.5, 1, 0.95) },
      { id: "3", price: 1520000, surcharge: 0.04, age: 9, rating: 10, factors: factors(0.8, 0.95, 1) },
      { id: "4", price: 1310000, surcharge: 0.03, age: 10, rating: 7, factors: factors(0.85, 1, 0.9) },
      { id: "5", price: 2050000, surcharge: 0.05, age: 6, rating: 8, factors: factors(0.8, 1, 0.8) },
    ],
  });
  const expected = [1263008.5178132048, 834738.4167668517, 978738.7347164522, 745657.1339016935, 1202046.1165694816];
  result.offers.forEach((offer, index) => close(offer.value, expected[index], `AK${81 + index}`));
  close(result.offers[0].ageFactor, 0.8217639879899676, "FEd 1");
  close(result.mean, 1004837.7839535367, "promedio");
  close(result.median, 978738.7347164522, "mediana");
  assert.equal(result.value, 980000);
});

test("tabla de conservación y moda de la inspección", () => {
  assert.equal(conservationFactor(8), 0.975);
  assert.equal(conservationFactor(1), 0);
  assert.throws(() => conservationFactor(11), /1 a 10/);
  assert.throws(() => conservationFactor(7.5), /1 a 10/);
  assert.equal(modeRating([8, 8, 9, 7]), 8);
  assert.equal(modeRating([9, 7, 9, 7]), 7);
  assert.throws(() => modeRating([]));
});

test("MEH rechaza vidas útiles y ofertas vacías", () => {
  const input = costInput(true);
  assert.throws(() => computeMachineryCost({ ...input, item: { ...input.item, usefulLife: 0 } }), /vida útil/);
  assert.throws(() => computeMachineryMarket({ usefulLife: 30, offers: [] }), /oferta/);
});
