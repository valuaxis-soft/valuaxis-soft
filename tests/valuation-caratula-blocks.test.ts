import assert from "node:assert/strict";
import test from "node:test";
import {
  getCaratulaBlockKind,
  hasUntitledConcepts,
  UNTITLED_CARATULA_CONCEPT,
} from "../src/features/valuations/services/caratula-blocks";

test("clasifica bloques intermedios, Supuestos y Conclusión", () => {
  assert.equal(getCaratulaBlockKind({ id: "datos", title: "DATOS DEL INMUEBLE" }), "intermediate");
  assert.equal(
    getCaratulaBlockKind({ id: "caratula-block-5-supuestos", title: "Título renombrado" }),
    "assumptions",
  );
  assert.equal(getCaratulaBlockKind({ id: "conclusion", title: "CONCLUSIÓN" }), "conclusion");
});

test("detecta conceptos de Carátula sin título", () => {
  assert.equal(
    hasUntitledConcepts([{ concepts: [{ id: "1", label: "   ", value: "", enabled: true }], apartados: [] }]),
    true,
  );
  assert.equal(
    hasUntitledConcepts([
      { concepts: [{ id: "1", label: UNTITLED_CARATULA_CONCEPT, value: "", enabled: true }], apartados: [] },
    ]),
    false,
  );
});
