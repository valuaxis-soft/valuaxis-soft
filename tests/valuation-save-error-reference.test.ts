/**
 * V5.7-20 and V5.7-21: a failed save says why and with a code that is in the
 * server's log; repeated ids get their own before the section is written; the
 * dictamen is opened only after the pending changes are saved.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { errorCodeOf, mustSaveBeforeDocument } from "../src/features/valuations/components/workspace/model/save-status";
import { errorReference, failureCause, valuationErrorResponse } from "../src/features/valuations/services/valuation-error-response";
import { withUniqueNodeKeys } from "../src/features/valuations/services/valuation-workflow/node-keys";
import { ValuationWorkflowError } from "../src/features/valuations/services/valuation-workflow/errors";

const quietly = async <T>(run: () => Promise<T> | T) => {
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    return { result: await run(), logged };
  } finally {
    console.error = original;
  }
};

test("the code is short, readable aloud and read back from the message", () => {
  assert.equal(errorReference(new Uint8Array([0, 1, 2, 3, 4, 5])), "G-234567");
  assert.match(errorReference(), /^G-[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(errorCodeOf("Error al guardar: No se pudo guardar el avalúo. Código: G-7KX3QF."), "G-7KX3QF");
  assert.equal(errorCodeOf("Los datos enviados no son válidos."), null);
});

test("an unexpected failure of the full save returns its cause and a code, and logs both with the valuation's id", async () => {
  const constraint = new Error('new row for relation "devpware_nodos_documentos" violates check constraint "devpware_nodos_documentos_padre_check"');
  const { result, logged } = await quietly(() => valuationErrorResponse("VALUATION_FULL", constraint, "No se pudo guardar el avalúo.", { valuationId: "avaluo-de-prueba" }));
  assert.equal(result.status, 500);
  const body = await result.json() as { error: string; code: string };
  assert.match(body.error, /^No se pudo guardar el avalúo: el documento tiene una estructura que la base de datos no acepta\. Código: G-[A-Z0-9]{6}\.$/);
  assert.equal(errorCodeOf(body.error), body.code);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], `[VALUATION_FULL] ${body.code}`);
  assert.equal((logged[0][1] as { valuationId: string }).valuationId, "avaluo-de-prueba");
  assert.doesNotMatch(body.error, /devpware_/, "the table and constraint stay in the log");
});

test("the database's errors read as what happened; business errors keep their message and status", async () => {
  const known = (code: string) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6" });
  assert.equal(failureCause(known("P2034")), "otro guardado del mismo avalúo ocurrió al mismo tiempo");
  assert.equal(failureCause(known("P2028")), "el guardado tardó demasiado");
  assert.equal(failureCause(new Error("sin pista")), null);

  const { result: unknown } = await quietly(() => valuationErrorResponse("VALUATION_FULL", new Error("sin pista"), "No se pudo guardar el avalúo.", { valuationId: "x" }));
  assert.match((await unknown.json() as { error: string }).error, /^No se pudo guardar el avalúo\. Código: G-/);

  const business = valuationErrorResponse("VALUATION_FULL", new ValuationWorkflowError("El avaluo esta bloqueado", 409), "No se pudo guardar el avalúo.");
  assert.equal(business.status, 409);
  assert.deepEqual(await business.json(), { error: "El avaluo esta bloqueado" });
});

test("repeated ids in a section get their own, the layouts follow, and the same payload always gets the same ids", () => {
  const image = (id: string) => ({ id, title: "CROQUIS", src: "uploads/2026-11/croquis.jpg" });
  const layout = (id: string) => ({ version: 2, rows: [{ id: "row-1", columns: [{ id: "col-1", items: [{ type: "image", id }] }] }] });
  const section = {
    id: "croquisComparables",
    blocks: [
      { id: "bloque-a", images: [image("croquis-macrolocalizacion")], contentLayout: layout("croquis-macrolocalizacion") },
      { id: "bloque-b", images: [image("croquis-macrolocalizacion")], contentLayout: layout("croquis-macrolocalizacion") },
      { id: "croquis-mapa-comparables", images: [image("croquis-mapa-comparables")], subBlocks: [{ id: "bloque-a", images: [image("foto")] }] },
    ],
  };
  const first = withUniqueNodeKeys(section);
  const [a, b, c] = first.section.blocks as Array<typeof section.blocks[number] & { contentLayout?: ReturnType<typeof layout> }>;
  assert.equal(a.images[0].id, "croquis-macrolocalizacion");
  assert.equal(b.images[0].id, "croquis-macrolocalizacion-2");
  assert.equal(b.contentLayout?.rows[0].columns[0].items[0].id, "croquis-macrolocalizacion-2", "the moved block's layout points to its image");
  assert.equal(a.contentLayout?.rows[0].columns[0].items[0].id, "croquis-macrolocalizacion");
  assert.equal(c.images[0].id, "croquis-mapa-comparables-2", "an image never shares the key of its own block");
  assert.equal(c.subBlocks?.[0].id, "bloque-a-2");
  assert.deepEqual(first.renamed.map((item) => `${item.kind}:${item.from}→${item.to}`), [
    "image:croquis-macrolocalizacion→croquis-macrolocalizacion-2",
    "image:croquis-mapa-comparables→croquis-mapa-comparables-2",
    "subBlock:bloque-a→bloque-a-2",
  ]);
  assert.deepEqual(withUniqueNodeKeys(section), first);
  assert.equal(withUniqueNodeKeys({ id: "x", blocks: [{ id: "solo", images: [image("una")] }] }).renamed.length, 0);
});

test("V5.7-21: the dictamen is drawn from what is saved, so it saves first with changes pending or a save on its way", () => {
  assert.equal(mustSaveBeforeDocument({ saving: false, hasUnsavedChanges: false }), false);
  assert.equal(mustSaveBeforeDocument({ saving: false, hasUnsavedChanges: true }), true);
  assert.equal(mustSaveBeforeDocument({ saving: true, hasUnsavedChanges: false }), true);
});
