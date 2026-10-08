import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { conclusionValues, withConceptValues } from "../src/features/valuations/calculation/conclusion-document";
import { MACHINERY_PROPERTY_TYPE } from "../src/features/valuations/calculation/machinery-types";
import { CaratulaConclusionModule, CaratulaCoverModule } from "../src/features/valuations/components/caratula-preview-modules";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import { concludeValue } from "../src/features/valuations/engine/conclusion";
import { DEFAULT_ENGINE_CONFIG } from "../src/features/valuations/engine/config";
import type { CaratulaFormData, Letterhead, ValuationMeta } from "../src/features/valuations/model";
import { buildCanonicalValuationSections } from "../src/features/valuations/repositories/valuation.repository";
import { getInitialSectionTemplate } from "../src/features/valuations/sections";
import { appraisedGoodWording } from "../src/features/valuations/services/appraised-good-wording";

const caratula = { tituloInmueble: "", valorTotal: "980000", valorConLetra: "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)", firmas: [], fechaAvaluo: "", mesesVigencia: null, fechaVigencia: "" } as unknown as CaratulaFormData;
const letterhead: Letterhead = { name: "Empresa", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };
// The repository hands the property type key in lower case.
const MACHINERY = MACHINERY_PROPERTY_TYPE.toLowerCase();
const metaOf = (propertyKind: string) => ({ location: "", propertyKind }) as ValuationMeta;

/** The fixed wordings of the printed carátula and of the title band, as text. */
function printed(propertyKind: string) {
  const meta = metaOf(propertyKind);
  const text = (markup: string) => markup.replace(/<[^>]+>/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  return {
    header: text(renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula, letterhead, propertyKind }))).at(-1),
    cover: text(renderToStaticMarkup(createElement(CaratulaCoverModule, { caratula, meta, principalImage: null })))[0],
    conclusion: text(renderToStaticMarkup(createElement(CaratulaConclusionModule, { blocks: [], caratula, meta }))),
  };
}

test("a real estate valuation prints the same fixed wordings as before", () => {
  for (const kind of ["casa", "departamento", "oficina", "terreno", "LOCAL_COMERCIAL"]) {
    assert.deepEqual(printed(kind), {
      header: "DICTAMEN VALUATORIO",
      cover: "Título del inmueble pendiente",
      conclusion: ["CONCLUSIÓN", "VALOR COMERCIAL DEL INMUEBLE", "$980,000.00", "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)"],
    }, kind);
  }
  // No property type (a header rendered alone) is real estate too.
  assert.match(renderToStaticMarkup(createElement(DocumentPreviewHeader, { caratula, letterhead })), />\s*DICTAMEN VALUATORIO\s*<\/div>/);
  assert.deepEqual(
    getInitialSectionTemplate("CONCLUSIONES", "casa")?.blocks[0].concepts.map((concept) => concept.label),
    ["Valor por enfoque de costos", "Valor por enfoque de mercado", "Valor por enfoque de ingresos", "Valor concluido", "Valor concluido con letra", "Observaciones finales"],
  );
  assert.deepEqual(getInitialSectionTemplate("CONCLUSIONES", "casa"), getInitialSectionTemplate("CONCLUSIONES"));
});

test("a machinery valuation names the good as the MEH book does", () => {
  assert.deepEqual(printed(MACHINERY), {
    header: "DICTAMEN VALUATORIO DE MAQUINARIA Y EQUIPO",
    cover: "Título del bien pendiente",
    conclusion: ["CONCLUSIÓN", "VALOR COMERCIAL DEL BIEN", "$980,000.00", "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)"],
  });
  assert.equal(appraisedGoodWording(MACHINERY_PROPERTY_TYPE).commercialValueTitle, "VALOR COMERCIAL DEL BIEN", "whatever the case of the key");
});

test("the conclusion template of a machinery valuation names the concluded value of the machinery, and the calculation fills it", () => {
  const template = getInitialSectionTemplate("CONCLUSIONES", MACHINERY);
  assert.ok(template);
  const real = getInitialSectionTemplate("CONCLUSIONES", "casa");
  assert.deepEqual(template.blocks[0].concepts.map((concept) => concept.label), [
    "Valor por enfoque de costos", "Valor por enfoque de mercado", "Valor por enfoque de ingresos", "Valor comercial de la maquinaria", "Valor concluido con letra", "Observaciones finales",
  ]);
  // Only that label changes: same blocks, same concept ids.
  assert.deepEqual(template.blocks.map((block) => block.concepts.map((concept) => concept.id)), real?.blocks.map((block) => block.concepts.map((concept) => concept.id)));
  for (const key of ["CARATULA", "COSTOS", "MERCADO_VENTA"]) assert.deepEqual(getInitialSectionTemplate(key, MACHINERY), getInitialSectionTemplate(key), key);

  // A valuation that never saved its conclusion section loads the template of its type.
  const labels = (kind: string) => buildCanonicalValuationSections([], kind).find((section) => section.label === "CONCLUSIONES")?.blocks[0].concepts.map((concept) => concept.label);
  assert.equal(labels(MACHINERY)?.[3], "Valor comercial de la maquinaria");
  assert.equal(labels("casa")?.[3], "Valor concluido");

  const values = { costos: 930000, mercado: 980000, ingresos: null };
  const method = { kind: "single" as const, approach: "mercado" as const };
  const result = concludeValue({ values, method }, DEFAULT_ENGINE_CONFIG);
  const filled = withConceptValues(
    { ...template, label: "X" },
    conclusionValues({ values, marketSource: "MAQUINARIA_VENTA", method, justification: null, configured: true, locked: false }, result),
  );
  assert.deepEqual(filled.blocks[0].concepts.slice(3, 5).map((concept) => concept.value), ["$980,000.00", "( NOVECIENTOS OCHENTA MIL PESOS 00/100 M. N.)"]);
});
