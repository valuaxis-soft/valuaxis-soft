import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TerrenoPreview } from "../src/features/valuations/components/terreno-preview";
import { ValuationNavigation } from "../src/features/valuations/components/workspace/valuation-navigation";
import {
  resequenceSections,
} from "../src/features/valuations/components/workspace/valuation-workspace";
import type { AppSection, Block, Apartado, TableContent } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { getCanonicalSectionKey, valuationSectionRegistry } from "../src/features/valuations/sections/section-registry";
import { Tabs } from "../src/components/ui/tabs";
import {
  ensureTerrenoSection,
  ensureTerrenoSections,
  findBoundaryTable,
  getTerrenoElementKind,
  isTerrenoMainBlock,
  isValidTerrenoDistance,
  terrenoSection,
} from "../src/features/valuations/sections/terreno";
import { ensureTableV2 } from "../src/features/valuations/services/table";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

test("Terreno sustituye a Zona en la tercera posición del registro y del workspace", () => {
  const registryKeys = valuationSectionRegistry.map((section) => section.key);
  const sections = createInitialSections();

  assert.equal(registryKeys.includes("ZONA" as never), false);
  assert.equal(registryKeys[2], "TERRENO");
  assert.equal(valuationSectionRegistry[2].label, "INF TERRENO");
  assert.equal(valuationSectionRegistry[2].order, 30);
  assert.equal(getCanonicalSectionKey("ZONA"), "TERRENO");
  assert.equal(sections.some((section) => section.id === "zona"), false);
  assert.equal(sections[2].id, "terreno");

  const workspaceSections = sections.map((section, index) => ({
    ...section,
    label: ["I", "II", "III"][index] ?? `${index + 1}`,
  }));
  const html = renderToStaticMarkup(createElement(
    Tabs,
    { defaultValue: "terreno" },
    createElement(ValuationNavigation, {
      activeSectionId: "terreno",
      enabledSections: workspaceSections,
      iconMap: {},
      onReorder: () => {},
      readOnly: true,
    }),
  ));
  assert.match(html, /III\. INFO TERRENO/);
  assert.doesNotMatch(html, /III\. Zona/);
});

test("la plantilla contiene un bloque TERRENO protegido con un elemento fijo", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const main = section.blocks[0];

  assert.equal(section.blocks.length, 1);
  assert.equal(main.title, "TERRENO");
  // The main block is no longer forced to required: users may delete it (see ensureTerrenoSection).
  assert.equal(main.required, false);
  assert.equal(isTerrenoMainBlock(main), true);
  // Only boundaries remains — access/topography/sketch removed
  assert.deepEqual(main.apartados.map(getTerrenoElementKind), [
    "boundaries",
  ]);
});

test("TERRENO continúa la numeración romana global de los bloques visibles", () => {
  const initial = createInitialSections();
  const initialDatos = initial.find(
    (section) => section.id === "datos" || section.id === "datosGenerales",
  );
  assert.ok(initialDatos);
  const baseBlock = initialDatos.blocks[0];
  initialDatos.blocks = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(baseBlock),
    id: `datos-global-${index + 1}`,
    enabled: true,
  }));
  const sections = ensureTerrenoSections(resequenceSections(initial));
  const datos = sections.find(
    (section) => section.id === "datos" || section.id === "datosGenerales",
  );
  const terrain = sections.find((section) => section.id === "terreno");

  assert.equal(datos?.blocks.filter((block) => block.enabled).length, 4);
  assert.equal(terrain?.blocks[0].sectionLabel, "V");
  const html = renderToStaticMarkup(createElement(TerrenoPreview, {
    header: null,
    section: terrain!,
  }));
  assert.match(html, />V\. TERRENO</);
});

test("la normalización conserva bloques adicionales y el orden editable de conceptos", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const extraBlock: Block = {
    id: "extra-block",
    title: "BLOQUE ADICIONAL",
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: [],
    apartados: [],
    tables: [],
    images: [],
  };
  section.blocks.push(extraBlock);

  const ensured = ensureTerrenoSection(section);
  assert.equal(ensured.blocks[1].id, "extra-block");
  assert.equal(ensured.blocks[0].apartados.length, 1);
});

test("la normalización migra la estructura plana anterior y conserva sus valores", () => {
  const boundariesTemplate = terrenoSection.blocks[0].apartados[0];
  const legacyBoundaries = elementToLegacyBlock(boundariesTemplate, "legacy-boundaries");
  legacyBoundaries.enabled = false;
  const section: AppSection = {
    ...structuredClone(terrenoSection),
    label: "III",
    blocks: [legacyBoundaries],
  };

  // Without a main TERRENO block, ensureTerrenoSection passes blocks through unchanged
  // (legacy flat blocks are no longer migrated into the main block, but their values are kept).
  const ensured = ensureTerrenoSection(section);

  assert.equal(ensured.blocks.length, 1);
  assert.equal(ensured.blocks[0].id, "legacy-boundaries");
  assert.equal(ensured.blocks[0].enabled, false);
  assert.deepEqual(ensured.blocks[0].concepts, boundariesTemplate.concepts);
  assert.deepEqual(ensured.blocks[0].tables, boundariesTemplate.tables);
});

test("Medidas conserva columnas fijas, cuatro rumbos y solo distancias numéricas", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const boundaries = section.blocks[0].apartados.find(
    (element) => getTerrenoElementKind(element) === "boundaries",
  );
  assert.ok(boundaries);

  assert.deepEqual(boundaries.tables[0].columns, ["Rumbo", "Distancia", "Colindancias"]);
  assert.deepEqual(boundaries.tables[0].rows.map((row) => row[0]), [
    "Al Norte:",
    "Al Sur:",
    "Al Este:",
    "Al Oeste:",
  ]);
  assert.equal(boundaries.concepts[0].value, "Escrituras públicas...");
  assert.equal(isValidTerrenoDistance("12.50"), true);
  assert.equal(isValidTerrenoDistance("12,50"), true);
  assert.equal(isValidTerrenoDistance("12 m"), false);
  assert.equal(isValidTerrenoDistance("1e3"), false);

  boundaries.tables[0].rows.push(["Al Noreste:", "25.5", "Predio vecino"]);
  const normalized = ensureTerrenoSection(section);
  const normalizedBoundaries = normalized.blocks[0].apartados.find(
    (element) => getTerrenoElementKind(element) === "boundaries",
  );
  assert.equal(normalizedBoundaries?.tables[0].rows.length, 5);

  const html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section: normalized }));
  assert.match(html, /25\.5 m/);

  normalizedBoundaries!.tables[0].rows = normalizedBoundaries!.tables[0].rows.slice(0, 2);
  const afterDelete = ensureTerrenoSection(normalized);
  const rowsAfterDelete = afterDelete.blocks[0].apartados.find(
    (element) => getTerrenoElementKind(element) === "boundaries",
  )?.tables[0].rows;
  assert.equal(rowsAfterDelete?.length, 2);
});

test("la normalización conserva lo que el valuador agrega a Medidas y colindancias", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const boundaries = section.blocks[0].apartados[0];
  // A stored table of measures comes back as TableV2, not as the template's string grid.
  const stored = { ...ensureTableV2(boundaries.tables[0]), boundaryDistanceFormats: boundaries.tables[0].boundaryDistanceFormats };
  stored.rows[0].cells[stored.columns[1].id] = { kind: "value", value: "12.5" };
  boundaries.tables = [stored as unknown as TableContent, { id: "tbl-own", title: "Tabla configurable", columns: ["Lado", "Nota"], rows: [["A", "Barda"]] }];
  boundaries.images = [{ id: "img-own", title: "Croquis", src: "/croquis.jpg", enabled: true }];
  boundaries.concepts.push({ id: "concept-own", label: "Superficie", value: "250 m²" });
  boundaries.contentLayout = {
    version: 2,
    rows: [
      { id: "r1", columns: [{ id: "c1", items: [{ type: "image", id: "img-own" }] }] },
      { id: "r2", columns: [{ id: "c2", items: [{ type: "table", id: stored.id }] }] },
      { id: "r3", columns: [{ id: "c3", items: [{ type: "concept", id: boundaries.concepts[0].id }] }] },
      { id: "r4", columns: [{ id: "c4", items: [{ type: "table", id: "tbl-own" }] }] },
      { id: "r5", columns: [{ id: "c5", items: [{ type: "concept", id: "concept-own" }] }] },
    ],
  };
  boundaries.startOnNewPage = true;

  const normalized = ensureTerrenoSection(ensureTerrenoSection(section));
  const kept = normalized.blocks[0].apartados[0];

  assert.equal(kept.title, "MEDIDAS Y COLINDANCIAS");
  assert.deepEqual(kept.tables.map((table) => table.id), [stored.id, "tbl-own"]);
  assert.deepEqual(kept.images, boundaries.images);
  assert.deepEqual(kept.concepts.map((concept) => concept.id), [boundaries.concepts[0].id, "concept-own"]);
  assert.deepEqual(kept.contentLayout, boundaries.contentLayout);
  assert.equal(kept.startOnNewPage, true);
  // The table of measures is the same TableV2, with what was typed in it.
  assert.equal(findBoundaryTable(kept)?.id, stored.id);
  assert.deepEqual(ensureTableV2(kept.tables[0]).rows, stored.rows);
  assert.equal(kept.tables[0].boundaryDistanceFormats?.length, 4);
  assert.equal(kept.tables[1].boundaryDistanceFormats, undefined);

  // The dictamen prints the fixed format first and then what was added, in the appraiser's order.
  const html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section: normalized }));
  assert.match(html, /12\.5 m/);
  assert.equal(html.match(/Al Norte:/g)?.length, 1, "the table of measures prints once");
  assert.equal(html.match(/Linderos y colindancias según/g)?.length, 1, "the source of the boundaries prints once");
  // The image is also named in a preload hint ahead of the document: its <img> is the last mention.
  const positions = ["Al Norte:", "Linderos y colindancias según", "/croquis.jpg", "Barda", "250 m²"].map((text) => html.lastIndexOf(text));
  assert.ok(positions.every((position) => position >= 0), "everything added prints");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("la normalización repone la tabla de medidas cuando falta, sin tocar las demás", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  section.blocks[0].apartados[0].tables = [{ id: "tbl-own", title: "Tabla configurable", columns: ["Lado", "Nota"], rows: [["A", "Barda"]] }];

  const tables = ensureTerrenoSection(section).blocks[0].apartados[0].tables;
  assert.deepEqual(tables.map((table) => table.columns), [["Rumbo", "Distancia", "Colindancias"], ["Lado", "Nota"]]);
  assert.deepEqual(tables[1].rows, [["A", "Barda"]]);
});

test("el dictamen imprime el contenido propio del bloque TERRENO y sus demás apartados", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  section.blocks[0].sectionLabel = "III";
  section.blocks[0].concepts.push({ id: "block-concept", label: "Uso de suelo", value: "Habitacional H2" });
  section.blocks[0].apartados.push({
    id: "own-apartado",
    title: "TOPOGRAFÍA",
    enabled: true,
    concepts: [{ id: "own-concept", label: "Pendiente", value: "Terreno plano" }],
    tables: [],
    images: [],
  });

  const html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section: ensureTerrenoSection(section) }));
  assert.match(html, /Habitacional H2/);
  assert.match(html, /III\.1 MEDIDAS Y COLINDANCIAS/);
  assert.match(html, /III\.2 TOPOGRAFÍA/);
  assert.match(html, /Terreno plano/);
});

test("el preview obtiene III. TERRENO del bloque real y no de una cinta de sección", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  section.blocks[0].sectionLabel = "III";
  const html = renderToStaticMarkup(createElement(TerrenoPreview, {
    header: createElement("header", null, "DICTAMEN VALUATORIO"),
    section,
  }));

  assert.match(html, />III\. TERRENO</);
  assert.doesNotMatch(html, /III INFO TERRENO/);
  // Only boundaries remains
  assert.match(html, /MEDIDAS Y COLINDANCIAS/);
});

test("el display limpia un romano guardado sin duplicarlo", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  section.blocks[0].title = "III. TERRENO";
  section.blocks[0].sectionLabel = "III";
  const html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section }));

  assert.match(html, />III\. TERRENO</);
  assert.doesNotMatch(html, /III\. III\. TERRENO/);
});

test("el preview respeta visibilidad del bloque y de sus elementos", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  section.blocks[0].sectionLabel = "III";
  section.blocks[0].apartados[0].enabled = false;
  let html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section }));
  // Boundaries disabled — should not show
  assert.doesNotMatch(html, /MEDIDAS Y COLINDANCIAS/);

  section.blocks[0].apartados[0].enabled = true;
  html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section }));
  assert.match(html, /MEDIDAS Y COLINDANCIAS/);

  section.blocks[0].enabled = false;
  html = renderToStaticMarkup(createElement(TerrenoPreview, { header: null, section }));
  assert.doesNotMatch(html, /III\. TERRENO/);
});

test("la numeración global continúa en Construcción y omite bloques ocultos", () => {
  const initial = createInitialSections();
  const datos = initial.find(
    (section) => section.id === "datos" || section.id === "datosGenerales",
  );
  const terrain = initial.find((section) => section.id === "terreno");
  const construction = initial.find((section) => section.id === "construccion");
  assert.ok(datos && terrain && construction);

  datos.blocks.push({ ...structuredClone(datos.blocks[0]), id: "datos-extra", title: "NUEVO BLOQUE" });
  terrain.blocks.push({ ...structuredClone(construction.blocks[0]), id: "terreno-extra", title: "NUEVO BLOQUE" });
  construction.blocks[1].enabled = false;

  const resequenced = ensureTerrenoSections(resequenceSections(initial));
  const numberedConstruction = resequenced.find((section) => section.id === "construccion")!;

  assert.deepEqual(numberedConstruction.blocks.map((block) => block.sectionLabel), ["VIII", "", "IX"]);
});

function elementToLegacyBlock(element: Apartado, id: string): Block {
  return {
    id,
    title: element.title,
    sectionLabel: "III.1",
    enabled: element.enabled,
    required: true,
    concepts: structuredClone(element.concepts),
    apartados: [],
    tables: structuredClone(element.tables),
    images: structuredClone(element.images),
  };
}
