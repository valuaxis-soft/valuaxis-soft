/**
 * What the appraiser reads when a panel's save is refused: the reason in
 * Spanish, without the path of the field in the payload.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { saveRefusedMessage } from "../src/features/valuations/components/calculation/save-refused";
import { SessionExpiredError } from "../src/lib/api-client";
import { issueInSpanish } from "../src/lib/api-response";

const firstIssue = (schema: z.ZodType, value: unknown) => {
  const parsed = schema.safeParse(value);
  assert.equal(parsed.success, false);
  return issueInSpanish(parsed.error!.issues[0]);
};

test("the limits the validator words in English reach the screen in Spanish", () => {
  assert.equal(firstIssue(z.number().max(10), 20_000), "el valor es demasiado grande: el máximo es 10");
  assert.equal(firstIssue(z.number().min(0), -1), "el valor es demasiado chico: el mínimo es 0");
  assert.equal(firstIssue(z.string().max(5), "demasiado"), "el texto es demasiado largo: admite hasta 5 caracteres");
  assert.equal(firstIssue(z.string().min(1), ""), "falta un dato obligatorio");
  assert.equal(firstIssue(z.array(z.number()).max(1), [1, 2]), "hay demasiados renglones: se admiten hasta 1");
  assert.equal(firstIssue(z.number(), "abc"), "falta un dato o no es del tipo esperado");
});

test("a message the schema wrote itself is kept as it is", () => {
  assert.equal(firstIssue(z.number().max(10, "Un factor no puede pasar de 10."), 11), "Un factor no puede pasar de 10.");
});

test("the refusal a panel shows drops the path of the field and keeps the reason", () => {
  const refused = new Error("Los datos enviados no son válidos (cost.item.freight: el valor es demasiado grande: el máximo es 10).");
  assert.equal(saveRefusedMessage(refused, "x"), "Los datos enviados no son válidos (el valor es demasiado grande: el máximo es 10).");
  const row = new Error("Los datos enviados no son válidos (constructions.0.area: el valor es demasiado chico: el mínimo es 0).");
  assert.equal(saveRefusedMessage(row, "x"), "Los datos enviados no son válidos (el valor es demasiado chico: el mínimo es 0).");
  assert.equal(saveRefusedMessage(new Error("El avalúo está bloqueado"), "x"), "El avalúo está bloqueado");
  assert.equal(saveRefusedMessage(new SessionExpiredError(), "x"), "Tu sesión expiró. Vuelve a iniciar sesión.");
  assert.equal(saveRefusedMessage("algo raro", "No se pudo guardar."), "No se pudo guardar.");
});
