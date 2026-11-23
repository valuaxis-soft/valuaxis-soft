/**
 * The colours of the dictamen: the palette's schema, its contrast, the CSS
 * variables a document sets and how the palette travels on the carátula
 * section. A document that chose nothing prints with the colours it always had.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { withFirmDocumentPalette } from "../src/features/firm/document-palette.service";
import { firmDocumentPaletteSchema } from "../src/features/firm/firm-schemas";
import { DocumentPreviewHeader } from "../src/features/valuations/components/document-preview-header";
import { DocumentThemeProvider, TABLE_HEADER_BAND, useDocumentTheme } from "../src/features/valuations/components/document-theme";
import { DocumentPalettePicker } from "../src/features/valuations/components/editor/document-palette-picker";
import { CalculationMemoryDocument } from "../src/features/valuations/components/memory/calculation-memory-document";
import { buildCalculationMemory } from "../src/features/valuations/memory/calculation-memory";
import { createInitialSections } from "../src/features/valuations/sections";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import { SectionDocument } from "../src/features/valuations/components/report-preview";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { hydrateSectionMetadata, sectionMetadataFromContent } from "../src/features/valuations/metadata";
import type { AppSection, CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import {
  AA_TEXT_CONTRAST,
  DEFAULT_DOCUMENT_PALETTE,
  DOCUMENT_PALETTE_PRESETS,
  contrastRatio,
  documentPaletteContrast,
  documentPaletteSchema,
  documentPaletteVars,
  documentPaletteWarnings,
  readDocumentPalette,
  readableTextOn,
  relativeLuminance,
} from "../src/features/valuations/services/document-palette";
import { DEFAULT_PAGE_PRESENTATION, documentPagePresentation, type PagePresentation } from "../src/features/valuations/services/page-presentation";
import { saveFullValuationSchema } from "../src/features/valuations/validations/valuation-api.schemas";

import "./support/ssr-portal-shim";

const VINO = { strong: "#6B1F2E", pastel: "#F2D7DB" };
/** A palette that reads poorly both ways: a yellow that takes no white text and a navy that takes no dark text. */
const LOW_CONTRAST = { strong: "#FFE066", pastel: "#1B2A4A" };

const section = (id: string, patch: Partial<AppSection> = {}): AppSection => ({
  id, label: id, title: id, sourceFile: `${id}.pdf`, enabled: true, blocks: [], ...patch,
} as AppSection);

const caratula = { folio: "INV-0001", fechaAvaluo: "2026-11-22", mesesVigencia: 6, fechaVigencia: "", camposEncabezado: [], firmas: [] } as unknown as CaratulaFormData;
const letterhead: Letterhead = { name: "Despacho Inventado", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };
const meta = { folio: "INV-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;

test("the palette's schema takes only two #RRGGBB colours and keeps them in upper case", () => {
  assert.deepEqual(documentPaletteSchema.parse({ strong: "#6b1f2e", pastel: " #F2D7DB " }), VINO);
  // Whatever else comes with it is dropped: only the two colours are kept.
  assert.deepEqual(documentPaletteSchema.parse({ ...VINO, extra: "x" }), VINO);
  for (const bad of ["red", "#FFF", "#12345G", "6B1F2E", "#6B1F2E;color:red", "url(https://example.test/x)", "var(--primary)", "#6B1F2EFF", "", null, 7]) {
    assert.equal(documentPaletteSchema.safeParse({ strong: bad, pastel: "#F2D7DB" }).success, false, `strong ${String(bad)}`);
    assert.equal(documentPaletteSchema.safeParse({ strong: "#6B1F2E", pastel: bad }).success, false, `pastel ${String(bad)}`);
  }
  assert.equal(documentPaletteSchema.safeParse({ strong: "#6B1F2E" }).success, false);
  assert.equal(readDocumentPalette({ strong: "javascript:alert(1)", pastel: "#FFFFFF" }), undefined);
  assert.equal(readDocumentPalette(null), undefined);
});

test("luminance and contrast follow WCAG 2", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
  assert.equal(Math.round(contrastRatio("#000000", "#FFFFFF")), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
  // #767676 on white is the usual example of the AA limit (4.54:1).
  assert.equal(contrastRatio("#767676", "#FFFFFF").toFixed(2), "4.54");
  assert.equal(contrastRatio("#FFFFFF", "#00285A"), contrastRatio("#00285A", "#FFFFFF"));
  assert.equal(readableTextOn("#00285A"), "#FFFFFF");
  assert.equal(readableTextOn("#FFE066"), "#1A1A1A");
  assert.equal(readableTextOn("#BDD7EE"), "#1A1A1A");
});

test("every palette offered reads at AA: white on its strong colour, dark on its pastel, and the strong colour on the pastel", () => {
  assert.ok(DOCUMENT_PALETTE_PRESETS.length >= 8 && DOCUMENT_PALETTE_PRESETS.length <= 10);
  assert.deepEqual({ strong: DOCUMENT_PALETTE_PRESETS[0].strong, pastel: DOCUMENT_PALETTE_PRESETS[0].pastel }, DEFAULT_DOCUMENT_PALETTE);
  assert.equal(new Set(DOCUMENT_PALETTE_PRESETS.map((preset) => preset.key)).size, DOCUMENT_PALETTE_PRESETS.length);
  for (const preset of DOCUMENT_PALETTE_PRESETS) {
    const contrast = documentPaletteContrast(preset);
    assert.ok(contrast.strong.passes, `${preset.name}: blanco sobre fuerte ${contrast.strong.ratio}`);
    assert.ok(contrast.pastel.passes, `${preset.name}: oscuro sobre pastel ${contrast.pastel.ratio}`);
    assert.ok(contrastRatio(preset.strong, preset.pastel) >= AA_TEXT_CONTRAST, `${preset.name}: fuerte sobre pastel`);
    assert.deepEqual(documentPaletteWarnings(preset), []);
  }
});

test("a palette that reads poorly warns, and the text over each colour turns dark or white by itself", () => {
  const warnings = documentPaletteWarnings(LOW_CONTRAST);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /color fuerte.*1\.3:1.*4\.5:1/);
  assert.match(warnings[1], /color pastel.*4\.5:1/);
  assert.equal(documentPaletteWarnings({ strong: "#6B1F2E", pastel: "#1B2A4A" }).length, 1);
  // It is still a palette: nothing refuses it.
  assert.deepEqual(documentPaletteSchema.parse(LOW_CONTRAST), LOW_CONTRAST);
  const vars = documentPaletteVars(LOW_CONTRAST);
  assert.equal(vars["--doc-on-strong"], "#1A1A1A");
  assert.equal(vars["--doc-on-pastel"], "#FFE066", "the yellow reads over the navy (AA), so the header keeps the strong colour");
  assert.equal(vars["--doc-ink-on-pastel"], "#FFFFFF");
  assert.ok(contrastRatio("#1A1A1A", vars["--doc-pastel-soft"]) >= AA_TEXT_CONTRAST, "the soft tint always takes dark text");
  // Two colours too close: the header text falls back to white or dark.
  const close = documentPaletteVars({ strong: "#8899AA", pastel: "#99AABB" });
  assert.equal(close["--doc-on-pastel"], "#1A1A1A");
});

test("a document without a palette sets only the two blues it always set", () => {
  const untouched = { "--caratula-blue": "#003B73", "--caratula-dark-blue": "#00285A" };
  assert.deepEqual(documentPaletteVars(), untouched);
  assert.deepEqual(documentPaletteVars(null), untouched);
  assert.deepEqual(documentPaletteVars(DEFAULT_DOCUMENT_PALETTE), untouched);
  assert.deepEqual(documentPaletteVars({ strong: "#00285a", pastel: "#bdd7ee" }), untouched);
  // An invalid one is no palette.
  assert.deepEqual(documentPaletteVars({ strong: "red", pastel: "#BDD7EE" }), untouched);
  const vino = documentPaletteVars(VINO);
  assert.equal(vino["--caratula-blue"], "#6B1F2E");
  assert.equal(vino["--caratula-dark-blue"], "#6B1F2E");
  assert.equal(vino["--doc-apartado"], "#6B1F2E");
  assert.equal(vino["--doc-on-strong"], "#FFFFFF");
  assert.equal(vino["--doc-pastel"], "#F2D7DB");
  assert.equal(vino["--doc-on-pastel"], "#6B1F2E");
  for (const value of Object.values(vino)) assert.match(value, /^#[0-9A-F]{6}$/);
});

test("the palette is the document's: read from its carátula section, saved with it and read back", () => {
  assert.deepEqual(documentPagePresentation([section("caratula"), section("terreno")]), DEFAULT_PAGE_PRESENTATION);
  assert.equal("palette" in documentPagePresentation([section("caratula")]), false);
  assert.deepEqual(documentPagePresentation([section("caratula", { palette: VINO }), section("terreno")]).palette, VINO);
  // Only the carátula carries it, and the document's own blue is no choice.
  assert.equal(documentPagePresentation([section("caratula"), section("terreno", { palette: VINO })]).palette, undefined);
  assert.equal(documentPagePresentation([section("caratula", { palette: DEFAULT_DOCUMENT_PALETTE })]).palette, undefined);
  assert.equal(documentPagePresentation([section("caratula", { palette: { strong: "red", pastel: "blue" } })]).palette, undefined);

  const [saved] = buildSectionsPayload([section("caratula", { palette: VINO })]);
  assert.deepEqual(saved.palette, VINO);
  assert.equal("palette" in buildSectionsPayload([section("caratula")])[0], false);
  assert.deepEqual(hydrateSectionMetadata(saved).palette, VINO);
  assert.deepEqual(hydrateSectionMetadata({ payload: saved }).palette, VINO);
  assert.equal(hydrateSectionMetadata({ palette: { strong: "#6B1F2E", pastel: "expression(alert(1))" } }).palette, undefined);
  assert.equal(sectionMetadataFromContent({ enabled: true, palette: { strong: "x", pastel: "y" } }).palette, undefined);
});

test("saving a document refuses a palette that is not two hex colours", () => {
  const body = (palette: unknown) => ({ title: "Casa inventada", sections: [{ id: "caratula", palette }] });
  const accepted = saveFullValuationSchema.safeParse(body({ strong: "#6b1f2e", pastel: "#F2D7DB" }));
  assert.ok(accepted.success);
  assert.deepEqual(accepted.data.sections?.[0].palette, VINO);
  assert.equal(saveFullValuationSchema.safeParse(body({ strong: "red;background:url(x)", pastel: "#F2D7DB" })).success, false);
  assert.equal(saveFullValuationSchema.safeParse(body("vino")).success, false);
  assert.ok(saveFullValuationSchema.safeParse({ title: "Casa inventada", sections: [{ id: "caratula" }] }).success);
});

test("the firm's palette is the start of a new document, unless the document brings its own", () => {
  const blank = [section("caratula"), section("terreno")];
  assert.deepEqual(withFirmDocumentPalette(blank, VINO)[0].palette, VINO);
  assert.equal(withFirmDocumentPalette(blank, VINO)[1].palette, undefined);
  assert.equal(blank[0].palette, undefined, "the sections given are not changed");
  // A firm without a palette changes nothing.
  assert.equal(withFirmDocumentPalette(blank, null), blank);
  // A template that chose its colours keeps them.
  const own = { strong: "#1E5631", pastel: "#D5E8D4" };
  assert.deepEqual(withFirmDocumentPalette([section("caratula", { palette: own })], VINO)[0].palette, own);

  assert.deepEqual(firmDocumentPaletteSchema.parse({ palette: { strong: "#6b1f2e", pastel: "#f2d7db" } }), { palette: VINO });
  assert.deepEqual(firmDocumentPaletteSchema.parse({ palette: null }), { palette: null });
  assert.equal(firmDocumentPaletteSchema.safeParse({ palette: { strong: "vino", pastel: "#F2D7DB" } }).success, false);
  assert.equal(firmDocumentPaletteSchema.safeParse({}).success, false);
});

function SectionTitle() {
  const theme = useDocumentTheme();
  return <h2 className={theme.sectionTitle}>Terreno</h2>;
}

const printed = (presentation: PagePresentation, node: React.ReactNode) =>
  renderToStaticMarkup(<PagePresentationProvider presentation={presentation}>{node}</PagePresentationProvider>);

test("the root of a document sets its palette, and its bars and tables read it with today's colours as fallback", () => {
  const cover = section("terreno", { blocks: [] });
  const document = (presentation: PagePresentation) =>
    printed(presentation, (
      <SectionDocument
        caratula={caratula}
        letterhead={letterhead}
        meta={meta}
        section={cover}
        principalCoverImage={null}
      />
    ));
  const untouched = document(DEFAULT_PAGE_PRESENTATION);
  assert.match(untouched, /class="light" style="--caratula-blue:#003B73;--caratula-dark-blue:#00285A"/);
  assert.doesNotMatch(untouched, /style="[^"]*--doc-/);
  const vino = document({ ...DEFAULT_PAGE_PRESENTATION, palette: VINO });
  assert.match(vino, /class="light" style="--caratula-blue:#6B1F2E;--caratula-dark-blue:#6B1F2E;[^"]*--doc-pastel:#F2D7DB/);

  // The filled bar, the outlined one and the header band of the tables name the variable with the old colour beside it.
  const bar = renderToStaticMarkup(<DocumentThemeProvider variant="standard"><SectionTitle /></DocumentThemeProvider>);
  assert.match(bar, /bg-\[var\(--caratula-dark-blue,#00285A\)\][^"]*text-\[color:var\(--doc-on-strong,#fff\)\]/);
  const outline = printed({ ...DEFAULT_PAGE_PRESENTATION, titleBars: "outline" }, <DocumentThemeProvider variant="standard"><SectionTitle /></DocumentThemeProvider>);
  assert.match(outline, /border-\[var\(--caratula-dark-blue,#00285A\)\] bg-white/);
  assert.match(TABLE_HEADER_BAND, /bg-\[var\(--doc-pastel,#BDD7EE\)\] text-\[color:var\(--doc-on-pastel,var\(--caratula-dark-blue\)\)\]/);
  const band = printed(DEFAULT_PAGE_PRESENTATION, <DocumentPreviewHeader caratula={caratula} letterhead={letterhead} />);
  assert.match(band, /data-title-band="filled"/);
  assert.match(band, /bg-\[var\(--caratula-dark-blue\)\][^"]*text-\[color:var\(--doc-on-strong,#fff\)\]/);
});

test("the calculation memory prints with the valuation's palette, and with the blues of always without one", () => {
  const memory = buildCalculationMemory({
    sections: createInitialSections(),
    calculations: { markets: [], cost: null, income: null, machinery: null, conclusion: null },
    stored: [],
    folio: "INV-0001",
    valuationDate: "2026-11-22",
    firmName: "Despacho Inventado",
    concluded: false,
    generatedAt: new Date("2026-11-22T18:00:00Z"),
  });
  const render = (palette?: typeof VINO) =>
    renderToStaticMarkup(
      <CalculationMemoryDocument caratula={caratula} headerImage={null} letterhead={letterhead} memory={memory} propertyKind="casa" palette={palette} />,
    );
  assert.match(render(), /data-print-memory[^>]*style="--caratula-blue:#003B73;--caratula-dark-blue:#00285A"/);
  assert.match(render(VINO), /data-print-memory[^>]*style="--caratula-blue:#6B1F2E;--caratula-dark-blue:#6B1F2E;[^"]*--doc-pastel:#F2D7DB/);
});

test("the picker offers the palettes and «Personalizada», marks the one chosen and tells of a poor contrast without refusing it", () => {
  const html = (value: typeof VINO) => renderToStaticMarkup(<DocumentPalettePicker value={value} onChange={() => {}} />);
  const vino = html(VINO);
  assert.equal((vino.match(/role="radio"/g) ?? []).length, DOCUMENT_PALETTE_PRESETS.length + 1);
  assert.match(vino, /aria-checked="true"[^>]*data-palette-option="vino"/);
  assert.match(vino, /aria-checked="false"[^>]*data-palette-option="personalizada"/);
  assert.doesNotMatch(vino, /data-palette-warnings/);
  assert.doesNotMatch(vino, /data-palette-custom/);

  const own = html({ strong: "#123456", pastel: "#E8F0F8" });
  assert.match(own, /aria-checked="true"[^>]*data-palette-option="personalizada"/);
  assert.match(own, /data-palette-custom/);
  assert.match(own, /type="color"[^>]*value="#123456"/);
  assert.doesNotMatch(own, /data-palette-warnings/);

  const poor = html(LOW_CONTRAST);
  assert.match(poor, /data-palette-warnings/);
  assert.match(poor, /El color fuerte es muy claro/);
  assert.match(poor, /El color pastel es muy oscuro/);
  // The sample already shows the text turned: dark on the yellow bar.
  assert.match(poor, /background-color:#FFE066;color:#1A1A1A/);
});
