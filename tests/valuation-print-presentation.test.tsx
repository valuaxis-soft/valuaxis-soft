import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { AutoPaginatedDocumentFlow } from "../src/features/valuations/components/document-preview-page";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DocumentThemeProvider, type DocumentThemeVariant } from "../src/features/valuations/components/document-theme";
import { CaratulaAssumptionsModule } from "../src/features/valuations/components/caratula-preview-modules";
import { TerrenoPreview } from "../src/features/valuations/components/terreno-preview";
import { ensureTerrenoSection, terrenoSection } from "../src/features/valuations/sections/terreno";
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

  // With and without the concept layout (the full-width span of old documents), the unit prints.
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

test("concept values are justified and the rows sit close, with no hairline under each concept", () => {
  const target = block({
    apartados: [apartado("obra", [concept("a", "Cimentación", "Mampostería"), concept("b", "Muros", "Ladrillo")], {
      contentLayout: rowsOf([{ type: "concept", id: "a" }], [{ type: "concept", id: "b" }]),
    })],
  });
  const html = renderItems(target);
  assert.equal(html.match(/<span class="[^"]*text-justify[^"]*">/g)?.length, 2);
  assert.doesNotMatch(html, /border-b border-slate-200/, "the appraiser asked for the lines under every row to go");
  assert.equal(html.match(/ py-px"/g)?.length, 2, "one tight row per concept");

  // Side by side, the two concepts keep the same tight rows and nothing under them.
  const pair = renderItems(block({ apartados: [apartado("obra", target.apartados[0].concepts, { contentLayout: rowsOf([{ type: "concept", id: "a" }, { type: "concept", id: "b" }]) })] }));
  // Only the apartado's title carries a rule.
  assert.doesNotMatch(pair.replace(/<h3 class="[^"]*">/g, "<h3>"), /border-b/);
  assert.match(pair, /class="[^"]*grid-cols-2 gap-x-4"/);
  assert.equal(pair.match(/ py-px"/g)?.length, 2);

  const technical = renderItems(block({ apartados: [apartado("obra", [concept("a", "Cimentación", "Mampostería")], { presentationMode: "technical-list" })] }));
  assert.match(technical, /items-start py-px"/);
  assert.doesNotMatch(technical.replace(/<h3 class="[^"]*">/g, "<h3>"), /border-b/);
  assert.match(technical, /text-justify/);

  // The cover keeps its compact columns: no rules, no justified short data.
  const cover = renderItems(target, "caratula");
  assert.doesNotMatch(cover, /border-b border-slate-200|text-justify/);
});

/* ------------------------------------------------------------------ */
/*  Spacing, paragraphs and marks                                      */
/* ------------------------------------------------------------------ */

test("the room given to a concept (Espacio) prints in every section and layout, not only on the cover", () => {
  const spaced = concept("a", "Propietario", "Juan Pérez", { spacingAfter: 15, spacingBefore: 4 });
  const plain = concept("b", "Solicitante", "Ana", {});
  // Datos generales, Terreno and Construcción render their apartados without the concept layout flag.
  const html = render(documentBlockFlowItems(block({ apartados: [apartado("datos", [spaced, plain])] })).map((item) => createElement("div", { key: item.id }, item.node)));
  assert.match(html, /margin-top:4px;margin-bottom:15px/);
  assert.match(html, /margin-top:0;margin-bottom:0/);

  // Concepts placed directly in the block, with and without the flag.
  for (const applyConceptLayout of [false, true]) {
    const direct = render(documentBlockFlowItems(block({ concepts: [spaced] }), { applyConceptLayout }).map((item) => createElement("div", { key: item.id }, item.node)));
    assert.match(direct, /margin-bottom:15px/, `applyConceptLayout=${applyConceptLayout}`);
  }

  // The one-column list ignored it altogether.
  const technical = renderItems(block({ apartados: [apartado("lista", [spaced], { presentationMode: "technical-list" })] }));
  assert.match(technical, /margin-top:4px;margin-bottom:15px;grid-template-columns:120px/);

  const cover = renderItems(block({ concepts: [spaced] }), "caratula");
  assert.match(cover, /margin-bottom:15px/);
});

test("a paragraph prints its text edge to edge, with no label and no label column", () => {
  const paragraph = concept("p", "", "Texto corrido que explica el criterio adoptado.", { type: "paragraph", spacingAfter: 6 });
  const data = concept("d", "Niveles", "2");
  const html = renderItems(block({ apartados: [apartado("obs", [data, paragraph], { contentLayout: rowsOf([{ type: "concept", id: "d" }], [{ type: "concept", id: "p" }]) })] }));
  assert.equal(html.match(/<strong/g)?.length, 1, "only the data concept has a label");
  assert.match(html, /<div class="py-px" style="margin-top:0;margin-bottom:6px"><p class="[^"]*text-justify[^"]*">Texto corrido que explica el criterio adoptado\.<\/p><\/div>/);
  assert.doesNotMatch(html, /grid-template-columns:120px[^>]*>[^<]*<p/, "no label column before the paragraph");

  // In the one-column list too, and at the size of its long neighbours.
  const technical = renderItems(block({ apartados: [apartado("obs", [data, paragraph], { presentationMode: "technical-list" })] }));
  assert.match(technical, /<p class="[^"]*">Texto corrido/);
  const prose = renderItems(block({ concepts: [concept("a", "Valor comercial", LONG), { ...paragraph, value: LONG }] }));
  assert.equal(prose.match(/text-\[12px\] leading-\[1\.45\]/g)?.length, 3, "label and value of the concept, and the paragraph");

  const empty = renderItems(block({ concepts: [{ ...paragraph, value: "" }] }));
  assert.match(empty, /<p class="[^"]*">—<\/p>/);
});

test("bold, italic and underline marks render in the document and in the cover's assumptions", () => {
  const marked = concept("a", "Uso", "Habitacional <b>unifamiliar</b> de <i>dos</i> <u>niveles</u>");
  const html = renderItems(block({ concepts: [marked] }));
  assert.match(html, /Habitacional <\/span><span><strong>unifamiliar<\/strong><\/span><span> de <\/span><span><em>dos<\/em><\/span><span> <\/span><span><u>niveles<\/u><\/span>/);
  assert.doesNotMatch(html, /&lt;b&gt;|<b>/, "our tags never reach the page as text or as raw HTML");

  const nested = renderItems(block({ concepts: [concept("a", "Uso", "<b><i>todo</i></b>")] }));
  assert.match(nested, /<strong><em>todo<\/em><\/strong>/);

  const cover = render(createElement(CaratulaAssumptionsModule, { blocks: [block({ title: "SUPUESTOS", concepts: [concept("a", "", "Se <b>asume</b> que…")] })] }), "caratula");
  assert.match(cover, /Se <\/span><span><strong>asume<\/strong><\/span>/);

  // A value without marks prints as before, as one text node.
  const plain = renderItems(block({ concepts: [concept("a", "Uso", "Habitacional")] }));
  assert.match(plain, />Habitacional<\/span>/);
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
  assert.match(definitions, /py-\[3px\]/);

  const data = renderItems(block({ apartados: [apartado("datos", [concept("a", "Niveles", "4"), concept("b", "Clase", "C")])] }));
  assert.doesNotMatch(data, /leading-\[1\.45\]|py-\[3px\]/);

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
  // The first apartado sits right under the title bar, without the gap between items.
  assert.equal(items.length, 4);
  const [, first, second, third] = items;
  assert.deepEqual([first.continuesPrevious, second.continuesPrevious, third.continuesPrevious], [true, true, true]);
  assert.equal(new Set(items.map((item) => item.id)).size, 4, "ids are unique");
  assert.ok(second.id.startsWith(`${first.id}:`));

  const html = (node: ReactNode) => render(node);
  assert.match(html(first.node), /Apartado def[\s\S]*Valor comercial/);
  assert.doesNotMatch(html(first.node), /Enfoque de costos/);
  assert.match(html(second.node), /^<div><div class="mt-\[1px\] grid[\s\S]*Enfoque de costos/, "a further row is flush with the apartado's title");
  assert.doesNotMatch(html(second.node), /Apartado def/, "the title prints once");
  assert.match(html(third.node), /text-\[12px\] leading-\[1\.45\]/, "every row follows the apartado's text size");

  // The page break of the apartado stays on the item that carries its title.
  const broken = documentBlockFlowItems(block({ apartados: [{ ...definitions, startOnNewPage: true }] }));
  assert.deepEqual(broken.map((item) => Boolean(item.startOnNewPage)), [false, true, false, false]);

  // A technical list stays whole.
  const technical = documentBlockFlowItems(block({ apartados: [{ ...definitions, presentationMode: "technical-list" }] }));
  assert.equal(technical.length, 2);
});

test("concepts placed directly in a block sit as close as the concepts of an apartado", () => {
  const concepts = [concept("a", "Niveles", "4"), concept("b", "Clase", "C"), concept("c", "Uso", "Habitacional")];
  const layout = rowsOf([{ type: "concept", id: "a" }], [{ type: "concept", id: "b" }], [{ type: "concept", id: "c" }]);
  const direct = documentBlockFlowItems(block({ concepts, contentLayout: layout }));
  const inApartado = documentBlockFlowItems(block({ apartados: [apartado("datos", concepts, { contentLayout: layout })] }));

  // Every row continues the one before it, the first one the title bar: no gap between items.
  assert.deepEqual(direct.map((item) => item.continuesPrevious), [undefined, true, true, true]);
  assert.deepEqual(inApartado.map((item) => item.continuesPrevious), [undefined, true, true, true]);

  // The first row opens with the room of the first row of an apartado, the rest with the tight one.
  const rowClasses = (items: typeof direct) => items.slice(1).map((item) => /class="(mt-[^" ]+) grid/.exec(render(item.node))?.[1]);
  assert.deepEqual(rowClasses(direct), ["mt-1", "mt-[1px]", "mt-[1px]"]);
  assert.deepEqual(rowClasses(direct), rowClasses(inApartado));

  // A row after an apartado starts a run of its own, apart from it.
  const after = documentBlockFlowItems(block({
    concepts,
    apartados: [apartado("datos", [concept("x", "Otro", "1")])],
    contentLayout: rowsOf([{ type: "concept", id: "a" }]),
    blockFlow: { version: 2, rows: [{ id: "f1", items: [{ type: "apartado", apartadoId: "datos" }] }, { id: "f2", items: [{ type: "content-row", rowId: "row-0" }] }] },
  }));
  assert.deepEqual(after.map((item) => item.continuesPrevious), [undefined, true, undefined]);
});

test("block title bars are fine bars, thinner than the document's title band, and stay with what follows", () => {
  const [title] = documentBlockFlowItems(block({ concepts: [concept("a", "Niveles", "4")] }));
  const bar = render(title.node);
  assert.match(bar, /class="mb-1 bg-\[#00285A\] px-3 py-0\.5 text-center text-\[11px\] font-bold uppercase/);
  assert.doesNotMatch(bar, /py-1\.5|font-black/);
  assert.equal(title.keepWithNext, true);
  // The apartado title carries its rule right under the text: no separate line further down.
  const html = renderItems(block({ apartados: [apartado("datos", [concept("a", "Niveles", "4")])] }));
  assert.match(html, /<h3 class="mb-1 border-b-2 border-\[#2F5495\] pb-0\.5 [^"]*leading-tight[^"]*">III\.1 Apartado datos<\/h3><div class="mt-1 grid/);
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
  // Each in a landscape frame with a firm line; whole inside it unless the appraiser framed it otherwise.
  assert.equal(pair.match(/<div class="mx-auto aspect-video w-full relative overflow-hidden border-2 border-slate-500 bg-white"><img class="block h-full w-full" style="object-fit:contain;object-position:50% 50%"/g)?.length, 2);
  assert.equal(pair.match(/class="my-1"/g)?.length, 2);
  assert.match(pair, /<\/figure>[\s\S]*MICROLOCALIZACIÓN<\/figcaption>/);
  assert.match(pair, /MACROLOCALIZACIÓN<\/figcaption>/);

  // An image alone in its row keeps its own proportions and room, framed with the same line.
  const alone = renderItems(block({ apartados: [{ ...sketches, contentLayout: rowsOf([{ type: "image", id: "macro" }], [{ type: "image", id: "micro" }]) }] }));
  assert.doesNotMatch(alone, /aspect-video/);
  assert.equal(alone.match(/data-image-frame="lone"><div class="mx-auto relative overflow-hidden border-2 border-slate-500 bg-white">/g)?.length, 2);
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

/* ------------------------------------------------------------------ */
/*  Apartado titles: one left edge, one rule                           */
/* ------------------------------------------------------------------ */

test("every apartado title starts at the block's left edge with the same thick rule, whatever it holds", () => {
  const section = ensureTerrenoSection({ ...structuredClone(terrenoSection), label: "III" });
  const main = section.blocks[0];
  const table = { ...generatedTable("vias-tabla", "Tabla configurable", [textColumn("REF")], [["1"]]), enabled: true };
  const vias = apartado("vias", [], { title: "VÍAS DE ACCESO", tables: [table], contentLayout: rowsOf([{ type: "table", id: table.id }]) });
  const servicios = apartado("servicios", [concept("gas", "Gas", "Pipas")], { title: "OTROS SERVICIOS" });
  const fotos = apartado("fotos", [], { title: "CROQUIS", images: [{ id: "img", title: "Macro", src: "", enabled: true }], contentLayout: rowsOf([{ type: "image", id: "img" }]) });
  const parrafo = apartado("parrafo", [concept("p", "", "Texto corrido", { type: "paragraph" })], { title: "NOTA" });
  // A table, the fixed format of the measures, concepts, images and a paragraph, one after another.
  const terrain = { ...section, blocks: [{ ...main, sectionLabel: "III", apartados: [vias, ...main.apartados, servicios, fotos, parrafo] }] };
  const html = render(createElement(TerrenoPreview, { header: null, section: terrain }));

  const titles = [...html.matchAll(/<h3 class="([^"]*)">([^<]*)<\/h3>/g)];
  assert.deepEqual(titles.map((match) => match[2]), [
    "III.1 VÍAS DE ACCESO", "III.2 MEDIDAS Y COLINDANCIAS", "III.3 OTROS SERVICIOS", "III.4 CROQUIS", "III.5 NOTA",
  ]);
  assert.equal(new Set(titles.map((match) => match[1])).size, 1, "one format for all of them");
  assert.match(titles[0][1], /border-b-2/, "the thicker rule");
  assert.doesNotMatch(html, /pl-3|w-\[300px\]|h-\[2px\]/, "no indent and no line of fixed width");
  assert.doesNotMatch(html, /font-black/);
});
