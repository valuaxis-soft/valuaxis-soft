/**
 * FAL-28 of the audit of week 8: the format's labels and messages with their
 * accents and agreement. Valuations already stored keep their own text.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createInitialSections } from "../src/features/valuations/sections";
import { fillReplaceConfirmation } from "../src/features/valuations/services/table-context-menu";

const texts = () => JSON.stringify(createInitialSections());

test("the template writes «Número exterior», «Código postal» and «CARACTERÍSTICAS»", () => {
  const all = texts();
  for (const wrong of ["Numero exterior", "Codigo postal", "\"CARACTERISTICAS"]) assert.ok(!all.includes(wrong), wrong);
  for (const right of ["Número exterior / interior", "Código postal", "CARACTERÍSTICAS URBANAS DE LA ZONA", "\"CARACTERÍSTICAS\""]) assert.ok(all.includes(right), right);
});

test("«se sustituyen por el valor copiado», «por la fórmula copiada»", () => {
  assert.match(fillReplaceConfirmation(2, "column", "valor").description, /por el valor copiado\./);
  assert.match(fillReplaceConfirmation(1, "row", "fórmula").description, /por la fórmula copiada\./);
});
