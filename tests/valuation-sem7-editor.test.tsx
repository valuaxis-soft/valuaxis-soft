/**
 * Videos 7.1 and 7.3 (16–17 nov 2026), what was told done and was not seen:
 * the title of a block (empty, «Imprimir título», boxed in the carátula),
 * Chrome's suggestions in the editor, a click that wrote a reference inside
 * another, the order of «Buscar valor», and the dates of the body against
 * the header's.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AppSection, Block, Concept } from "../src/features/valuations/model";
import { CaratulaBlockHeading } from "../src/features/valuations/components/caratula-preview-modules";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import { DEFAULT_PAGE_PRESENTATION } from "../src/features/valuations/services/page-presentation";
import { DocumentBlockTitleBar, formatDocumentBlockTitle } from "../src/features/valuations/components/document-block-title-bar";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { resequenceSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import { ConceptEditorList } from "../src/features/valuations/components/editor/concept-editor";
import { HeaderDateNotice, HeaderDatesProvider } from "../src/features/valuations/components/editor/header-date-notice";
import { apartadoDisplayLabel } from "../src/features/valuations/services/visible-numbering";
import { savedTitle, titlePrints } from "../src/features/valuations/services/block-title";
import { apartadoMetadataFromContent, blockMetadataFromContent, hydrateApartadoMetadata, hydrateBlockMetadata, conceptMetadataFromContent, hydrateConceptMetadata } from "../src/features/valuations/metadata";
import { tableContextMenu } from "../src/features/valuations/services/table-context-menu";
import { buildFormulaIndex, referenceSpansOf, withReference } from "../src/features/valuations/services/formula-references";
import { liveFormulaText, liveFormulaWarning, resolveLiveFormula } from "../src/features/valuations/services/live-formulas";
import { conceptDatePatch, headerDateKindOf, headerDateMismatch, headerDatesOf, withHeaderDates, type HeaderDates } from "../src/features/valuations/services/header-dates";

const noop = () => {};
const concept = (id: string, label: string, value: string, extra: Partial<Concept> = {}): Concept => ({ id, label, value, enabled: true, ...extra });
const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id,
  title: id.toUpperCase(),
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: [concept(`${id}-c`, "Dato", "1")],
  apartados: [],
  tables: [],
  images: [],
  ...extra,
});
const section = (id: string, blocks: Block[]): AppSection =>
  ({ id, label: "", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks });

test("V7.1-01: an empty block title prints nothing, not «NO SE PROPORCIONÓ», in the carátula and in any section", () => {
  assert.equal(renderToStaticMarkup(createElement(CaratulaBlockHeading, { title: "" })), "");
  assert.equal(renderToStaticMarkup(createElement(CaratulaBlockHeading, { title: "   " })), "");
  assert.equal(formatDocumentBlockTitle("III", ""), "");
  assert.equal(formatDocumentBlockTitle("III", "Terreno"), "III. Terreno");
  assert.equal(renderToStaticMarkup(createElement(DocumentBlockTitleBar, { label: "III", title: "" })), "");
});

test("V7.1-01: a title stored as the filler «Campo sin título» reads back empty; a title written stays", () => {
  assert.equal(savedTitle("Campo sin título"), "");
  assert.equal(savedTitle("CAMPO SIN TÍTULO"), "");
  assert.equal(savedTitle("DATOS DEL BIEN"), "DATOS DEL BIEN");
});

test("V7.1-02: «Imprimir título: no» keeps the title in the editor and prints none, nor its number", () => {
  assert.equal(titlePrints({ title: "DATOS DEL BIEN" }), true);
  assert.equal(titlePrints({ title: "DATOS DEL BIEN", titleHidden: true }), false);
  assert.equal(renderToStaticMarkup(createElement(CaratulaBlockHeading, { title: "DATOS DEL BIEN", hidden: true })), "");
  assert.equal(renderToStaticMarkup(createElement(DocumentBlockTitleBar, { label: "II", title: "TERRENO", hidden: true })), "");

  const numbered = resequenceSections([section("datos", [block("a"), block("b", { titleHidden: true }), block("c"), block("d", { title: "" })])]);
  assert.deepEqual(numbered[0].blocks.map((item) => item.sectionLabel), ["I", "", "II", ""]);

  const items = [{ id: "x", title: "PRIMERO" }, { id: "y", title: "SEGUNDO", titleHidden: true }, { id: "z", title: "TERCERO" }];
  assert.equal(apartadoDisplayLabel({ sectionLabel: "III" }, items, "z"), "III.2");
  assert.equal(apartadoDisplayLabel({ sectionLabel: "III" }, items, "y"), "");
});

test("V7.1-02: a block without a printed title has no title item; its first item carries its page break", () => {
  const titled = documentBlockFlowItems(block("a", { pageBreak: "new-page" }));
  assert.equal(titled[0].id, "a:title");
  const untitled = documentBlockFlowItems(block("a", { pageBreak: "new-page", titleHidden: true }));
  assert.ok(untitled.length > 0);
  assert.ok(untitled.every((item) => !item.id.endsWith(":title")));
  assert.equal(untitled[0].startOnNewPage, true);
  const continuing = documentBlockFlowItems(block("a", { pageBreak: "continue", title: "" }));
  assert.equal(continuing[0].continuesPrevious, true);
});

test("V7.1-02: «Imprimir título» is kept with the block and with the subbloque", () => {
  assert.equal(hydrateBlockMetadata({ kind: "block", payload: blockMetadataFromContent({ titleHidden: true }) }).titleHidden, true);
  assert.equal(hydrateBlockMetadata({ kind: "block", payload: blockMetadataFromContent({}) }).titleHidden, undefined);
  assert.equal(hydrateApartadoMetadata({ kind: "subBlock", payload: apartadoMetadataFromContent({ titleHidden: true }) }).titleHidden, true);
});

test("V7.1-02: the right-click menu of a block's title offers «Imprimir título» with its check, in every section", () => {
  const items = (titlePrinted?: boolean) => tableContextMenu("editable", {
    kind: "block", canRename: true, canTransfer: true, hidden: false, canHide: true, pageBreakBefore: false, canPageBreak: true, canDelete: true, titlePrinted,
  }).flat();
  assert.deepEqual(items(true).find((item) => item.action === "block-print-title"), { action: "block-print-title", label: "Imprimir título", checked: true });
  assert.equal(items(false).find((item) => item.action === "block-print-title")?.checked, false);
});

test("V7.1-03 and 24 Nov 2026: the carátula's block title follows «Títulos de las secciones», never over a rule from edge to edge", () => {
  // As every other title: the bar of the strong colour by default («CONCLUSIÓN» printed hollow).
  const html = renderToStaticMarkup(createElement(CaratulaBlockHeading, { title: "DATOS DEL BIEN" }));
  assert.match(html, /data-caratula-block-title/);
  assert.match(html, /data-title-style="filled"/);
  assert.match(html, /bg-\[var\(--caratula-dark-blue,#00285A\)\]/);
  assert.match(html, /text-\[color:var\(--doc-on-strong,#fff\)\]/);
  assert.doesNotMatch(html, /border-b-2/);
  assert.match(html, />DATOS DEL BIEN</);
  // «Fondo blanco (título con marco)»: the letters of the strong colour inside a thin frame.
  const outline = renderToStaticMarkup(createElement(PagePresentationProvider, { presentation: { ...DEFAULT_PAGE_PRESENTATION, titleBars: "outline" } },
    createElement(CaratulaBlockHeading, { title: "CONCLUSIÓN" })));
  assert.match(outline, /data-title-style="outline"/);
  assert.match(outline, /bg-white/);
  assert.match(outline, /text-\[color:var\(--caratula-dark-blue,#00285A\)\]/);
});

test("V7.3-03: every field of a concept turns Chrome's suggestions off", () => {
  const html = renderToStaticMarkup(createElement(ConceptEditorList, {
    concepts: [
      concept("t", "Calle", "Hidalgo"),
      concept("n", "Número", "4", { type: "number" }),
      concept("l", "Descripción", "Casa", { type: "longText" }),
      concept("p", "", "Texto corrido", { type: "paragraph" }),
    ],
    onRemove: noop,
    onUpdate: noop,
    readOnly: false,
  }));
  const fields = html.match(/<(input|textarea)\b[^>]*>/g) ?? [];
  const typed = fields.filter((field) => !/type="(checkbox|radio|file|hidden)"/.test(field));
  assert.ok(typed.length >= 6, "titles and values of the four concepts");
  for (const field of typed) assert.match(field, /autocomplete="off"/i, field);
});

test("V7.3-04: a click with the caret inside a reference does not break it (video 7.3, 3:15)", () => {
  const text = "=[Superficie total de Terreno]";
  const next = withReference(text, { start: 11, end: 11 }, "[Frente del Terreno (m)]", null);
  assert.notEqual(next.text, "=[Superfici[Frente del Terreno (m)]e total de Terreno]");
  assert.equal(next.text, "=[Frente del Terreno (m)]", "a formula opened already written: the click replaces its reference");
  assert.equal(withReference("=[A]*", { start: 5, end: 5 }, "[B]", null).text, "=[A]*[B]");
  assert.equal(withReference("=[A]*2+[C]", { start: 3, end: 3 }, "[B]", null).text, "=[B]*2+[C]");
  assert.equal(withReference("=[Terreno]!B2+1", { start: 4, end: 12 }, "C3", null).text, "=C3+1");
  const first = withReference("=", { start: 1, end: 1 }, "B2", null);
  assert.equal(withReference(first.text, { start: 3, end: 3 }, "C3", first.reference).text, "=C3");
  assert.equal(withReference("=C3*", { start: 4, end: 4 }, "D4", null).text, "=C3*D4");
});

test("V7.3-04: the references of a formula, as written", () => {
  assert.deepEqual(referenceSpansOf("=[Superficie]*2"), [{ start: 1, end: 13 }]);
  assert.deepEqual(referenceSpansOf("=SUMA(A1:A5)+$B$2*[T]!C3+LN(B2)"), [
    { start: 6, end: 11 }, { start: 13, end: 17 }, { start: 18, end: 24 }, { start: 28, end: 30 },
  ]);
  assert.deepEqual(referenceSpansOf("=REDONDEAR(10.5; 2)"), [], "a function and numbers are not references");
});

test("V7.3-05: «Frente del sujeto» with a live reference to an empty «Frente del Terreno» keeps its number and says why", () => {
  const sections = (frente: string) => [section("terreno", [block("t", { concepts: [concept("frente", "Frente del Terreno (m)", frente, { type: "number" })] })])];
  const stored = liveFormulaText("=[Frente del Terreno (m)]", buildFormulaIndex(sections("12")));
  assert.ok(stored.ok);
  const emptied = resolveLiveFormula(stored.ok ? stored.text : "", buildFormulaIndex(sections("")));
  assert.equal(emptied.changed, false, "the last number stays");
  assert.match(liveFormulaWarning(emptied.problems) ?? "", /Frente del Terreno \(m\).*ya no tiene un número.*12/);
});

test("V7.3-07: the values follow the order the editor shows, block by block and subbloque by subbloque, with where each one is", () => {
  const layout = (...ids: string[]) => ({ version: 2 as const, rows: ids.map((id) => ({ id: `row-${id}`, columns: [{ id: `col-${id}`, items: [{ type: "concept" as const, id }] }] })) });
  const terrain = block("t", {
    title: "INFORMACIÓN DEL TERRENO",
    concepts: [concept("sup", "Superficie total", "360"), concept("fondo", "Fondo", "30"), concept("frente", "Frente del Terreno", "12")],
    contentLayout: layout("sup", "frente", "fondo"),
    apartados: [{ id: "m", title: "MEDIDAS", enabled: true, concepts: [concept("norte", "Al norte", "12")], tables: [], images: [] }],
  });
  const index = buildFormulaIndex([section("caratula", [block("c", { title: "DATOS", concepts: [concept("folio", "Folio", "1")] })]), section("terreno", [terrain])]);
  assert.deepEqual(index.concepts.map((entry) => entry.id), ["folio", "sup", "frente", "fondo", "norte"]);
  const norte = index.concepts.find((entry) => entry.id === "norte")!;
  assert.deepEqual(norte.place, { block: "INFORMACIÓN DEL TERRENO", apartado: "MEDIDAS" });
  assert.equal(norte.sectionTitle, "TERRENO");
});

const dates: HeaderDates = { valuation: "2026-11-20", validity: "2027-05-20" };

test("a date of the body named like the header's is compared with it, without refusing anything", () => {
  assert.equal(headerDateKindOf("Fecha del avalúo"), "valuation");
  assert.equal(headerDateKindOf("FECHA DEL AVALUO:"), "valuation");
  assert.equal(headerDateKindOf("Fecha"), "valuation");
  assert.equal(headerDateKindOf("Vigencia"), "validity");
  assert.equal(headerDateKindOf("Fecha de inspección"), null);

  const date = (label: string, value: string, extra: Partial<Concept> = {}) => concept("d", label, value, { type: "date", ...extra });
  assert.deepEqual(headerDateMismatch(date("Fecha del avalúo", "2026-10-01"), dates), { kind: "valuation", header: "2026-11-20" });
  assert.equal(headerDateMismatch(date("Fecha del avalúo", "2026-11-20"), dates), null);
  assert.equal(headerDateMismatch(date("Fecha del avalúo", ""), dates), null);
  assert.equal(headerDateMismatch(date("Fecha de inspección", "2026-10-01"), dates), null);
  assert.equal(headerDateMismatch(date("Fecha del avalúo", "2026-10-01", { headerDate: "valuation" }), dates), null);
  assert.deepEqual(headerDateMismatch(date("Vigencia", "2027-01-01"), dates), { kind: "validity", header: "2027-05-20" });
  assert.equal(headerDateMismatch(concept("d", "Fecha del avalúo", "2026-10-01"), dates), null, "a text, not a date");
});

test("the notice says the date differs and offers «Vincular»; a linked date says it follows the header", () => {
  const render = (value: Partial<Concept>) => renderToStaticMarkup(createElement(HeaderDatesProvider, { dates },
    createElement(HeaderDateNotice, { concept: { label: "Fecha del avalúo", value: "2026-10-01", type: "date", ...value }, readOnly: false, onPatch: noop })));
  const differs = render({});
  assert.match(differs, /data-header-date-mismatch="valuation"/);
  assert.match(differs, /Es distinta de la fecha del avalúo del encabezado \(20\/11\/2026\)/);
  assert.match(differs, /Vincular/);
  assert.match(render({ headerDate: "valuation" }), /data-header-date-linked="valuation"[\s\S]*Desvincular/);
  assert.equal(render({ value: "2026-11-20" }), "");
  assert.equal(renderToStaticMarkup(createElement(HeaderDateNotice, { concept: { label: "Fecha", value: "2026-10-01", type: "date" }, readOnly: false, onPatch: noop })), "");
});

test("a linked date follows the header; typed by hand it stops following it; the link is kept with the concept", () => {
  const sections = [section("consideraciones", [block("b", { concepts: [
    concept("linked", "Fecha del avalúo", "2026-11-20", { type: "date", headerDate: "valuation" }),
    concept("free", "Fecha", "2026-10-01", { type: "date" }),
  ] })])];
  const moved = withHeaderDates(sections, { valuation: "2026-11-25", validity: null });
  assert.equal(moved[0].blocks[0].concepts[0].value, "2026-11-25");
  assert.equal(moved[0].blocks[0].concepts[1].value, "2026-10-01");
  assert.equal(withHeaderDates(moved, { valuation: "2026-11-25", validity: null }), moved);

  assert.deepEqual(conceptDatePatch({ headerDate: "valuation" }, "2026-12-01", dates), { value: "2026-12-01", headerDate: undefined });
  assert.deepEqual(conceptDatePatch({ headerDate: "valuation" }, "2026-11-20", dates), { value: "2026-11-20" });
  assert.deepEqual(conceptDatePatch({}, "2026-12-01", dates), { value: "2026-12-01" });

  assert.equal(hydrateConceptMetadata({ payload: conceptMetadataFromContent({ headerDate: "validity" }) }).headerDate, "validity");
  assert.deepEqual(headerDatesOf({ fechaAvaluo: "2026-11-20", mesesVigencia: 6, fechaVigencia: "" }), { valuation: "2026-11-20", validity: "2027-05-20" });
});
