import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { amountInWords } from "../src/features/valuations/engine/amount-in-words";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG, EXCEL_PROFILES, PENDING_DECISIONS } from "../src/features/valuations/engine/config";
import { excelRound } from "../src/features/valuations/engine/rounding";

test("excelRound rounds halves away from zero on the decimal digits, like Excel", () => {
  assert.equal(excelRound(8575000, -4), 8580000);
  assert.equal(excelRound(1528020, -2), 1528000);
  assert.equal(excelRound(2.5, 0), 3);
  assert.equal(excelRound(-2.5, 0), -3);
  // 1.005 is stored as 1.00499999…; Excel still shows and rounds 1.005.
  assert.equal(excelRound(1.005, 2), 1.01);
  assert.equal(excelRound(0.5, 0), 1);
  assert.equal(excelRound(0.04, 0), 0);
  assert.equal(excelRound(123.456, 1), 123.5);
  assert.equal(excelRound(9000, -1), 9000);
  assert.equal(excelRound(0.0000001, 2), 0);
});

test("the amount in words matches the 18 values printed in the books, with TRÉS corrected", () => {
  const printed: [number, string][] = [
    [980000, "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)"],
    [855000, "( OCHOCIENTOS CINCUENTA Y CINCO MIL PESOS 00/100 M. N.)"],
    [1400000, "( UN MILLÓN CUATROCIENTOS MIL PESOS 00/100 M. N.)"],
    [805000, "( OCHOCIENTOS CINCO MIL PESOS 00/100 M. N.)"],
    [720000, "( SETECIENTOS VEINTE MIL PESOS 00/100 M. N.)"],
    [1290000, "( UN MILLÓN DOSCIENTOS NOVENTA MIL PESOS 00/100 M. N.)"],
    [930000, "( NOVECIENTOS TREINTA MIL PESOS 00/100 M. N.)"],
    [8580000, "( OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M. N.)"],
    [3750000, "( TRES MILLONES SETECIENTOS CINCUENTA MIL PESOS 00/100 M. N.)"],
    [5030000, "( CINCO MILLONES TREINTA MIL PESOS 00/100 M. N.)"],
    [5750000, "( CINCO MILLONES SETECIENTOS CINCUENTA MIL PESOS 00/100 M. N.)"],
    [1120000, "( UN MILLÓN CIENTO VEINTE MIL PESOS 00/100 M. N.)"],
    [1050000, "( UN MILLÓN CINCUENTA MIL PESOS 00/100 M. N.)"],
    [231000, "( DOSCIENTOS TREINTA Y UN MIL PESOS 00/100 M. N.)"],
    // The book prints "TREINTA Y TRÉS MIL".
    [933000, "( NOVECIENTOS TREINTA Y TRES MIL PESOS 00/100 M. N.)"],
  ];
  for (const [amount, words] of printed) assert.equal(amountInWords(amount), words);
});

test("the amount in words handles units, round millions and cents", () => {
  assert.equal(amountInWords(1), "( UN PESO 00/100 M. N.)");
  assert.equal(amountInWords(21), "( VEINTIÚN PESOS 00/100 M. N.)");
  assert.equal(amountInWords(100), "( CIEN PESOS 00/100 M. N.)");
  assert.equal(amountInWords(116), "( CIENTO DIECISÉIS PESOS 00/100 M. N.)");
  assert.equal(amountInWords(1000), "( MIL PESOS 00/100 M. N.)");
  assert.equal(amountInWords(21000), "( VEINTIÚN MIL PESOS 00/100 M. N.)");
  assert.equal(amountInWords(1000000), "( UN MILLÓN DE PESOS 00/100 M. N.)");
  assert.equal(amountInWords(2000000), "( DOS MILLONES DE PESOS 00/100 M. N.)");
  assert.equal(amountInWords(21500000), "( VEINTIÚN MILLONES QUINIENTOS MIL PESOS 00/100 M. N.)");
  assert.equal(amountInWords(1500000000), "( MIL QUINIENTOS MILLONES DE PESOS 00/100 M. N.)");
  assert.equal(amountInWords(1234567.89), "( UN MILLÓN DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE PESOS 89/100 M. N.)");
  assert.equal(amountInWords(0), "( CERO PESOS 00/100 M. N.)");
});

test("Arandas concludes with the cost approach: 8,580,000 and its amount in words", () => {
  const result = concludeValue(
    { values: { costos: 8580000, mercado: null, ingresos: null }, method: { kind: "single", approach: "costos" } },
    EXCEL_PROFILES.ARANDAS,
  );
  assert.equal(result.value, 8580000);
  assert.equal(result.valueInWords, "( OCHO MILLONES QUINIENTOS OCHENTA MIL PESOS 00/100 M. N.)");
  assert.equal(result.summary.mercado, null);
});

test("each approach is rounded in the summary, and TCH income concludes at 700,000", () => {
  const result = concludeValue(
    { values: { ingresos: 700902.934537246 }, method: { kind: "single", approach: "ingresos" } },
    EXCEL_PROFILES.TCH,
  );
  assert.equal(result.value, 700000);
});

test("a weighted conclusion needs weights that add up to 100 %", () => {
  const values = { costos: 8580000, mercado: 8000000 };
  const weighted = concludeValue({ values, method: { kind: "weighted", weights: { costos: 0.5, mercado: 0.5 } } }, EXCEL_PROFILES.ARANDAS);
  assert.equal(weighted.value, 8290000);
  assert.throws(() => concludeValue({ values, method: { kind: "weighted", weights: { costos: 0.5 } } }, EXCEL_PROFILES.ARANDAS));
  assert.throws(() => concludeValue({ values: { costos: null }, method: { kind: "single", approach: "costos" } }, EXCEL_PROFILES.ARANDAS));
});

test("the default config corrects the surface factor, floors the age factor at zero and keeps the Arandas roundings", () => {
  assert.deepEqual(DEFAULT_ENGINE_CONFIG.surfaceOrientation, {
    costs: "reference-over-subject",
    market: "reference-over-subject",
    income: "reference-over-subject",
  });
  assert.deepEqual(DEFAULT_ENGINE_CONFIG.rounding, EXCEL_PROFILES.ARANDAS.rounding);
  assert.equal(DEFAULT_ENGINE_CONFIG.ageFactor.floor, 0);
});

test("every pending decision points to a question sent to the appraiser", () => {
  const questions = readFileSync("docs/fase0/PREGUNTAS-PERITO.md", "utf8");
  for (const decision of PENDING_DECISIONS) {
    assert.match(questions, new RegExp(`\\*\\*${decision.question}\\. `), `pregunta ${decision.question}`);
  }
});
