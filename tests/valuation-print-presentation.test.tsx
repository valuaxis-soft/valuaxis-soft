import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { AutoPaginatedDocumentFlow } from "../src/features/valuations/components/document-preview-page";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DocumentThemeProvider, type DocumentThemeVariant } from "../src/features/valuations/components/document-theme";
import { CaratulaAssumptionsModule } from "../src/features/valuations/components/caratula-preview-modules";
import { figureColumn, generatedTable, moneyColumn, textColumn } from "../src/features/valuations/calculation/generated-content";
import type { Apartado, Block, Concept, ContentLayout } from "../src/features/valuations/model";
import { formatConceptValueForDocument } from "../src/features/valuations/services/concept-value-format";
import { isLongTextList } from "../src/features/valuations/services/document-long-text";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });

const apartado = (id: string, concepts: Concept[], extra: Partial<Apartado> = {}): Apartado => ({
  id,
  title: `Apartado ${id}`,
  enabled: true,
  concepts,
  images: [],
  tables: [],
  ...extra,
} as Apartado);

const block = (extra: Partial<Block>): Block => ({
  id: "bloque",
  title: "TERRENO",
  sectionLabel: "III",
  enabled: true,
  required: false,
  concepts: [],
  apartados: [],
  tables: [],
  images: [],
  ...extra,
} as Block);

/** One row per item, each in a single column, like the layout the editor creates. */
const rowsOf = (...rows: Array<Array<{ type: "concept" | "image" | "table"; id: string }>>): ContentLayout => ({
  version: 2,
  rows: rows.map((columns, rowIndex) => ({
    id: `row-${rowIndex}`,
    columns: columns.map((item, columnIndex) => ({ id: `col-${rowIndex}-${columnIndex}`, items: [item] })),
  })),
});

function render(node: ReactNode, variant: DocumentThemeVariant = "standard") {
  return renderToStaticMarkup(<DocumentThemeProvider variant={variant}>{node}</DocumentThemeProvider>);
}

const renderItems = (target: Block, variant?: DocumentThemeVariant) =>
  render(documentBlockFlowItems(target).map((item) => createElement("div", { key: item.id, "data-item": item.id }, item.node)), variant);

const LONG = "Es la cuantía estimada por la que un activo o pasivo debería intercambiarse en la fecha de valuación entre un comprador dispuesto a comprar y un vendedor dispuesto a vender.";

/* ------------------------------------------------------------------ */
/*  Values: phone and units                                            */
/* ------------------------------------------------------------------ */

test("a phone concept prints as the editor shows it", () => {
  const phone = (value: string) => formatConceptValueForDocument({ type: "phone", value });
  assert.equal(phone("523485595955"), "+52 (348) 559 5955", "the editor stores the digits, country code included");
  assert.equal(phone("3485595955"), "+52 (348) 559 5955");
  assert.equal(phone("+52 (348) 559 5955"), "+52 (348) 559 5955");
  assert.equal(phone("348 559 5955 ext. 12"), "348 559 5955 ext. 12", "more than a number prints as written");
  assert.equal(phone("12025550123"), "12025550123", "not a ten-digit Mexican number");
  assert.equal(phone(""), "");
  assert.equal(formatConceptValueForDocument({ type: "text", value: "523485595955" }), "523485595955");
});

test("a value prints with its unit in every section, with or without the concept layout", () => {
  const concepts = [
    concept("frente", "Frente de terreno", "7.50", { type: "number", valueFormat: "m" }),
    concept("superficie", "Superficie total", "169.78", { type: "measurement" }),
    concept("valor", "Valor unitario", "9000", { type: "currency" }),
    concept("indiviso", "Indiviso", "100", { type: "number", valueFormat: "percent" }),
    concept("otra", "Tanque", "300", { type: "number", valueFormat: "custom", customUnit: "lts" }),
    concept("tel", "Teléfono", "523485595955", { type: "phone" }),
  ];
  const target = block({ apartados: [apartado("config", concepts)] });

  // Terreno, Datos generales and Construcción render without the concept layout; the cost and pre-market sections with it.
  for (const applyConceptLayout of [false, true]) {
    const html = render(documentBlockFlowItems(target, { applyConceptLayout }).map((item) => createElement("div", { key: item.id }, item.node)));
    for (const printed of ["7.50 m<", "169.78 m²<", "$9,000.00<", "100 %<", "300 lts<", "+52 (348) 559 5955<"]) {
      assert.ok(html.includes(printed), `${printed} with applyConceptLayout=${applyConceptLayout}`);
    }
  }

  const technical = renderItems(block({ apartados: [apartado("lista", concepts, { presentationMode: "technical-list" })] }));
  assert.ok(technical.includes("7.50 m<") && technical.includes("169.78 m²<"), "a technical list prints the unit too");
});

/* ------------------------------------------------------------------ */
/*  Text: justified, separated, larger when long                       */
/* ------------------------------------------------------------------ */

test("concept values are justified and each concept is set apart by a hairline in the report", () => {
  const target = block({
    apartados: [apartado("obra", [concept("a", "Cimentación", "Mampostería"), concept("b", "Muros", "Ladrillo")], {
      contentLayout: rowsOf([{ type: "concept", id: "a" }], [{ type: "concept", id: "b" }]),
    })],
  });
  const html = renderItems(target);
  assert.equal(html.match(/<span class="[^"]*text-justify[^"]*">/g)?.length, 2);
  assert.equal(html.match(/border-b border-slate-200/g)?.length, 2);
  assert.equal(html.match(/py-\[3px\]/g)?.length, 2);

  // Side by side, the two concepts share one rule under the row, level whatever their heights.
  const pair = renderItems(block({ apartados: [apartado("obra", target.apartados[0].concepts, { contentLayout: rowsOf([{ type: "concept", id: "a" }, { type: "concept", id: "b" }]) })] }));
  assert.equal(pair.match(/border-b border-slate-200/g)?.length, 1);
  assert.match(pair, /class="[^"]*grid-cols-2 gap-x-4 border-b border-slate-200"/);
  assert.equal(pair.match(/py-\[3px\]/g)?.length, 2);

  const technical = renderItems(block({ apartados: [apartado("obra", [concept("a", "Cimentación", "Mampostería")], { presentationMode: "technical-list" })] }));
  assert.match(technical, /py-\[3px\] border-b border-slate-200/);
  assert.match(technical, /text-justify/);

  // The cover keeps its compact columns: no rules, no justified short data.
  const cover = renderItems(target, "caratula");
  assert.doesNotMatch(cover, /border-b border-slate-200|text-justify/);
});

test("the cover's assumptions are justified", () => {
  const html = render(createElement(CaratulaAssumptionsModule, { blocks: [block({ title: "SUPUESTOS", concepts: [concept("a", "", LONG)] })] }), "caratula");
  assert.match(html, /text-justify/);
});

test("a list reads as long text when its values average a hundred characters", () => {
  assert.equal(isLongTextList([concept("a", "Valor comercial", LONG), concept("b", "Factor de edad", "Corresponderá a las diferencias en la edad de los inmuebles.")]), true);
  assert.equal(isLongTextList([concept("a", "Niveles", "4"), concept("b", "Uso", LONG)]), false, "one long value among data does not make a text");
  assert.equal(isLongTextList([concept("a", "Uso", LONG), concept("b", "Oculto", "4", { enabled: false }), concept("c", "Vacío", "  ")]), true, "hidden and empty concepts do not count");
  assert.equal(isLongTextList([]), false);
  assert.equal(isLongTextList([concept("a", "Vacío", "")]), false);
});

test("definitions and declarations print a little larger; data lists keep their size", () => {
  const definitions = renderItems(block({ apartados: [apartado("def", [concept("a", "Valor comercial", LONG), concept("b", "Enfoque de costos", LONG)])] }));
  // Label and value of both concepts.
  assert.equal(definitions.match(/text-\[12px\] leading-\[1\.45\]/g)?.length, 4);
  assert.doesNotMatch(definitions, /text-\[11px\] (?:font-semibold )?text-\[#(?:1a1a1a|333333)\]/, "the larger size replaces the standard one");
  assert.match(definitions, /py-\[5px\]/);

  const data = renderItems(block({ apartados: [apartado("datos", [concept("a", "Niveles", "4"), concept("b", "Clase", "C")])] }));
  assert.doesNotMatch(data, /leading-\[1\.45\]|py-\[5px\]/);

  // Concepts placed directly in the block follow the same rule.
  const declarations = renderItems(block({ concepts: [concept("a", "8", LONG), concept("b", "10", LONG)] }));
  assert.equal(declarations.match(/text-\[12px\] leading-\[1\.45\]/g)?.length, 4);
});

/* ------------------------------------------------------------------ */
/*  Pagination of long apartados                                       */
/* ------------------------------------------------------------------ */

test("an apartado is one flow item per row, so a long one continues on the next page", () => {
  const concepts = [concept("a", "Valor comercial", LONG), concept("b", "Enfoque de costos", LONG), concept("c", "Enfoque de ingresos", LONG)];
  const definitions = apartado("def", concepts, {
    contentLayout: rowsOf([{ type: "concept", id: "a" }], [{ type: "concept", id: "b" }], [{ type: "concept", id: "c" }]),
  });
  const items = documentBlockFlowItems(block({ apartados: [definitions] }));
  // Block title, then the apartado title with its first row, then one item per further row.
  assert.equal(items.length, 4);
  const [, first, second, third] = items;
  assert.deepEqual([first.continuesPrevious, second.continuesPrevious, third.continuesPrevious], [undefined, true, true]);
  assert.equal(new Set(items.map((item) => item.id)).size, 4, "ids are unique");
  assert.ok(second.id.startsWith(`${first.id}:`));

  const html = (node: ReactNode) => render(node);
  assert.match(html(first.node), /Apartado def[\s\S]*Valor comercial/);
  assert.doesNotMatch(html(first.node), /Enfoque de costos/);
  assert.match(html(second.node), /^<div class="pl-3">[\s\S]*Enfoque de costos/, "a further row keeps the apartado's indent");
  assert.doesNotMatch(html(second.node), /Apartado def/, "the title prints once");
  assert.match(html(third.node), /text-\[12px\] leading-\[1\.45\]/, "every row follows the apartado's text size");

  // The page break of the apartado stays on the item that carries its title.
  const broken = documentBlockFlowItems(block({ apartados: [{ ...definitions, startOnNewPage: true }] }));
  assert.deepEqual(broken.map((item) => Boolean(item.startOnNewPage)), [false, true, false, false]);

  // A technical list stays whole.
  const technical = documentBlockFlowItems(block({ apartados: [{ ...definitions, presentationMode: "technical-list" }] }));
  assert.equal(technical.length, 2);
});

test("rows of one apartado sit together on a page: the item before a continuation drops its gap", () => {
  const html = renderToStaticMarkup(createElement(AutoPaginatedDocumentFlow, {
    contentClassName: "space-y-4",
    header: createElement("header", null, "Encabezado"),
    pageKeyPrefix: "test",
    items: [
      { id: "titulo", node: "Título" },
      { id: "fila-1", node: "Fila 1" },
      { id: "fila-2", continuesPrevious: true, node: "Fila 2" },
      { id: "otro", node: "Otro" },
    ],
  }));
  assert.match(html, /class="flow-root" data-document-flow-item-id="titulo"/);
  assert.match(html, /class="flow-root mb-0!" data-document-flow-item-id="fila-1"/);
  assert.match(html, /class="flow-root" data-document-flow-item-id="fila-2"/);
});

/* ------------------------------------------------------------------ */
/*  Images side by side and tables                                     */
/* ------------------------------------------------------------------ */

test("images that share a row print as a compact framed pair with their captions", () => {
  const image = (id: string, captionText: string) => ({ id, title: id, src: `https://example.test/${id}.jpg`, enabled: true, captionEnabled: true, captionText });
  const sketches = apartado("croquis", [], {
    images: [image("macro", "MACROLOCALIZACIÓN"), image("micro", "MICROLOCALIZACIÓN")],
    contentLayout: rowsOf([{ type: "image", id: "macro" }, { type: "image", id: "micro" }]),
  });
  const pair = renderItems(block({ apartados: [sketches] }));
  assert.match(pair, /grid-cols-2/);
  assert.equal(pair.match(/aspect-\[16\/9\] w-full border border-slate-400 bg-white object-contain/g)?.length, 2);
  assert.equal(pair.match(/class="my-1"/g)?.length, 2);
  assert.match(pair, /<\/figure>[\s\S]*MICROLOCALIZACIÓN<\/figcaption>/);
  assert.match(pair, /MACROLOCALIZACIÓN<\/figcaption>/);

  // An image alone in its row keeps its own proportions and room.
  const alone = renderItems(block({ apartados: [{ ...sketches, contentLayout: rowsOf([{ type: "image", id: "macro" }], [{ type: "image", id: "micro" }]) }] }));
  assert.doesNotMatch(alone, /aspect-\[16\/9\]|border-slate-400/);
  assert.equal(alone.match(/class="my-4"/g)?.length, 2);
});

test("report tables alternate gray and white rows, the first one gray", () => {
  const html = render(createElement(DocumentTable, {
    variant: "report",
    table: { id: "t", title: "Instalaciones", columns: ["#", "Tipo"], rows: [["1", "E.A."], ["2", "O.C."], ["3", "O.C."]], enabled: true },
  }));
  // The colour follows the row's place in the table, so it carries on when the table breaks across pages.
  assert.deepEqual(html.match(/<tr[^>]*data-split-table-row[^>]*>/g)?.map((row) => /bg-slate-100/.test(row)), [true, false, true]);
  assert.match(html, /<td[^>]*px-2 py-1[^>]*>E\.A\.<\/td>/);
  assert.match(html, /<caption[^>]*>Instalaciones<\/caption>/);

  const untitled = render(createElement(DocumentTable, { variant: "report", table: { id: "t", title: " ", columns: ["#"], rows: [["1"]], enabled: true } }));
  assert.doesNotMatch(untitled, /<caption/, "an untitled table leaves no empty band above its header");
  const justAdded = render(createElement(DocumentTable, { variant: "report", table: { id: "t", title: "Tabla configurable", columns: ["#"], rows: [["1"]], enabled: true } }));
  assert.doesNotMatch(justAdded, /<caption|Tabla configurable/, "the name the editor gives a new table is not a caption");
});

test("table headers are a light blue band with navy bold text that prints with its background", () => {
  const html = render(createElement(DocumentTable, {
    variant: "report",
    table: { id: "t", title: "Instalaciones", columns: ["#", "Tipo"], rows: [["1", "E.A."]], enabled: true },
  }));
  assert.match(html, /<thead class="bg-\[#BDD7EE\] text-\[var\(--caratula-dark-blue\)\][^"]*\[print-color-adjust:exact\]"/);
  assert.match(html, /<th class="[^"]*text-center[^"]*font-bold[^"]*">Tipo<\/th>/);
  assert.doesNotMatch(html, /<thead[^>]*text-white/);
});

const homologationTable = () => generatedTable("homologacion", "Homologación",
  [
    figureColumn("REF"), moneyColumn("OFERTA $"), textColumn("UBICACIÓN"),
    figureColumn("Neg.", { group: "FACTORES DE HOMOLOGACIÓN" }), figureColumn("FRe", { group: "FACTORES DE HOMOLOGACIÓN" }),
    moneyColumn("Valor Unitario Homologado $/m²"),
  ],
  [["1", "$ 1,260,000.00", "Calle Villa Toledo", "0.95", "0.87", "$ 7,806.43"]],
  {
    summaryBoxes: [
      { id: "base", position: "top", caption: "Homologación de acuerdo a:", rows: [{ label: "Lote Tipo:", value: "140.00 m²", mark: false }, { label: "Lote Sujeto:", value: "169.78 m²", mark: true }] },
      { id: "sujeto", position: "bottom", align: "start", rows: [{ label: "Sup. de Sujeto (m²):", value: "169.78 m²" }] },
      { id: "valores", position: "bottom", align: "end", rows: [{ label: "Valor homologado a utilizar ($/m²):", value: "$ 9,000.00", emphasis: "strong" }] },
      { id: "valor", position: "bottom", align: "end", rows: [{ label: "Subtotal:", value: "$ 1,528,020.00" }, { label: "VALOR COMPARATIVO DE MERCADO (TERRENOS):", value: "$ 1,528,000.00", emphasis: "total" }] },
    ],
    notes: [
      { position: "top", label: "Obtención del valor unitario.", text: "Comparables de terrenos en venta." },
      { position: "bottom", label: "Justificación del valor adoptado:", text: "Dentro del rango." },
    ],
  });

test("a generated table prints its header group, aligned figures and no caption", () => {
  const html = render(createElement(DocumentTable, { variant: "report", table: homologationTable() }));
  assert.doesNotMatch(html, /<caption/, "its name is for the editor");
  assert.match(html, /<th colSpan="2"[^>]*>FACTORES DE HOMOLOGACIÓN<\/th>/);
  assert.match(html, /<th rowSpan="2"[^>]*>REF<\/th>/);
  assert.match(html, /<td[^>]*class="[^"]*text-right[^"]*whitespace-nowrap[^"]*"[^>]*>\$ 1,260,000\.00<\/td>/, "amounts are right-aligned on one line");
  assert.match(html, /<td[^>]*class="[^"]*text-center[^"]*whitespace-nowrap[^"]*"[^>]*>0\.95<\/td>/);
  assert.match(html, /<td[^>]*class="[^"]*whitespace-normal[^"]*"[^>]*>Calle Villa Toledo<\/td>/, "text wraps");
  assert.match(html, /<table class="[^"]*text-\[10px\]/, "tables of figures print dense");
});

test("summary boxes print with their table: the basis above, subtotals and the final bar below", () => {
  const html = render(createElement(DocumentTable, { variant: "report", table: homologationTable() }));
  const [top, rest] = html.split("<thead");
  const bottom = rest.split("</tbody>").slice(1).join("</tbody>");
  assert.match(top, /Homologación de acuerdo a:/);
  assert.match(top, /<td[^>]*><\/td><th[^>]*>Lote Tipo:<\/th><td[^>]*>140\.00 m²<\/td>/);
  assert.match(top, /<td[^>]*>x<\/td><th[^>]*>Lote Sujeto:<\/th>/, "the chosen option carries the x");
  assert.match(top, /<strong>Obtención del valor unitario\. <\/strong>Comparables de terrenos en venta\./);

  // The subject's area and the adopted value share a line; the final box starts another.
  const lines = bottom.match(/<div class="flex items-start gap-3">/g);
  assert.equal(lines?.length, 2);
  assert.ok(bottom.indexOf("Sup. de Sujeto") < bottom.indexOf("Valor homologado a utilizar"));
  assert.match(bottom, /<tr class="[^"]*bg-slate-200 font-bold[^"]*"><th[^>]*>Valor homologado a utilizar/);
  assert.match(bottom, /<tr class="[^"]*print-color-adjust:exact[^"]*bg-\[var\(--caratula-dark-blue\)\] font-bold text-white[^"]*"><th[^>]*>VALOR COMPARATIVO DE MERCADO \(TERRENOS\):<\/th><td[^>]*>\$ 1,528,000\.00<\/td>/);
  assert.ok(bottom.indexOf("VALOR COMPARATIVO") < bottom.indexOf("Justificación del valor adoptado:"), "the note closes the table");
});

test("an apartado whose title carries its own letter is not numbered again, and its tables keep apart", () => {
  const table = (id: string) => ({ id, title: "", columns: ["#"], rows: [["1"]], enabled: true });
  const html = renderItems(block({
    sectionLabel: "IX",
    apartados: [
      apartado("terreno", [], { title: "A) TERRENO EN ESTUDIO", tables: [table("uno"), table("dos")] }),
      apartado("datos", [], { title: "DATOS DE COMPARABLES" }),
    ],
  }));
  assert.match(html, /<h3[^>]*>A\) TERRENO EN ESTUDIO<\/h3>/);
  assert.match(html, /<h3[^>]*>IX\.2 DATOS DE COMPARABLES<\/h3>/);
  assert.equal(html.match(/class="mt-2\.5 grid/g)?.length, 1, "the second table leaves room above it");
});

test("a full page gives its items the whole height left by the header and the padding", () => {
  const html = renderToStaticMarkup(createElement(AutoPaginatedDocumentFlow, {
    contentClassName: "px-5 pb-10 pt-3",
    header: createElement("header", null, "Encabezado"),
    pageKeyPrefix: "test",
    items: [{ id: "uno", node: "Uno" }],
  }));
  // The measured height excludes the padding, so it must size the content box, not the border box.
  assert.match(html, /box-sizing:content-box;height:var\(--document-content-height\)/);
});

test("a text concept takes a unit from its value format; without one it stays text", async () => {
  const { isNumericConcept, supportsValueFormat, formatConceptValueForDocument } = await import("../src/features/valuations/services/concept-value-format");
  const text = { type: "text" as const, value: "185" };
  assert.equal(supportsValueFormat(text), true);
  assert.equal(supportsValueFormat({ type: undefined }), true);
  assert.equal(supportsValueFormat({ type: "date" }), false);
  assert.equal(supportsValueFormat({ type: "longText" }), false);
  assert.equal(isNumericConcept(text), false);
  assert.equal(formatConceptValueForDocument(text), "185");
  assert.equal(isNumericConcept({ ...text, valueFormat: "m2" }), true);
  assert.equal(formatConceptValueForDocument({ ...text, valueFormat: "m2" }), "185 m²");
  // Words keep reading as words even with a unit chosen.
  assert.equal(formatConceptValueForDocument({ type: "text", value: "Habitacional", valueFormat: "m2" }), "Habitacional");
  assert.equal(formatConceptValueForDocument({ ...text, valueFormat: "plain" }), "185");
  // Concepts created as "Número" before keep working.
  assert.equal(formatConceptValueForDocument({ type: "number", value: "185", valueFormat: "m2" }), "185 m²");
});
