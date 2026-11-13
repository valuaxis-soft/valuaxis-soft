import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BlockFlowRenderer } from "../src/features/valuations/components/editor/block-flow-renderer";
import { CARATULA_LONG_TEXT_SELECTION_REASON } from "../src/features/valuations/components/editor/block-toolbar";
import { ConceptSelectionScope } from "../src/features/valuations/components/editor/concept-selection";
import { ContentDragPreview } from "../src/features/valuations/components/editor/content-layout-drag-preview";
import { ValuationEditorPanel } from "../src/features/valuations/components/workspace/valuation-editor-panel";
import type { Apartado, AppSection, Block, Concept } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { getCaratulaBlockKind } from "../src/features/valuations/services/caratula-blocks";
import { COMPANY_HEADER_BLOCK_ID } from "../src/features/valuations/services/caratula-company-header";
import {
  apartadoCrossBlockReason,
  apartadoDragBlockIds,
  moveApartadoTo,
} from "../src/features/valuations/services/structure-transfer";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

const concept = (id: string, label = `Concepto ${id}`): Concept => ({ id, label, value: "", enabled: true });

const apartado = (id: string, extra: Partial<Apartado> = {}): Apartado => ({
  id,
  title: `Subbloque ${id}`,
  enabled: true,
  concepts: [concept(`${id}-c`)],
  tables: [],
  images: [],
  ...extra,
});

const templateCaratula = () => createInitialSections().find((section) => section.id === "caratula")!;

/** The template carátula with a subbloque in its first block of data. */
function caratulaWithSubbloque(sub: Apartado = apartado("sub-1")): AppSection {
  const section = templateCaratula();
  const first = section.blocks.find((block) => block.id !== COMPANY_HEADER_BLOCK_ID && getCaratulaBlockKind(block) === "intermediate")!;
  return {
    ...section,
    blocks: section.blocks.map((block) => (block.id === first.id ? { ...block, apartados: [...block.apartados, sub] } : block)),
  };
}

const editableBlocks = (section: AppSection) => section.blocks.filter((block) => block.id !== COMPANY_HEADER_BLOCK_ID);

/* ------------------------------------------------------------------ */
/*  V5.6-21: a subbloque is dragged to another block of the carátula    */
/* ------------------------------------------------------------------ */

test("every block of the carátula takes subbloques by drag, as in Datos; the company header does not", () => {
  const section = templateCaratula();
  const ids = apartadoDragBlockIds(section);
  for (const block of editableBlocks(section)) assert.ok(ids.has(block.id), `${block.title} takes subbloques`);
  assert.equal(ids.has(COMPANY_HEADER_BLOCK_ID), false);
  assert.ok(editableBlocks(section).some((block) => getCaratulaBlockKind(block) === "assumptions" && ids.has(block.id)));
  assert.ok(editableBlocks(section).some((block) => getCaratulaBlockKind(block) === "conclusion" && ids.has(block.id)));
});

test("a subbloque of concepts moves to another block of the carátula; one with a table or an image is not offered, saying why", () => {
  const section = caratulaWithSubbloque();
  const [from, to] = editableBlocks(section);
  assert.equal(apartadoCrossBlockReason(section, from.apartados.at(-1)!), null);

  const moved = moveApartadoTo([section], { sectionId: "caratula", blockId: from.id, apartadoId: "sub-1" }, { sectionId: "caratula", blockId: to.id });
  assert.ok(moved.changed);
  const after = moved.sections[0].blocks;
  assert.ok(after.find((block) => block.id === to.id)!.apartados.some((item) => item.id === "sub-1"));
  assert.ok(!after.find((block) => block.id === from.id)!.apartados.some((item) => item.id === "sub-1"));

  const withTable = apartado("sub-t", { tables: [{ id: "t1", title: "Tabla", columns: ["A"], columnKeys: [], rows: [["1"]], enabled: true }] });
  const withImage = apartado("sub-i", { images: [{ id: "i1", title: "Foto", src: "", enabled: true }] });
  for (const sub of [withTable, withImage]) {
    const reason = apartadoCrossBlockReason(caratulaWithSubbloque(sub), sub);
    assert.match(reason ?? "", /solo conceptos y subbloques/);
  }
  // The same subbloque in Datos goes anywhere.
  const datos = createInitialSections().find((item) => item.id === "datos")!;
  assert.equal(apartadoCrossBlockReason(datos, withTable), null);
});

test("the card that follows the pointer says why a subbloque has nowhere else to go", () => {
  const html = renderToStaticMarkup(<ContentDragPreview item={{ type: "table", id: "sub" }} label="Subbloque" note="La carátula lleva solo conceptos y subbloques" />);
  assert.match(html, /Subbloque/);
  assert.match(html, /data-drag-note="">La carátula lleva solo conceptos y subbloques/);
});

const renderFlow = (block: Block) => renderToStaticMarkup(
  <BlockFlowRenderer
    block={block}
    allConcepts={[]}
    conceptCallbacks={{ onRemove: () => {}, onUpdate: () => {} }}
    imageCallbacks={{ onRemove: () => {}, onUpdate: () => {} }}
    tableCallbacks={{ onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {} }}
    readOnly={false}
    showContentRows={false}
    onContentLayoutChange={() => {}}
    onBlockFlowChange={() => {}}
    renderApartado={(sub) => <div data-testid={`apartado-${sub.id}`}>{sub.title}</div>}
  />,
);

const longTextBlock = (extra: Partial<Block> = {}): Block => ({
  id: "caratula-supuestos",
  title: "SUPUESTOS Y CONDICIONES LIMITANTES",
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: [{ ...concept("texto", "Supuestos"), type: "longText", value: "Texto largo" }],
  apartados: [],
  tables: [],
  images: [],
  ...extra,
});

test("the assumptions block, with its text and no subbloque, still has a place where a subbloque lands", () => {
  const html = renderFlow(longTextBlock());
  assert.match(html, /data-bf-block-inside="caratula-supuestos"/);
  assert.doesNotMatch(html, /Texto largo/, "its text is edited in its own field, not here");
});

test("the assumptions block shows its subbloques and not its text", () => {
  const html = renderFlow(longTextBlock({ apartados: [apartado("sub-a")] }));
  assert.match(html, /data-testid="apartado-sub-a"/);
  assert.doesNotMatch(html, /Texto largo/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-03: the subbloque has the same room on both sides              */
/* ------------------------------------------------------------------ */

test("a subbloque has on its right the same 32 px its handle takes on the left", () => {
  const html = renderFlow(longTextBlock({ apartados: [apartado("sub-a")] }));
  // Handle size-7 (28 px) + gap-1 (4 px) on the left; pr-8 (32 px) on the right.
  assert.match(html, /class="flex items-start gap-1 pr-8"/);
  assert.match(html, /size-7/);
});

/* ------------------------------------------------------------------ */
/*  V5.6-07: the carátula has the controls of any section               */
/* ------------------------------------------------------------------ */

test("a block with no concept of its own offers «Seleccionar conceptos» disabled, saying why, on the line of «Agregar»", () => {
  const html = renderToStaticMarkup(
    <ConceptSelectionScope concepts={[]} readOnly={false} emptyReason={CARATULA_LONG_TEXT_SELECTION_REASON} actions={<button type="button">Agregar</button>} onApplySpacing={() => {}} />,
  );
  const line = html.match(/<div[^>]*data-container-actions=""[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.ok(line.indexOf("Agregar") >= 0 && line.indexOf("Agregar") < line.indexOf("Seleccionar conceptos"), "«Agregar» first, then «Seleccionar conceptos»");
  assert.match(line, /disabled=""[^>]*title="El texto de este bloque se escribe en su recuadro/);
});

function renderPanel(section: AppSection) {
  const noop = () => {};
  const props = new Proxy({ section, allSections: [section], readOnly: false } as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : typeof key === "string" && key.startsWith("on") ? noop : undefined),
    has: () => true,
  });
  return renderToStaticMarkup(<ValuationEditorPanel {...(props as unknown as Parameters<typeof ValuationEditorPanel>[0])} />);
}

const count = (html: string, pattern: RegExp) => html.match(new RegExp(pattern, "g"))?.length ?? 0;

test("every block of the carátula has the first line of any block, the assumptions and the conclusion too", () => {
  const section = caratulaWithSubbloque();
  const html = renderPanel(section);
  const blocks = editableBlocks(section);
  const subbloques = blocks.reduce((total, block) => total + block.apartados.length, 0);
  // One «Seleccionar conceptos» per block and per subbloque, as in Datos.
  assert.equal(count(html, /data-concept-selection-start=""/), blocks.length + subbloques);
  assert.equal(count(html, /El texto de este bloque se escribe en su recuadro/), blocks.filter((block) => getCaratulaBlockKind(block) !== "intermediate").length);
});

test("the carátula has no loose «Concepto» button at the foot of its blocks nor a «Clave» field", () => {
  const section = caratulaWithSubbloque();
  const html = renderPanel(section);
  assert.doesNotMatch(html, />Clave</);
  assert.doesNotMatch(html, /border-t pt-3/, "no row at the foot of the block");
  // «Concepto» is offered inside «Agregar», as in every section; Datos and the carátula show the same buttons.
  const datos = createInitialSections().find((item) => item.id === "datos")!;
  const conceptButtons = (markup: string) => count(markup, />Concepto<\/button>/);
  assert.equal(conceptButtons(html), conceptButtons(renderPanel(datos)));
});
