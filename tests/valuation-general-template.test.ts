import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getInitialSectionTemplate } from "../src/features/valuations/sections";
import {
  hydrateGeneralCaratulaTemplate,
  isSystemGeneralValuationTemplate,
  resolveResponsibleValuatorName,
} from "../src/features/valuations/services/general-valuation-template";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";

test("recognizes only the system-owned general valuation template", () => {
  assert.equal(isSystemGeneralValuationTemplate({ SNombre: "Plantilla general de aval\u00fao", BEsSistema: true, IdOrganizacion: null }), true);
  assert.equal(isSystemGeneralValuationTemplate({ SNombre: "Plantilla general de aval\u00fao", BEsSistema: false, IdOrganizacion: 7 }), false);
  assert.equal(isSystemGeneralValuationTemplate({ SNombre: "Plantilla residencial", BEsSistema: true, IdOrganizacion: null }), false);
  assert.equal(isSystemGeneralValuationTemplate(null), false);
});

test("general Caratula starts with one company header followed by existing professional blocks", () => {
  const template = getInitialSectionTemplate("CARATULA");
  assert.ok(template);
  assert.deepEqual(template.blocks.map((block) => block.id), [
    COMPANY_HEADER_BLOCK_ID,
    "caratula-block-1-datos-del-inmueble",
    "caratula-block-2-datos-del-solicitante",
    "caratula-block-3-caracteristicas",
    "caratula-block-4-datos-del-avaluo",
    "caratula-block-5-supuestos-y-condiciones-limitantes-que-influyen-en-el-valor-dictaminado",
    "caratula-block-6-conclusion",
  ]);
  assert.equal(template.blocks.filter((block) => block.id === COMPANY_HEADER_BLOCK_ID).length, 1);
});


test("hydrates only exact preview-visible Caratula concepts from creation values", () => {
  const template = getInitialSectionTemplate("CARATULA");
  assert.ok(template);

  const hydrated = hydrateGeneralCaratulaTemplate(template, {
    title: "Casa habitacion",
    clientName: "Cliente de prueba",
    operationName: "Garantia hipotecaria",
    responsibleName: "Perito Responsable",
  });
  const values = new Map(
    hydrated.blocks.flatMap((block) => block.concepts.map((concept) => [concept.id, concept.value])),
  );

  assert.equal(values.get("caratula-block-2-datos-del-solicitante-concept-1"), "Cliente de prueba");
  assert.equal(values.get("caratula-block-2-datos-del-solicitante-concept-2"), "Cliente de prueba");
  assert.equal(values.get("caratula-block-4-datos-del-avaluo-concept-4"), "Garantia hipotecaria");
  assert.equal(values.get("caratula-block-6-conclusion-concept-3"), "Perito Responsable");
  assert.equal(values.get("caratula-titulo-inmueble"), "Casa habitacion");
  assert.equal(values.get("caratula-block-1-datos-del-inmueble-concept-1"), "");
});

test("Caratula hydration is deterministic and does not add blocks or concepts", () => {
  const template = getInitialSectionTemplate("CARATULA");
  assert.ok(template);
  const defaults = { title: "Inmueble", clientName: "Cliente", operationName: "Venta", responsibleName: "Perito" };
  const once = hydrateGeneralCaratulaTemplate(template, defaults);
  const twice = hydrateGeneralCaratulaTemplate(once, defaults);

  assert.deepEqual(twice, once);
  assert.deepEqual(twice.blocks.map((block) => block.id), template.blocks.map((block) => block.id));
  assert.equal(
    twice.blocks.reduce((count, block) => count + block.concepts.length, 0),
    template.blocks.reduce((count, block) => count + block.concepts.length, 0),
  );
});


test("creation passes the canonical appraisal title to general Caratula defaults without using it as Objeto", () => {
  const source = readFileSync(join(process.cwd(), "src/features/valuations/actions/save-valuation.ts"), "utf8");

  assert.match(source, /generalCaratulaDefaults:\s*\{[\s\S]*?title:\s*input\.title/);
  assert.doesNotMatch(source, /objeto:\s*input\.title/);
});
test("responsible valuator uses the selected member full name with creator fallback", () => {
  assert.equal(resolveResponsibleValuatorName({
    SNombre: "Ana",
    SApellidoPaterno: "Lopez",
    SApellidoMaterno: "Diaz",
  }, "Creator"), "Ana Lopez Diaz");
  assert.equal(resolveResponsibleValuatorName(null, "Creator"), "Creator");
});
test("no template or a non-general template does not opt into general Caratula blocks", () => {
  assert.equal(isSystemGeneralValuationTemplate(undefined), false);
  assert.equal(isSystemGeneralValuationTemplate({ SNombre: "Plantilla general de aval\u00fao", BEsSistema: true, IdOrganizacion: 12 }), false);
});
