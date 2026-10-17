import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { DocumentPreviewPage } from "../src/features/valuations/components/document-preview-page";
import { DocumentThemeProvider, type DocumentThemeVariant } from "../src/features/valuations/components/document-theme";
import { PagePresentationProvider } from "../src/features/valuations/components/page-presentation-context";
import { buildSectionsPayload } from "../src/features/valuations/components/workspace/model/save-payload";
import { hydrateSectionMetadata } from "../src/features/valuations/metadata";
import type { AppSection, Block } from "../src/features/valuations/model";
import {
  DEFAULT_PAGE_PRESENTATION,
  documentPagePresentation,
  type PagePresentation,
} from "../src/features/valuations/services/page-presentation";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const section = (id: string, extra: Partial<AppSection> = {}): AppSection =>
  ({ id, label: id, title: id, sourceFile: "", enabled: true, required: false, blocks: [], ...extra });

const block: Block = {
  id: "bloque", title: "TERRENO", sectionLabel: "III", enabled: true, required: false,
  concepts: [{ id: "a", label: "Niveles", value: "4", enabled: true }], apartados: [], tables: [], images: [],
};

const printed = (presentation: PagePresentation, node: ReactNode, variant: DocumentThemeVariant = "standard") =>
  renderToStaticMarkup(
    <PagePresentationProvider presentation={presentation}>
      <DocumentThemeProvider variant={variant}>{node}</DocumentThemeProvider>
    </PagePresentationProvider>,
  );

test("the page choices live on the carátula section; a document that chose nothing prints as always", () => {
  assert.deepEqual(documentPagePresentation([]), DEFAULT_PAGE_PRESENTATION);
  assert.deepEqual(documentPagePresentation([section("caratula"), section("terreno")]), { bindingMargin: "normal", titleBars: "filled" });
  assert.deepEqual(
    documentPagePresentation([section("caratula", { bindingMargin: "wide", titleBars: "outline" })]),
    { bindingMargin: "wide", titleBars: "outline" },
  );
  assert.deepEqual(
    documentPagePresentation([section("terreno", { bindingMargin: "wide" }), section("caratula")]),
    DEFAULT_PAGE_PRESENTATION,
    "only the cover's choice counts",
  );
});

test("the page choices travel in the section's configuration and read back", () => {
  const [saved] = buildSectionsPayload([section("caratula", { bindingMargin: "wide", titleBars: "outline" })]);
  assert.equal(saved.bindingMargin, "wide");
  assert.equal(saved.titleBars, "outline");
  const hydrated = hydrateSectionMetadata(saved);
  assert.equal(hydrated.bindingMargin, "wide");
  assert.equal(hydrated.titleBars, "outline");
  assert.equal(hydrateSectionMetadata({ payload: { bindingMargin: "wide" } }).bindingMargin, "wide");
  // Saved before the choice existed, or unreadable: nothing, so the default prints.
  assert.equal(hydrateSectionMetadata({ thousandsSeparator: false }).bindingMargin, undefined);
  assert.equal(hydrateSectionMetadata({ bindingMargin: "huge", titleBars: 3 }).titleBars, undefined);
});

test("a wide binding margin leaves 1.5 cm more on the left of every page", () => {
  const page = (presentation: PagePresentation) => printed(presentation, <DocumentPreviewPage header={null} pageNumber={1}>Contenido</DocumentPreviewPage>);
  assert.doesNotMatch(page(DEFAULT_PAGE_PRESENTATION), /padding-left/);
  assert.match(page({ ...DEFAULT_PAGE_PRESENTATION, bindingMargin: "wide" }), /<article style="padding-left:57px" data-binding-margin="wide"/);
});

test("title bars print blue, or without the fill as dark text over a thin rule", () => {
  const [title] = documentBlockFlowItems(block);
  const filled = printed(DEFAULT_PAGE_PRESENTATION, title.node);
  assert.match(filled, /bg-\[#00285A\][^"]*text-white/);

  const outline = printed({ ...DEFAULT_PAGE_PRESENTATION, titleBars: "outline" }, title.node);
  assert.doesNotMatch(outline, /bg-\[#00285A\]|text-white/);
  assert.match(outline, /border-b border-\[#00285A\][^"]*text-\[#00285A\]/);
  assert.match(outline, /III\. TERRENO/);

  // The cover keeps its own titles whatever the choice.
  const cover = (presentation: PagePresentation) => printed(presentation, title.node, "caratula");
  assert.equal(cover({ ...DEFAULT_PAGE_PRESENTATION, titleBars: "outline" }), cover(DEFAULT_PAGE_PRESENTATION));
});
