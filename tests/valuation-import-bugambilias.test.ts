/**
 * «Importar» with «Incluir datos» from a valuation of before (Álvaro, video
 * 8.5, 0:12–3:58): the carátula imports blocks too; every text and value
 * comes (land use, boundaries, characteristics, tables, images in their
 * places) but the names of people, the phones and the emails; and the
 * blocks keep the layout they had in the source. The source is an invented
 * «Casa Bugambilias» shaped as the valuations of October were saved: no
 * content layout stored, tables of the old grid, the croquis between the
 * subbloques of the Block.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { Apartado, AppSection, Block, Concept, ImageContent, TableContent } from "../src/features/valuations/model";
import { initialSectionsFromDocument } from "../src/features/valuations/components/workspace/model/initial-hydration";
import { importDataOptionTexts } from "../src/features/valuations/components/workspace/template-dialogs";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import { buildDocumentTemplate } from "../src/features/valuations/services/document-template";
import { isPersonalDataTitle, withoutContactData } from "../src/features/valuations/services/personal-data";
import { EMPTY_SELECTION, blockLeaves, importStructure, importTree, planImport, sectionLeaves, toggleLeaves } from "../src/features/valuations/services/structure-import";
import { copyBlock } from "../src/features/valuations/services/structure-transfer";

/* ------------------------------------------------------------------ */
/*  The invented «Casa Bugambilias», as October saved it               */
/* ------------------------------------------------------------------ */

const concept = (id: string, label: string, value: string, type?: Concept["type"]): Concept => ({ id, label, value, enabled: true, ...(type ? { type } : {}) });
const apartado = (id: string, title: string, content: Partial<Apartado>): Apartado => ({ id, title, enabled: true, concepts: [], tables: [], images: [], ...content });
const image = (id: string, title: string): ImageContent => ({ id, title, src: `https://example.test/${id}.png` });
const grid = (id: string, title: string, columns: string[], rows: string[][], extra: Partial<TableContent> = {}): TableContent => ({ id, title, columns, rows, enabled: true, ...extra });

function bugambilias(): AppSection[] {
  const caratula: AppSection = {
    id: "caratula", label: "", title: "CARÁTULA", sourceFile: "", enabled: true, required: true,
    blocks: [
      {
        id: "car-bien", title: "DATOS DEL BIEN", sectionLabel: "", enabled: true, required: false, tables: [], images: [], apartados: [],
        concepts: [concept("c-calle", "Calle", "Av. Inventada Poniente"), concept("c-num", "Número exterior", "100"), concept("c-frac", "Fraccionamiento", "Ciudad Bugambilias")],
      },
      {
        id: "car-solicitante", title: "DATOS DEL SOLICITANTE", sectionLabel: "", enabled: true, required: false, tables: [], images: [], apartados: [],
        concepts: [
          concept("c-sol", "Solicitante", "Persona Inventada Uno"),
          concept("c-prop", "Propietario", "Persona Inventada Dos"),
          concept("c-tel", "Teléfono", "33 1234 5678"),
          concept("c-mail", "Correo", "persona@ejemplo.test"),
          concept("c-lugar", "Lugar y fecha de solicitud", "Zapopan, Jalisco a 2 de octubre de 2026"),
        ],
      },
    ],
  };
  const vias = apartado("ap-vias", "VÍAS DE ACCESO, INDICANDO IMPORTANCIA, DISTANCIA Y ORIENTACIÓN", {
    tables: [grid("tbl-vias", "Vialidades", ["Vialidad", "Importancia, distancia y orientación"], [
      ["1. Av. Inventada Sur", "Vialidad principal a 4.5 km al sureste del inmueble."],
      ["2. Boulevard de Prueba", "Vialidad secundaria a 2.7 km."],
    ])],
  });
  const configuracion = apartado("ap-config", "CONFIGURACIÓN Y TOPOGRAFÍA", {
    concepts: [
      concept("t-topo", "Topografía", "Descendente a la parte posterior."),
      concept("t-pend", "Pendiente", "Mayor a 5%"),
      concept("t-pano", "Características panorámicas", "Algunos predios desocupados y desarrollos habitacionales.", "longText"),
      concept("t-uso-aut", "Uso de Suelo Autorizado", "AU/H2-H (Área urbana incorporada), de acuerdo al plan municipal.", "longText"),
      concept("t-uso-act", "Uso de suelo actual", "Habitacional plurifamiliar densidad baja."),
      concept("t-cos", "Coeficiente de Ocupación de Suelo", "0.60"),
      concept("t-dens", "Densidad Habitacional", "Media (42 viviendas/ha máx.)"),
    ],
  });
  const medidas = apartado("terreno-element-medidas-colindancias", "MEDIDAS Y COLINDANCIAS", {
    concepts: [concept("t-lind", "Linderos y colindancias según:", "No se proporcionaron escrituras.")],
    tables: [grid("tbl-med", "Medidas y colindancias", ["Rumbo", "Distancia", "Colindancias"], [
      ["Al Norte:", "12", "Área de conservación ecológica."],
      ["Al Sur:", "12", "Av. Inventada Poniente, vecino con tel. 33 9876 5432"],
    ], { boundaryDistanceFormats: [{ valueFormat: "m" }, { valueFormat: "m" }] })],
  });
  // The croquis are the Block's own, between «Vías de acceso» and the rest, side by side in one row.
  const terreno: Block = {
    id: "terreno-block-principal", title: "INF TERRENO", sectionLabel: "", enabled: true, required: true, concepts: [], tables: [],
    images: [image("img-macro", "MACROLOCALIZACIÓN"), image("img-micro", "MICROLOCALIZACIÓN")],
    apartados: [vias, configuracion, medidas],
    contentLayout: { version: 2, rows: [{ id: "fila-croquis", columns: [{ id: "col-a", items: [{ type: "image", id: "img-macro" }] }, { id: "col-b", items: [{ type: "image", id: "img-micro" }] }] }] },
    blockFlow: {
      version: 2,
      rows: [
        { id: "f-vias", items: [{ type: "apartado", apartadoId: "ap-vias" }] },
        { id: "f-croquis", items: [{ type: "content-row", rowId: "fila-croquis" }] },
        { id: "f-config", items: [{ type: "apartado", apartadoId: "ap-config" }] },
        { id: "f-medidas", items: [{ type: "apartado", apartadoId: "terreno-element-medidas-colindancias" }] },
      ],
    },
  };
  return initialSectionsFromDocument([caratula, { id: "terreno", label: "", title: "INFO TERRENO", sourceFile: "", enabled: true, required: false, blocks: [terreno] }]);
}

/** The new valuation (PTTCH10-0023 in the video): its carátula and an empty terreno. */
function newValuation(): AppSection[] {
  return initialSectionsFromDocument([
    { id: "caratula", label: "", title: "CARÁTULA", sourceFile: "", enabled: true, required: true, blocks: [] },
    { id: "terreno", label: "", title: "INFO TERRENO", sourceFile: "", enabled: true, required: false, blocks: [] },
  ]);
}

const sectionOf = (sections: AppSection[], id: string) => sections.find((item) => item.id === id)!;
const valuesOf = (container: Pick<Block | Apartado, "concepts">) => Object.fromEntries(container.concepts.map((item) => [item.label, item.value]));

/** The Block's order as it prints: each row of the flow, by the titles of its subbloques or the kinds of its content. */
function printedShape(block: Block) {
  const layout = resolveContentLayout(block);
  return resolveBlockFlowV2(block)!.rows.map((row) => row.items.map((item) => {
    if (item.type === "apartado") return block.apartados.find((candidate) => candidate.id === item.apartadoId)!.title;
    const content = layout.rows.find((candidate) => candidate.id === item.rowId)!;
    return content.columns.map((column) => column.items.map((ref) => `${ref.type}:${ref.type === "image" ? block.images.find((img) => img.id === ref.id)?.title : ""}`).join("+")).join(" | ");
  }).join(" ‖ "));
}

const apartadoShape = (apartado: Apartado) => resolveContentLayout(apartado).rows.map((row) => row.columns.map((column) => column.items.map((item) => item.type).join("+")).join(" | "));

function importWholeTerreno(source: AppSection[], destination: AppSection[], options: { includeData?: boolean; includeImages?: boolean } = {}) {
  const tree = importTree(source, sectionOf(destination, "terreno"));
  const terreno = tree.find((item) => item.section.id === "terreno")!;
  const selection = toggleLeaves(EMPTY_SELECTION, tree, blockLeaves(terreno.blocks[0]), true);
  const result = importStructure(destination, "terreno", planImport(tree, selection, destination), { ...options, withoutPersonalData: true });
  assert.equal(result.changed, true, result.reason);
  return sectionOf(result.sections, "terreno").blocks.at(-1)!;
}

/* ------------------------------------------------------------------ */
/*  Incluir datos: every text and value but the personal data         */
/* ------------------------------------------------------------------ */

test("from another valuation, «Incluir datos» brings every text and value of the land: land use, boundaries, characteristics, tables", () => {
  const imported = importWholeTerreno(bugambilias(), newValuation(), { includeData: true, includeImages: true });
  const [vias, configuracion, medidas] = imported.apartados;
  assert.deepEqual(valuesOf(configuracion), {
    "Topografía": "Descendente a la parte posterior.",
    "Pendiente": "Mayor a 5%",
    "Características panorámicas": "Algunos predios desocupados y desarrollos habitacionales.",
    "Uso de Suelo Autorizado": "AU/H2-H (Área urbana incorporada), de acuerdo al plan municipal.",
    "Uso de suelo actual": "Habitacional plurifamiliar densidad baja.",
    "Coeficiente de Ocupación de Suelo": "0.60",
    "Densidad Habitacional": "Media (42 viviendas/ha máx.)",
  });
  assert.deepEqual(vias.tables[0].rows, [
    ["1. Av. Inventada Sur", "Vialidad principal a 4.5 km al sureste del inmueble."],
    ["2. Boulevard de Prueba", "Vialidad secundaria a 2.7 km."],
  ]);
  assert.equal(valuesOf(medidas)["Linderos y colindancias según:"], "No se proporcionaron escrituras.");
  // The boundaries come; the phone written in one of them does not.
  assert.deepEqual(medidas.tables[0].rows, [
    ["Al Norte:", "12", "Área de conservación ecológica."],
    ["Al Sur:", "12", "Av. Inventada Poniente, vecino con tel."],
  ]);
  assert.deepEqual(imported.images.map((item) => item.title), ["MACROLOCALIZACIÓN", "MICROLOCALIZACIÓN"]);
});

test("the imported Block keeps the layout of the source: the croquis side by side between the subbloques, each subbloque on its own row", () => {
  const source = bugambilias();
  const imported = importWholeTerreno(source, newValuation(), { includeData: true, includeImages: true });
  const original = sectionOf(source, "terreno").blocks[0];
  assert.deepEqual(printedShape(imported), printedShape(original));
  assert.deepEqual(printedShape(imported), [
    "VÍAS DE ACCESO, INDICANDO IMPORTANCIA, DISTANCIA Y ORIENTACIÓN",
    "image:MACROLOCALIZACIÓN | image:MICROLOCALIZACIÓN",
    "CONFIGURACIÓN Y TOPOGRAFÍA",
    "MEDIDAS Y COLINDANCIAS",
  ]);
  for (const [index, apartado] of imported.apartados.entries()) {
    assert.deepEqual(apartadoShape(apartado), apartadoShape(original.apartados[index]), apartado.title);
  }
});

test("a layout of before whose refs went stale is copied as the source shows it, not rebuilt with its items side by side", () => {
  const [caratula, terreno] = bugambilias();
  const block = terreno.blocks[0];
  // A stored layout that names an image no longer there and leaves the two croquis out: the source shows them on rows of their own.
  const stale: Block = { ...block, contentLayout: { version: 2, rows: [{ id: "fila-vieja", columns: [{ id: "c", items: [{ type: "image", id: "borrada" }] }] }] } };
  const sections = [caratula, { ...terreno, blocks: [stale] }];
  const copy = copyBlock(stale, sections, { includeImages: true });
  assert.deepEqual(resolveContentLayout(copy).rows.map((row) => row.columns.length), resolveContentLayout(stale).rows.map((row) => row.columns.length));
});

test("the same Block through a template saved «con datos del inmueble» brings the same data and layout", () => {
  const source = bugambilias();
  const template = buildDocumentTemplate(source, { includeImages: true, includeData: true });
  assert.equal(template.includeData, true);
  const fromTemplate = importWholeTerreno(template.sections, newValuation(), { includeData: true, includeImages: true });
  const fromValuation = importWholeTerreno(source, newValuation(), { includeData: true, includeImages: true });
  assert.deepEqual(fromTemplate.apartados.map(valuesOf), fromValuation.apartados.map(valuesOf));
  assert.deepEqual(fromTemplate.apartados.map((item) => item.tables.map((table) => table.rows)), fromValuation.apartados.map((item) => item.tables.map((table) => table.rows)));
  assert.deepEqual(printedShape(fromTemplate), printedShape(fromValuation));
  // The template itself never keeps the personal data.
  const kept = sectionOf(template.sections, "caratula").blocks.find((item) => item.title === "DATOS DEL SOLICITANTE")!;
  assert.deepEqual(valuesOf(kept), { Solicitante: "", Propietario: "", "Teléfono": "", Correo: "", "Lugar y fecha de solicitud": "Zapopan, Jalisco a 2 de octubre de 2026" });
});

test("a template saved without data keeps only the appraiser's texts, and the dialog says how to bring the rest", () => {
  const template = buildDocumentTemplate(bugambilias(), { includeImages: true });
  assert.equal(template.includeData, false);
  const imported = importWholeTerreno(template.sections, newValuation(), { includeData: true });
  assert.equal(valuesOf(imported.apartados[1])["Topografía"], "");
  assert.equal(valuesOf(imported.apartados[1])["Uso de Suelo Autorizado"], "AU/H2-H (Área urbana incorporada), de acuerdo al plan municipal.");
  assert.match(importDataOptionTexts("template").includeData, /se guardó sin datos del inmueble.*«De otro avalúo».*«Incluir datos del inmueble»/);
  assert.match(importDataOptionTexts("template", true).includeData, /sin nombres de personas, teléfonos ni correos/);
  assert.match(importDataOptionTexts("valuation").includeData, /uso de suelo, colindancias, características.*sin nombres de personas, teléfonos ni correos/);
});

/* ------------------------------------------------------------------ */
/*  The carátula imports blocks                                        */
/* ------------------------------------------------------------------ */

test("the carátula imports blocks of another carátula, with their data but no names, phones or emails", () => {
  const source = bugambilias();
  const destination = newValuation();
  const tree = importTree(source, sectionOf(destination, "caratula"));
  // Into the carátula only what it takes: the land Block, with tables and croquis, is not offered there.
  assert.deepEqual(tree.map((item) => item.section.id), ["caratula"]);
  const caratula = tree[0];
  const selection = toggleLeaves(EMPTY_SELECTION, tree, sectionLeaves(caratula).filter((leaf) => !leaf.includes("car-conclusion")), true);
  const result = importStructure(destination, "caratula", planImport(tree, { ...selection, wholeSections: new Set() }, destination), { includeData: true, withoutPersonalData: true });
  assert.equal(result.changed, true, result.reason);
  const blocks = sectionOf(result.sections, "caratula").blocks.filter((item) => item.title.startsWith("DATOS DEL"));
  assert.deepEqual(blocks.map((item) => item.title), ["DATOS DEL BIEN", "DATOS DEL SOLICITANTE"]);
  assert.deepEqual(valuesOf(blocks[0]), { Calle: "Av. Inventada Poniente", "Número exterior": "100", Fraccionamiento: "Ciudad Bugambilias" });
  assert.deepEqual(valuesOf(blocks[1]), { Solicitante: "", Propietario: "", "Teléfono": "", Correo: "", "Lugar y fecha de solicitud": "Zapopan, Jalisco a 2 de octubre de 2026" });
});

test("a whole carátula goes to the carátula of this valuation", () => {
  const source = bugambilias();
  const destination = newValuation();
  const tree = importTree(source, sectionOf(destination, "terreno"));
  const plan = planImport(tree, toggleLeaves(EMPTY_SELECTION, tree, sectionLeaves(tree[0]), true, "caratula"), destination);
  assert.equal(plan.sections[0].destination?.id, "caratula");
});

/* ------------------------------------------------------------------ */
/*  What is personal                                                   */
/* ------------------------------------------------------------------ */

test("names of people, phones and emails are personal by their title; the rest of the data is not", () => {
  for (const title of ["Solicitante", "Propietario:", "Nombre", "Teléfono", "Tel.", "Celular", "Correo electrónico", "E-mail", "Contacto", "CURP", "RFC del propietario", "Nombre del cliente"]) {
    assert.equal(isPersonalDataTitle(title), true, title);
  }
  for (const title of ["Calle", "Uso de suelo actual", "Colindancias", "Topografía", "Nombre del fraccionamiento", "Superficie total de terreno", "Clave catastral", "Lugar y fecha de solicitud"]) {
    assert.equal(isPersonalDataTitle(title), false, title);
  }
  assert.equal(withoutContactData("Llamar al 33 1234 5678 o escribir a persona@ejemplo.test."), "Llamar al o escribir a.");
  // Numbers that are not phones stay: areas, postal codes, coordinates, amounts and dates.
  for (const text of ["360.00 m²", "45237", "20°41'56.22\" N", "$ 8,900,000.00", "PDUCP 2024 - 2027", "TCH-002-10-2026"]) {
    assert.equal(withoutContactData(text), text);
  }
});
