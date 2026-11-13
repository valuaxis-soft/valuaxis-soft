import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Tabs } from "../src/components/ui/tabs";
import { ReportPreview } from "../src/features/valuations/components/report-preview";
import { ValuationNavigation } from "../src/features/valuations/components/workspace/valuation-navigation";
import { isMarginWheel, wheelPixels } from "../src/features/valuations/components/workspace/model/margin-wheel";
import {
  followedBlockId,
  marketBlockId,
  previewBlockSelector,
  previewGroupIds,
  previewScrollDelta,
} from "../src/features/valuations/components/workspace/model/preview-follow";
import type { AppSection, CaratulaFormData, Letterhead } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

/** Terreno continues where Datos ends («Continuar donde terminó la sección anterior»). */
const continuing = (): AppSection[] =>
  createInitialSections().map((section) => (section.id === "terreno" ? { ...section, pageBreak: "continue" } : section));

/* ------------------------------------------------------------------ */
/*  V6.1-09 / V6.3-15: «Continuar donde terminó» in the preview        */
/* ------------------------------------------------------------------ */

test("the preview of a section that shares its pages shows the sections of those pages, as the dictamen prints them", () => {
  const sections = continuing();
  assert.deepEqual(previewGroupIds(sections, "terreno"), ["datos", "terreno"]);
  assert.deepEqual(previewGroupIds(sections, "datos"), ["datos", "terreno"], "the one before too: what follows prints on its pages");
  assert.deepEqual(previewGroupIds(sections, "construccion"), ["construccion"]);
  assert.deepEqual(previewGroupIds(createInitialSections(), "terreno"), ["terreno"], "starting its own page, it shows alone");
  const hidden = sections.map((section) => (section.id === "datos" ? { ...section, enabled: false } : section));
  assert.deepEqual(previewGroupIds(hidden, "terreno"), ["terreno"], "a hidden section does not print, so nothing is shared");
});

const caratula = {
  tituloInmueble: "Casa", numeroAvaluo: "VLO-0001", folio: "VLO-0001", direccionEmpresa: "", telefonoEmpresa: "", correoEmpresa: "",
  solicitante: "", propietario: "", objeto: "", proposito: "", firmas: [], valorTotal: "1000000", valorConLetra: "UN MILLÓN DE PESOS",
  fechaAvaluo: "2026-11-13", mesesVigencia: 6, fechaVigencia: "",
} as unknown as CaratulaFormData;
const meta = { folio: "VLO-0001", client: "", postalCode: "", location: "", valuationKind: "venta", propertyKind: "casa" } as const;
const letterhead: Letterhead = { name: "Despacho Inventado", legalName: null, rfc: null, address: null, phone: null, email: null, logoUrl: null };

test("the section preview lays out the shared pages and says so", () => {
  const sections = continuing();
  const group = sections.filter((section) => section.id === "datos" || section.id === "terreno");
  const terreno = group[1];
  const html = renderToStaticMarkup(
    <ReportPreview caratula={caratula} letterhead={letterhead} meta={meta} principalCoverImage={null} section={terreno} group={group} />,
  );
  assert.match(html, /data-preview-shared-pages=""/);
  assert.match(html, new RegExp(`Comparte páginas con ${group[0].title}`));
  const alone = renderToStaticMarkup(
    <ReportPreview caratula={caratula} letterhead={letterhead} meta={meta} principalCoverImage={null} section={terreno} />,
  );
  assert.doesNotMatch(alone, /data-preview-shared-pages/);
});

/* ------------------------------------------------------------------ */
/*  V6.2-10: the preview follows the block and the market               */
/* ------------------------------------------------------------------ */

/** An element with the given ancestors' attributes, nearest first, as `closest` sees them. */
const elementWithin = (...ancestors: Array<Record<string, string>>) => ({
  closest: (selector: string) => {
    const name = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
    const found = ancestors.find((attributes) => name !== undefined && name in attributes);
    return found ? { getAttribute: (attribute: string) => found[attribute] ?? null } : null;
  },
});

test("the preview follows the market chosen in the calculation, else the block the appraiser is on", () => {
  // The market's pages are the block market-document.ts writes for it.
  assert.equal(marketBlockId("INMUEBLE_VENTA"), "motor-mercado-inmueble_venta-enfoque");
  assert.equal(followedBlockId(elementWithin({ "data-active-market": "INMUEBLE_VENTA" })), "motor-mercado-inmueble_venta-enfoque");
  assert.equal(followedBlockId(elementWithin({ "data-block-id": "bloque-1" }, { "data-active-market": "TERRENO_VENTA" })), "motor-mercado-terreno_venta-enfoque");
  assert.equal(followedBlockId(elementWithin({ "data-block-id": "consideraciones-previas" })), "consideraciones-previas");
  // A concept or a table of a block whose card carries no mark: its block is looked up in the section.
  const section = createInitialSections().find((candidate) => candidate.id === "consideraciones")!;
  const block = section.blocks.find((candidate) => candidate.concepts.length > 0 || candidate.apartados.some((apartado) => apartado.concepts.length > 0))!;
  const concept = block.concepts[0] ?? block.apartados.find((apartado) => apartado.concepts.length > 0)!.concepts[0];
  assert.equal(followedBlockId(elementWithin({ "data-concept-id": concept.id }), section), block.id);
  assert.equal(followedBlockId(elementWithin({ "data-concept-id": "no-existe" }), section), null);
  assert.equal(followedBlockId(elementWithin()), null);
  assert.equal(followedBlockId(null), null);
});

test("the preview goes to where the block starts on a laid-out page, a little under the top", () => {
  assert.equal(
    previewBlockSelector("motor-mercado-terreno_venta"),
    '[data-preview-page] [data-document-flow-item-id^="motor-mercado-terreno_venta:"], [data-preview-page] [data-document-flow-item-id="motor-mercado-terreno_venta"]',
  );
  assert.equal(previewBlockSelector('raro"id'), '[data-preview-page] [data-document-flow-item-id^="raro\\"id:"], [data-preview-page] [data-document-flow-item-id="raro\\"id"]');
  assert.equal(previewScrollDelta(900, 100), 784);
  assert.equal(previewScrollDelta(50, 100), -66);
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  assert.match(panel, /data-active-market=\{type\}/, "the market panel says which market it shows");
});

/* ------------------------------------------------------------------ */
/*  V6.3-10: the wheel over the margins scrolls the editor              */
/* ------------------------------------------------------------------ */

test("the wheel over the margins goes to the editor; over a pane or the top bar it is left alone", () => {
  const node = (name: string) => ({ name }) as unknown as Node;
  const margin = node("margen");
  const insideEditor = node("campo");
  const editor = { contains: (target: Node) => target === insideEditor };
  const preview = { contains: () => false };
  assert.equal(isMarginWheel(margin, [editor, preview, null]), true);
  assert.equal(isMarginWheel(insideEditor, [editor, preview, null]), false);
  assert.equal(isMarginWheel(null, [editor]), false);
  assert.equal(wheelPixels({ deltaY: 120, deltaMode: 0 }, 700), 120);
  assert.equal(wheelPixels({ deltaY: 3, deltaMode: 1 }, 700), 48, "lines");
  assert.equal(wheelPixels({ deltaY: 1, deltaMode: 2 }, 700), 700, "pages");
  const workspace = readFileSync("src/features/valuations/components/workspace/valuation-workspace.tsx", "utf8");
  assert.match(workspace, /useMarginWheel\(workspaceRef\)/);
  assert.match(workspace, /data-workspace-top-bar=""/);
});

/* ------------------------------------------------------------------ */
/*  V6.3-03: section names read whole                                   */
/* ------------------------------------------------------------------ */

test("from a laptop up the section tabs wrap into rows on a row of their own, so every name reads whole", () => {
  const sections = createInitialSections();
  const html = renderToStaticMarkup(
    <Tabs defaultValue="caratula">
      <ValuationNavigation activeSectionId="caratula" enabledSections={sections} iconMap={{}} onReorder={() => {}} readOnly={false} />
    </Tabs>,
  );
  const tabList = /<div[^>]*role="tablist"[^>]*>/.exec(html)?.[0] ?? "";
  assert.match(tabList, /lg:flex-wrap/);
  assert.doesNotMatch(tabList, /truncate/);
  assert.match(html, /data-section-strip="" class="[^"]*lg:overflow-visible/, "no sideways scroll on a wide screen");
  const arrow = /<button[^>]*aria-label="Desplazar secciones a la derecha"[^>]*>/.exec(html)?.[0] ?? "";
  assert.match(arrow, /lg:hidden/, "the scroll arrows are only for narrow screens");
  for (const section of sections.slice(0, 6)) assert.ok(html.includes(section.title), `${section.title} is in the strip, whole`);
  const topBar = readFileSync("src/features/valuations/components/workspace/valuation-top-bar.tsx", "utf8");
  assert.doesNotMatch(topBar, /xl:flex-row/, "the strip no longer shares the row with the actions");
  assert.doesNotMatch(readFileSync("src/features/valuations/components/workspace/valuation-navigation.tsx", "utf8"), /max-w-\[44rem\]/);
});

/* ------------------------------------------------------------------ */
/*  V6.2-03: «Generar croquis de localización»                          */
/* ------------------------------------------------------------------ */

test("the croquis button reads «Generar croquis de localización»", () => {
  const panel = readFileSync("src/features/maps/components/location-panel.tsx", "utf8");
  assert.match(panel, /: "Generar croquis de localización"\}/);
  assert.doesNotMatch(panel, /Aplicar al croquis/);
});
