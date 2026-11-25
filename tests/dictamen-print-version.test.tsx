/**
 * Dictamen review of 14 Nov 2026 (B-01, B-13, B-14, B-12) and the client's
 * rule that a concluded valuation never changes: a dictamen concluded before
 * these fixes reprints exactly as it did (print rules 0); a draft, or one
 * concluded since, prints them. Every text is invented.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { precisionOf, NEW_VALUATION_PRECISION } from "../src/features/valuations/calculation/calculation-precision";
import { construccionFlowItems } from "../src/features/valuations/components/construccion-preview";
import { ValuationDictamen } from "../src/features/valuations/components/dictamen/valuation-dictamen";
import { sectionFlowItems } from "../src/features/valuations/components/report-preview";
import type { AppSection } from "../src/features/valuations/model";
import { buildCanonicalValuationSections, type ValuationDetail } from "../src/features/valuations/repositories/valuation.repository";
import { createInitialSections } from "../src/features/valuations/sections";
import { caratulaSection } from "../src/features/valuations/sections/caratula";
import { construccionSection } from "../src/features/valuations/sections/construccion";
import { formatConceptValueForDocument } from "../src/features/valuations/services/concept-value-format";
import { CURRENT_PRINT_VERSION, printVersionOf, withPrintVersion } from "../src/features/valuations/services/print-version";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

/* ------------------------------------------------------------------ */
/*  Print rules of a version                                          */
/* ------------------------------------------------------------------ */

test("a draft prints with the current rules; a concluded version with those it was stamped with, 0 before the stamp", () => {
  assert.equal(printVersionOf(null, false), CURRENT_PRINT_VERSION);
  assert.equal(printVersionOf(null, true), 0, "concluded before the stamp existed");
  assert.equal(printVersionOf(NEW_VALUATION_PRECISION, true), 0, "its precision is not a stamp");
  assert.equal(printVersionOf(withPrintVersion(NEW_VALUATION_PRECISION), true), CURRENT_PRINT_VERSION);
});

test("the stamp keeps the version's calculation precision", () => {
  assert.deepEqual(precisionOf(withPrintVersion(NEW_VALUATION_PRECISION)), NEW_VALUATION_PRECISION);
  assert.deepEqual(precisionOf(withPrintVersion(null)), precisionOf(null), "no precision stays the legacy one");
});

/* ------------------------------------------------------------------ */
/*  B-01 and B-13: the construction section                           */
/* ------------------------------------------------------------------ */

/** The construction template with what an appraiser captured in III and IV, and a photo in III. */
function capturedConstruction(): AppSection {
  const section = structuredClone(construccionSection) as AppSection;
  return {
    ...section,
    blocks: section.blocks.map((block) => {
      if (block.id === "construccion_descripcion_general") {
        return {
          ...block,
          concepts: block.concepts.map((concept) => (concept.label === "Uso actual" ? { ...concept, value: "Casa habitación de prueba" } : concept)),
          images: [{ id: "foto-fachada", title: "Fachada inventada", src: "/demo/fachada.jpg", enabled: true }],
        };
      }
      if (block.id === "elementos_construccion") {
        return {
          ...block,
          concepts: block.concepts.map((concept) => ({ ...concept, value: "Texto general de elementos inventado" })),
          apartados: block.apartados.map((apartado) => (apartado.id === "obra_gruesa"
            ? { ...apartado, concepts: apartado.concepts.map((concept) => (concept.label === "Cimentación" ? { ...concept, value: "Zapatas corridas inventadas" } : concept)) }
            : apartado)),
        };
      }
      return block;
    }),
  };
}

const markup = (items: Array<{ node: React.ReactNode }>) => items.map((item) => renderToStaticMarkup(createElement("div", null, item.node))).join("");

test("B-01: the construction section prints the concepts and images of its blocks, on its own pages and after another section", () => {
  const section = capturedConstruction();
  for (const printed of [markup(construccionFlowItems(section)), markup(sectionFlowItems(section))]) {
    assert.match(printed, /DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES/);
    assert.match(printed, /Uso actual/);
    assert.match(printed, /Casa habitación de prueba/, "a concept of the block");
    assert.match(printed, /Texto general de elementos inventado/, "the block's own concept in IV");
    assert.match(printed, /Zapatas corridas inventadas/, "a concept of a subblock");
    assert.match(printed, /\/demo\/fachada\.jpg/, "an image of the block");
  }
});

test("B-13: the construction section prints in the document's type", () => {
  const printed = markup(sectionFlowItems(capturedConstruction()));
  assert.doesNotMatch(printed, /Arial|Calibri/);
  assert.doesNotMatch(printed, /text-\[#222\]/);
});

test("print rules 0: the construction section prints as it did, without the block's concepts and in its own type", () => {
  const section = capturedConstruction();
  const printed = markup(sectionFlowItems(section, false, undefined, 0));
  assert.doesNotMatch(printed, /Casa habitación de prueba|Texto general de elementos inventado|\/demo\/fachada\.jpg/);
  assert.match(printed, /Zapatas corridas inventadas/, "the subblocks printed then too");
  assert.match(printed, /Arial/);
  assert.doesNotMatch(markup(construccionFlowItems(section, 0)), /Casa habitación de prueba/);
});

/** A saved construction section with the captured concept, as the database keeps it. */
function savedConstruction() {
  const concept = (id: number, key: string, label: string, value: string) => ({
    IdNodoDocumento: id, SClave: key, STitulo: label, IOrden: id, DFechaEliminacion: null, JConfiguracion: { kind: "concept", payload: {} },
    valores: [{ IdValorNodoDocumento: id, SValorTexto: value, NValorNumerico: null, BValorBooleano: null, DValorFecha: null, JValorComplejo: null }],
    nodosHijos: [], tablasDocumentos: [],
  });
  return {
    IdSeccionDocumento: 4, SClave: "construccion", SNombre: "INF. CONSTRUCCION", IOrden: 3, BVisible: true, BObligatoria: false, JConfiguracion: null,
    nodos: [{
      IdNodoDocumento: 40, IdNodoPadre: null, SClave: "construccion_descripcion_general", DFechaEliminacion: null, IOrden: 0,
      STitulo: "DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES", BVisible: true, BObligatorio: false, JConfiguracion: { kind: "block", payload: {} },
      valores: [], tablasDocumentos: [], nodosHijos: [concept(41, "uso-actual", "Uso actual", "Casa habitación de prueba")],
    }],
  };
}

const dictamen = (printVersion: number) => {
  const valuation = {
    id: "00000000-0000-4000-8000-000000000001", folio: "PRB-0001", locked: true, printVersion,
    sections: buildCanonicalValuationSections([savedConstruction()] as never, null, null, { fullTexts: printVersion >= 1 }),
    comparables: [], caratula: null,
  } as unknown as ValuationDetail;
  return renderToStaticMarkup(createElement(ValuationDictamen, {
    canShare: false, concluded: true, letterhead: { name: "Despacho de prueba", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null },
    initialValuation: valuation, unaccreditedNotice: false, valuationId: valuation.id,
  }));
};

test("the dictamen of a valuation concluded before these fixes reprints as it did; one concluded since prints them", () => {
  const before = dictamen(0);
  assert.match(before, /DESCRIPCIÓN GENERAL DE LAS CONSTRUCCIONES/, "the section is in the dictamen");
  assert.doesNotMatch(before, /Casa habitación de prueba/, "as it was issued");
  assert.match(dictamen(CURRENT_PRINT_VERSION), /Casa habitación de prueba/);
});

/* ------------------------------------------------------------------ */
/*  B-14: titles longer than their column                             */
/* ------------------------------------------------------------------ */

function longTitles() {
  const blockTitle = "BLOQUE CON UN TÍTULO MUY EXTENSO ".repeat(9).trim();
  const tableTitle = "TABLA DE SUPERFICIES PRIVATIVAS Y COMUNES DEL CONDOMINIO ".repeat(5).trim();
  const columnLabel = "SUPERFICIE PRIVATIVA SEGÚN ESCRITURA ".repeat(6).trim();
  const conceptLabel = "CONCEPTO DE PRUEBA CON UN TÍTULO LARGO ".repeat(8).trim();
  const section = {
    IdSeccionDocumento: 1, SClave: "datosGenerales", SNombre: "Datos generales", IOrden: 1, BVisible: true, BObligatoria: false, JConfiguracion: null,
    nodos: [{
      IdNodoDocumento: 10, IdNodoPadre: null, SClave: "bloque-1", DFechaEliminacion: null, IOrden: 0, STitulo: blockTitle.slice(0, 250),
      BVisible: true, BObligatorio: false, JConfiguracion: { kind: "block", fullTitle: blockTitle }, valores: [],
      nodosHijos: [{
        IdNodoDocumento: 11, SClave: "concepto-1", STitulo: conceptLabel.slice(0, 250), IOrden: 0, DFechaEliminacion: null,
        JConfiguracion: { kind: "concept", payload: {}, fullTitle: conceptLabel },
        valores: [{ IdValorNodoDocumento: 11, SValorTexto: "Dato inventado", NValorNumerico: null, BValorBooleano: null, DValorFecha: null, JValorComplejo: null }],
        nodosHijos: [], tablasDocumentos: [],
      }],
      tablasDocumentos: [{
        IdTablaDocumento: 1, SNombre: tableTitle.slice(0, 180), IOrden: 0, JConfiguracion: { clientId: "tabla-larga", fullTitle: tableTitle },
        columnas: [{ IdColumnaTablaDocumento: 100, SClave: "col_1", SNombre: columnLabel.slice(0, 180), IOrden: 0, DFechaEliminacion: null, JConfiguracion: { fullLabel: columnLabel } }],
        filas: [{ IdFilaTablaDocumento: BigInt(1000), IOrden: 0, BActivo: true, celdas: [{ IdCeldaTablaDocumento: BigInt(10000), IdColumnaTablaDocumento: 100, SValorTexto: "10", NValorNumerico: null, BValorBooleano: null, DValorFecha: null, JValorComplejo: null }] }],
      }],
    }],
  };
  return { section, blockTitle, tableTitle, columnLabel, conceptLabel };
}

const readBlock = (fullTexts?: boolean) => {
  const { section } = longTitles();
  return buildCanonicalValuationSections([section] as never, null, null, fullTexts === undefined ? undefined : { fullTexts }).find((item) => item.id === "datosGenerales")?.blocks[0];
};

test("B-14: a title longer than its column reads back whole: block, concept, table and column", () => {
  const { blockTitle, tableTitle, columnLabel, conceptLabel } = longTitles();
  assert.ok(tableTitle.length > 180 && columnLabel.length > 180 && blockTitle.length > 250 && conceptLabel.length > 250);
  const block = readBlock();
  assert.equal(block?.title, blockTitle);
  assert.equal(block?.concepts[0].label, conceptLabel);
  assert.equal(block?.tables[0].title, tableTitle);
  assert.equal(block?.tables[0].table?.title, tableTitle);
  assert.deepEqual(JSON.parse(block?.tables[0].columns ?? "[]"), [columnLabel]);
  assert.equal(block?.tables[0].table?.columns[0].name, columnLabel);
});

test("print rules 0: the titles read as they were stored, cut by their column", () => {
  const { blockTitle, tableTitle, columnLabel } = longTitles();
  const block = readBlock(false);
  assert.equal(block?.title, blockTitle.slice(0, 250));
  assert.equal(block?.tables[0].title, tableTitle.slice(0, 180));
  assert.deepEqual(JSON.parse(block?.tables[0].columns ?? "[]"), [columnLabel.slice(0, 180)]);
});

/* ------------------------------------------------------------------ */
/*  B-12: the template of a new valuation                             */
/* ------------------------------------------------------------------ */

test("B-12: the carátula and Datos templates write their labels with accents, their ids kept", () => {
  const texts = JSON.stringify(createInitialSections().filter((section) => section.id === "caratula" || section.id === "datos"));
  for (const wrong of ["Telefono", "Fecha de avaluo", "Vigencia de avaluo", "Uso del avaluo", "Proposito", "Delegacion", "Numero de niveles", "construccion\"", "DATOS DEL AVALUO", "Descripcion\"", "INFORMACION", "UBICACION", "Clasificacion", "Indice", "socioeconomico", "inspeccion", "se valua\""]) {
    assert.ok(!texts.includes(wrong), wrong);
  }
  const byId = new Map(caratulaSection.blocks.flatMap((block) => block.concepts.map((concept) => [concept.id, concept.label])));
  assert.equal(byId.get("caratula-block-2-datos-del-solicitante-concept-3"), "Teléfono");
  assert.equal(byId.get("caratula-block-4-datos-del-avaluo-concept-1"), "Fecha de avalúo");
  assert.equal(byId.get("caratula-block-4-datos-del-avaluo-concept-4"), "Propósito del avalúo");
  assert.equal(byId.get("caratula-block-3-caracteristicas-concept-2"), "Superficie total de construcción");
  assert.ok(caratulaSection.blocks.some((block) => block.id === "caratula-block-4-datos-del-avaluo" && block.title === "DATOS DEL AVALÚO"));
});

test("B-12: the surfaces of a new carátula print in m²", () => {
  const concepts = caratulaSection.blocks.flatMap((block) => block.concepts);
  for (const label of ["Superficie total terreno", "Superficie total de construcción"]) {
    const concept = concepts.find((item) => item.label === label)!;
    assert.equal(formatConceptValueForDocument({ ...concept, value: "205" }), "205 m²", label);
  }
});

test("B-12: a valuation saved with the old labels keeps them (#156)", () => {
  const saved = {
    IdSeccionDocumento: 1, SClave: "caratula", SNombre: "CARATULA", IOrden: 0, BVisible: true, BObligatoria: true, JConfiguracion: null,
    nodos: [{
      IdNodoDocumento: 10, IdNodoPadre: null, SClave: "caratula-block-4-datos-del-avaluo", DFechaEliminacion: null, IOrden: 0, STitulo: "DATOS DEL AVALUO",
      BVisible: true, BObligatorio: false, JConfiguracion: { kind: "block", payload: {} }, valores: [], tablasDocumentos: [],
      nodosHijos: [{
        IdNodoDocumento: 11, SClave: "caratula-block-4-datos-del-avaluo-concept-1", STitulo: "Fecha de avaluo", IOrden: 0, DFechaEliminacion: null,
        JConfiguracion: { kind: "concept", payload: {} },
        valores: [{ IdValorNodoDocumento: 11, SValorTexto: "2026-12-01", NValorNumerico: null, BValorBooleano: null, DValorFecha: null, JValorComplejo: null }],
        nodosHijos: [], tablasDocumentos: [],
      }],
    }],
  };
  const block = buildCanonicalValuationSections([saved] as never).find((section) => section.id === "caratula")?.blocks.find((item) => item.id === "caratula-block-4-datos-del-avaluo");
  assert.equal(block?.title, "DATOS DEL AVALUO");
  assert.equal(block?.concepts[0].label, "Fecha de avaluo");
});
