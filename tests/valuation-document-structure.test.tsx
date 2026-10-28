import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { formatDocumentBlockTitle } from "../src/features/valuations/components/document-block-title-bar";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import { splitMeasuredDocumentFlowItems } from "../src/features/valuations/components/document-preview-page";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { DocumentThemeProvider } from "../src/features/valuations/components/document-theme";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import { createCustomSection } from "../src/features/valuations/components/workspace/model/content-factories";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { resequenceSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import { canConclude } from "../src/features/valuations/calculation/conclusion-types";
import { blockMetadataFromContent, hydrateApartadoMetadata, hydrateBlockMetadata, hydrateSectionMetadata } from "../src/features/valuations/metadata";
import type { AppSection, Block, CaratulaFormData, Letterhead, TableContent } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { normalizeContentLayout } from "../src/features/valuations/services/content-layout";
import {
  groupSectionsForPrint,
  insertSectionByRole,
  pageBreakPatch,
  resolvePageBreak,
  sectionDocumentRole,
} from "../src/features/valuations/services/document-structure";
import { DEFAULT_PAGE_PRESENTATION, type PagePresentation } from "../src/features/valuations/services/page-presentation";
import { printableSectionGroups } from "../src/features/valuations/services/printable-sections";
import {
  blockLeftOutOfReport,
  excludedReportApproaches,
  sectionForReport,
  sectionLeftOutOfReport,
  valuesForConclusion,
  withApproachIncluded,
} from "../src/features/valuations/services/report-approaches";
import {
  ensureTableV2,
  getTableHeaderLayout,
  groupTableHeaders,
  setTableWidthMode,
  ungroupTableHeaders,
  type TableV2,
} from "../src/features/valuations/services/table";
import { apartadoDisplayLabel } from "../src/features/valuations/services/visible-numbering";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const block = (id: string, extra: Partial<Block> = {}): Block => ({
  id, title: id.toUpperCase(), sectionLabel: "", enabled: true, required: false,
  concepts: [{ id: `${id}-c`, label: "Dato", value: "1", enabled: true }], apartados: [], tables: [], images: [], ...extra,
});

/** A canonical table as the document holds it. */
const asContent = (table: TableV2) => table as unknown as TableContent;

const section = (id: string, blocks: Block[], extra: Partial<AppSection> = {}): AppSection =>
  ({ id, label: "", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks, ...extra });

const printed = (node: ReactNode, presentation: PagePresentation = DEFAULT_PAGE_PRESENTATION) =>
  renderToStaticMarkup(
    <PagePresentationProvider presentation={presentation}>
      <DocumentThemeProvider variant="standard">{node}</DocumentThemeProvider>
    </PagePresentationProvider>,
  );

/* ------------------------------------------------------------------ */
/*  Annexes                                                            */
/* ------------------------------------------------------------------ */

test("the sections after the conclusion are annexes: ANEXO 1, ANEXO 2…, no roman numerals in them nor in their apartados", () => {
  const apartado = { id: "ap", title: "FOTOS", enabled: true, concepts: [{ id: "ap-c", label: "Nota", value: "x", enabled: true }], tables: [], images: [] };
  const sections = resequenceSections([
    section("caratula", [block("portada")]),
    section("costos", [block("costos-1"), block("costos-2")]),
    section("conclusiones", [block("conclusion")]),
    section("mapaComparables", [block("mapa", { apartados: [apartado] }), block("mapa-2")]),
    section("fotosAnexo", [block("fotos", { enabled: false }), block("fotos-2")]),
  ]);

  assert.deepEqual(sections.map((item) => item.label), ["I", "II", "III", "ANEXO 1", "ANEXO 2"]);
  // The chapters' blocks keep one roman count across the document.
  assert.deepEqual(sections[1].blocks.map((item) => item.sectionLabel), ["I", "II"]);
  assert.equal(sections[2].blocks[0].sectionLabel, "III");

  const [mapa, mapa2] = sections[3].blocks;
  assert.equal(mapa.sectionLabel, "ANEXO 1", "the annex label goes on its first printed block");
  assert.equal(mapa2.sectionLabel, "", "the rest print their titles only");
  assert.equal(formatDocumentBlockTitle(mapa.sectionLabel, mapa.title), "ANEXO 1. MAPA");
  assert.equal(apartadoDisplayLabel(mapa, mapa.apartados, "ap"), "", "no numbering inside an annex");
  // The first block is hidden: the label goes to the first that prints.
  assert.deepEqual(sections[4].blocks.map((item) => item.sectionLabel), ["", "ANEXO 2"]);

  // A section turned back into a chapter loses the annex marks.
  const chapter = resequenceSections(sections.map((item) => (item.id === "fotosAnexo" ? { ...item, documentRole: "chapter" as const } : item)));
  assert.equal(chapter[4].label, "IV");
  assert.equal(chapter[4].blocks[1].sectionLabel, "IV");
  assert.equal(chapter[4].blocks[1].annex, undefined);
  assert.equal(apartadoDisplayLabel({ sectionLabel: "IV" }, [{ id: "ap" }], "ap"), "IV.1");
});

test("the appraiser chooses chapter or annex and may write the annex's label; a new chapter goes before the conclusion", () => {
  const base = [section("caratula", []), section("terreno", [block("t")]), section("conclusiones", [block("c")]), section("mapaComparables", [block("m")])];
  assert.equal(sectionDocumentRole(base[1], base), "chapter");
  assert.equal(sectionDocumentRole(base[3], base), "annex");
  assert.equal(sectionDocumentRole({ ...base[1], documentRole: "annex" }, base), "annex");
  assert.equal(sectionDocumentRole({ ...base[2], documentRole: "annex" }, base), "chapter", "the conclusion is always a chapter");

  const labeled = resequenceSections(base.map((item) => (item.id === "mapaComparables" ? { ...item, annexTitle: "ANEXO A" } : item)));
  assert.equal(labeled[3].label, "ANEXO A");
  assert.equal(labeled[3].blocks[0].sectionLabel, "ANEXO A");

  const chapter = createCustomSection("chapter");
  const annex = createCustomSection("annex");
  const withChapter = insertSectionByRole(base, chapter, "chapter");
  assert.deepEqual(withChapter.map((item) => item.id), ["caratula", "terreno", chapter.id, "conclusiones", "mapaComparables"]);
  const withAnnex = insertSectionByRole(withChapter, annex, "annex");
  assert.equal(withAnnex.at(-1)?.id, annex.id);
  const numbered = resequenceSections(withAnnex);
  assert.equal(numbered[2].label, "III");
  assert.equal(numbered.at(-1)?.label, "ANEXO 2");
});

test("the registry document numbers the map of comparables, after the conclusion, as an annex", () => {
  const sections = resequenceSections(createInitialSections());
  const map = sections.find((item) => item.id === "mapaComparables");
  assert.equal(map?.label, "ANEXO 1");
  assert.equal(sections.find((item) => item.id === "conclusiones")?.label, "XIV");
});

test("chapter or annex, the annex's label, the section's page break and its exclusions are saved and read back", () => {
  const custom = section("seccion-x", [block("x", { pageBreak: "continue" })], {
    custom: true, documentRole: "annex", annexTitle: "ANEXO FOTOGRÁFICO", pageBreak: "continue",
  });
  const costs = section("costos", [], { excludedFromReport: ["costos"] });
  const [savedCustom, savedCosts] = buildSectionsPayload([custom, costs]);
  const hydrated = hydrateSectionMetadata(savedCustom);
  assert.equal(hydrated.documentRole, "annex");
  assert.equal(hydrated.annexTitle, "ANEXO FOTOGRÁFICO");
  assert.equal(hydrated.pageBreak, "continue");
  assert.deepEqual(hydrateSectionMetadata(savedCosts).excludedFromReport, ["costos"]);
  // Anything else stored there is ignored.
  assert.equal(hydrateSectionMetadata({ documentRole: "apéndice", pageBreak: "maybe" }).documentRole, undefined);
  assert.deepEqual(hydrateSectionMetadata({ excludedFromReport: ["costos", "otro"] }).excludedFromReport, ["costos"]);

  // A block and an apartado keep their three-valued page break.
  assert.equal(hydrateBlockMetadata({ payload: blockMetadataFromContent(custom.blocks[0]) }).pageBreak, "continue");
  assert.equal(hydrateApartadoMetadata({ pageBreak: "new-page" }).pageBreak, "new-page");
});

/* ------------------------------------------------------------------ */
/*  Agregar al informe valuatorio                                      */
/* ------------------------------------------------------------------ */

test("an approach left out of the report does not enter the conclusion; the market falls back to the market that stays", () => {
  const values = { costos: 8_580_000, ingresos: 7_900_000, markets: { buildings: 9_100_000, land: 1_528_000 } };
  assert.deepEqual(valuesForConclusion(values, new Set()), {
    values: { costos: 8_580_000, mercado: 9_100_000, ingresos: 7_900_000 },
    marketSource: "INMUEBLE_VENTA",
  });

  const withoutCosts = valuesForConclusion(values, new Set(["costos"]));
  assert.equal(withoutCosts.values.costos, null);
  // Concluding with the cost approach is no longer possible.
  assert.equal(canConclude({ values: withoutCosts.values, method: { kind: "single", approach: "costos" } }), false);
  // Weights that still count it do not add up to 100 % of the approaches with a value.
  assert.equal(canConclude({ values: withoutCosts.values, method: { kind: "weighted", weights: { costos: 0.5, mercado: 0.5 } } }), false);

  const withoutBuildings = valuesForConclusion(values, new Set(["mercado-inmuebles"]));
  assert.equal(withoutBuildings.values.mercado, 1_528_000, "land for sale concludes the market");
  assert.equal(withoutBuildings.marketSource, "TERRENO_VENTA");
  const withoutMarkets = valuesForConclusion(values, new Set(["mercado-inmuebles", "mercado-terrenos", "ingresos"]));
  assert.deepEqual(withoutMarkets.values, { costos: 8_580_000, mercado: null, ingresos: null });
  assert.equal(withoutMarkets.marketSource, null);
});

test("an approach left out of the report does not print, takes no number and its market pages leave the annex too", () => {
  const sections: AppSection[] = [
    section("caratula", []),
    section("costos", [block("costos-1")], { excludedFromReport: withApproachIncluded(section("costos", []), "costos", false) }),
    section("mercadoVenta", [block("motor-mercado-inmueble_venta"), block("motor-mercado-terreno_venta"), block("nota")], { excludedFromReport: ["mercado-inmuebles"] }),
    section("croquisComparables", [block("motor-mercado-inmueble_venta-fotos"), block("croquis")]),
    section("conclusiones", [block("conclusion")]),
  ];
  const excluded = excludedReportApproaches(sections);
  assert.deepEqual([...excluded].sort(), ["costos", "mercado-inmuebles"]);
  assert.equal(sectionLeftOutOfReport(sections[1]), true);
  assert.equal(sectionLeftOutOfReport(sections[2]), false, "land for sale is still in the report");
  assert.equal(sectionForReport(sections[1], excluded), null);
  assert.deepEqual(sectionForReport(sections[2], excluded)?.blocks.map((item) => item.id), ["motor-mercado-terreno_venta", "nota"]);
  assert.equal(blockLeftOutOfReport({ id: "motor-mercado-inmueble_venta-fotos" }, excluded), true);

  const printed = printableSectionGroups(sections).flat();
  assert.deepEqual(printed.map((item) => item.id), ["caratula", "mercadoVenta", "croquisComparables", "conclusiones"]);
  assert.deepEqual(printed[2].blocks.map((item) => item.id), ["croquis"]);

  const numbered = resequenceSections(sections);
  assert.equal(numbered[1].label, "", "a section left out takes no number");
  assert.deepEqual(numbered[2].blocks.map((item) => item.sectionLabel), ["", "I", "II"]);
  assert.equal(numbered[4].label, "IV");

  // Turned on again, it prints and numbers as before.
  assert.equal(withApproachIncluded(sections[1], "costos", true), undefined);
});

/* ------------------------------------------------------------------ */
/*  Page breaks                                                        */
/* ------------------------------------------------------------------ */

test("a section that continues the one before shares its pages; the carátula never does", () => {
  const groups = groupSectionsForPrint([
    { id: "caratula" },
    { id: "datos", pageBreak: "continue" as const },
    { id: "terreno", pageBreak: "continue" as const },
    { id: "construccion" },
    { id: "costos", pageBreak: "continue" as const },
  ]);
  assert.deepEqual(groups.map((group) => group.map((item) => item.id)), [["caratula"], ["datos", "terreno"], ["construccion", "costos"]]);

  // In print, the continuing section's blocks flow on the last page of the one before.
  const first = section("terreno", [block("t1")]);
  const second = section("construccion", [block("c1")], { pageBreak: "continue" });
  const [group] = printableSectionGroups([first, second]);
  assert.deepEqual(group.map((item) => item.id), ["terreno", "construccion"]);
  const items = group.flatMap((item) => item.blocks.flatMap((entry) => documentBlockFlowItems(entry)));
  const pages = splitMeasuredDocumentFlowItems(items.map((item) => ({ item, height: 100 })), 760);
  assert.equal(pages.length, 1, "no empty space: both sections on one page");
  assert.deepEqual(pages[0].map((placed) => placed.id), items.map((item) => item.id));
});

test("a block starts automatically, on a new page or right where the one before ended", () => {
  const titleOf = (extra: Partial<Block>) => documentBlockFlowItems(block("b", extra))[0];

  const auto = titleOf({});
  assert.equal(auto.startOnNewPage, false);
  assert.equal(auto.keepWithNext, true, "automatic: the title goes with its first content");

  const newPage = titleOf(pageBreakPatch("new-page"));
  assert.equal(newPage.startOnNewPage, true);
  // A block saved before the choice had three values reads from its old flag.
  assert.equal(resolvePageBreak({ startOnNewPage: true }), "new-page");
  assert.equal(titleOf({ startOnNewPage: true }).startOnNewPage, true);

  const continued = titleOf(pageBreakPatch("continue"));
  assert.equal(continued.startOnNewPage, false);
  assert.equal(continued.keepWithNext, false, "its title is not carried to the next page");
  assert.equal(continued.continuesPrevious, true, "no gap after the block before");

  // Measured: the continued block's title stays at the foot of the page while its content goes on.
  const previous = documentBlockFlowItems(block("a"));
  const next = documentBlockFlowItems(block("b", pageBreakPatch("continue")));
  const pages = splitMeasuredDocumentFlowItems(
    [...previous, ...next].map((item, index) => ({ item, height: index === 3 ? 200 : 100 })),
    360,
  );
  assert.deepEqual(pages.map((page) => page.map((placed) => placed.id)), [["a:title", previous[1].id, "b:title"], [next[1].id]]);
  const automatic = documentBlockFlowItems(block("b"));
  const autoPages = splitMeasuredDocumentFlowItems(
    [...previous, ...automatic].map((item, index) => ({ item, height: index === 3 ? 200 : 100 })),
    360,
  );
  assert.deepEqual(autoPages.map((page) => page.map((placed) => placed.id)), [["a:title", previous[1].id], ["b:title", automatic[1].id]]);
});

/* ------------------------------------------------------------------ */
/*  Data labels, photos side by side, tables, band                     */
/* ------------------------------------------------------------------ */

test("concepts side by side print as data labels, each as wide as its content, white or shaded", () => {
  const layout = {
    version: 2 as const,
    rows: [{ id: "r1", tagStyle: "shaded" as const, columns: [{ id: "c1", items: [{ type: "concept" as const, id: "v" }] }, { id: "c2", items: [{ type: "concept" as const, id: "s" }] }] }],
  };
  assert.equal(normalizeContentLayout(layout).rows[0].tagStyle, "shaded", "kept when the layout is read back");
  const tagged = block("valores", {
    concepts: [
      { id: "v", label: "Valor total", value: "$150,000,000.00", enabled: true },
      { id: "s", label: "Superficie", value: "120 m²", enabled: true },
    ],
    contentLayout: layout,
  });
  const html = printed(<>{documentBlockFlowItems(tagged).map((item) => <div key={item.id}>{item.node}</div>)}</>);
  assert.match(html, /data-row-tags="shaded"/);
  assert.equal(html.match(/data-concept-tag="shaded"/g)?.length, 2);
  assert.match(html, /justify-between/);
  assert.doesNotMatch(html, /grid-cols-2/, "not columns of equal width");
});

test("a photo without a caption keeps the room of its neighbour's, so the pair stays level", () => {
  const photos = block("fotos", {
    concepts: [],
    images: [
      { id: "i1", title: "Fachada", src: "/fachada.jpg", enabled: true, captions: [{ id: "k", text: "Fachada principal", position: "top", align: "center" }] },
      { id: "i2", title: "Calle", src: "/calle.jpg", enabled: true },
    ],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "c1", items: [{ type: "image", id: "i1" }] }, { id: "c2", items: [{ type: "image", id: "i2" }] }] }] },
  });
  const html = printed(<>{documentBlockFlowItems(photos).map((item) => <div key={item.id}>{item.node}</div>)}</>);
  assert.equal(html.match(/data-caption-room=""/g)?.length, 1, "one empty caption line above the second photo");
  assert.match(html, /Fachada principal/);
});

test("a table prints a double header over the columns the appraiser grouped, as wide as the page or its content", () => {
  const table: TableV2 = ensureTableV2({
    id: "t", title: "Cuadro", version: 2,
    columns: [{ id: "a", name: "Concepto" }, { id: "b", name: "Mínimo" }, { id: "c", name: "Máximo" }, { id: "d", name: "Nota" }],
    rows: [{ id: "r", cells: { a: { kind: "value", value: "Precio" }, b: { kind: "value", value: "1" }, c: { kind: "value", value: "2" }, d: { kind: "value", value: "-" } } }],
  });
  const grouped = groupTableHeaders(table, "c", "b", "RANGO");
  const layout = getTableHeaderLayout(grouped);
  assert.equal(layout.hasGroups, true);
  assert.deepEqual(layout.topRow.map((cell) => (cell.kind === "column" ? cell.columnId : `${cell.group.title}×${cell.colSpan}`)), ["a", "RANGO×2", "d"]);
  assert.deepEqual(layout.bottomRow, ["b", "c"]);
  assert.deepEqual(grouped.columns.map((column) => column.id), ["a", "b", "c", "d"], "the columns keep their order");

  const html = printed(<DocumentTable table={asContent(setTableWidthMode(grouped, "content"))} variant="report" />);
  assert.match(html, /colSpan="2"|colspan="2"/);
  assert.match(html, /RANGO/);
  assert.match(html, /data-table-width="content"/);
  assert.doesNotMatch(printed(<DocumentTable table={asContent(grouped)} variant="report" />), /data-table-width/);

  const ungrouped = ungroupTableHeaders(grouped, grouped.schema!.headerGroups![0].id);
  assert.equal(getTableHeaderLayout(ungrouped).hasGroups, false);
  // The homologation preset keeps its own header.
  const preset = { ...table, schema: { presetId: "homologation", zones: [] } };
  assert.equal(groupTableHeaders(preset, "a", "b", "X"), preset);
});

test("the DICTAMEN VALUATORIO band is framed when blue and sits close to the title after it when white", () => {
  const letterhead: Letterhead = { name: "Valuadores", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };
  const caratula = { folio: "TCH-001", fechaAvaluo: "", mesesVigencia: null, fechaVigencia: "", camposEncabezado: [] } as unknown as CaratulaFormData;
  const filled = printed(<DocumentPreviewHeader caratula={caratula} letterhead={letterhead} />);
  assert.match(filled, /<div class="[^"]*border-2 border-\[var\(--caratula-dark-blue\)\][^"]*" data-title-band-frame=""><div class="[^"]*" data-title-band="filled">DICTAMEN VALUATORIO<\/div><\/div>/);
  const outline = printed(<DocumentPreviewHeader caratula={caratula} letterhead={letterhead} />, { ...DEFAULT_PAGE_PRESENTATION, titleBand: "outline" });
  assert.match(outline, /class="mt-1 -mb-2 [^"]*" data-title-band="outline"/);
  assert.doesNotMatch(outline, /data-title-band-frame/);
});
