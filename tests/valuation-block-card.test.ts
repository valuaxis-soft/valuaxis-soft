import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { BlockCard } from "../src/features/valuations/components/editor/block-card";

/* ------------------------------------------------------------------ */
/*  1. BlockCard exists and is exported                               */
/* ------------------------------------------------------------------ */

test("BlockCard — is exported from module", () => {
  assert.equal(typeof BlockCard, "function");
});

/* ------------------------------------------------------------------ */
/*  2. BlockCard composes BlockEditorCard                              */
/* ------------------------------------------------------------------ */

test("BlockCard — composes BlockEditorCard (renders Card wrapper)", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Test Title",
    }),
  );
  // BlockEditorCard renders a shadcn Card which produces a div with role or card-like class
  assert.ok(html.length > 0, "produces non-empty output");
  assert.ok(html.includes("Test Title"), "renders the title");
});

/* ------------------------------------------------------------------ */
/*  3. BlockCard composes BlockEditorHeader                            */
/* ------------------------------------------------------------------ */

test("BlockCard — composes BlockEditorHeader with badge", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Section Title",
      badge: "1.",
    }),
  );
  assert.ok(html.includes("1."), "renders badge content");
  assert.ok(html.includes("Section Title"), "renders title");
});

/* ------------------------------------------------------------------ */
/*  4. BlockCard composes BlockEditorContent                            */
/* ------------------------------------------------------------------ */

test("BlockCard — composes BlockEditorContent (renders children)", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Title",
      children: "Body content here",
    }),
  );
  assert.ok(html.includes("Body content here"), "renders children inside content area");
});

/* ------------------------------------------------------------------ */
/*  5. BlockCard reuses StructuralActions                              */
/* ------------------------------------------------------------------ */

test("BlockCard — renders StructuralActions when structuralActions prop provided", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Title",
      structuralActions: {
        itemLabel: "bloque",
        visibility: {
          visible: true,
          onChange: () => {},
        },
      },
    }),
  );
  // StructuralActions VisibilityToggle renders "Ocultar" button when visible=true
  assert.ok(html.includes("Ocultar"), "renders StructuralActions visibility toggle");
});

test("BlockCard — no StructuralActions rendered when prop omitted", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Title",
    }),
  );
  assert.ok(!html.includes("Ocultar"), "does not render visibility toggle without structuralActions");
  assert.ok(!html.includes("Eliminar"), "does not render delete action without structuralActions");
});

/* ------------------------------------------------------------------ */
/*  6. BlockCard does NOT import DnD libraries                         */
/* ------------------------------------------------------------------ */

test("BlockCard — source does not import DnD libraries", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("@dnd-kit"), "must not import @dnd-kit");
  assert.ok(!source.includes("useSortable"), "must not use useSortable");
  assert.ok(!source.includes("DndContext"), "must not use DndContext");
  assert.ok(!source.includes("SortableContext"), "must not use SortableContext");
});

/* ------------------------------------------------------------------ */
/*  7. BlockCard does NOT import BlockFlowV2                           */
/* ------------------------------------------------------------------ */

test("BlockCard — source does not import BlockFlowV2", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("BlockFlowV2"), "must not reference BlockFlowV2");
  assert.ok(!source.includes("block-flow-v2"), "must not import block-flow-v2");
});

/* ------------------------------------------------------------------ */
/*  8. BlockCard does NOT import ContentLayoutV2                       */
/* ------------------------------------------------------------------ */

test("BlockCard — source does not import ContentLayoutV2", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("ContentLayoutV2"), "must not reference ContentLayoutV2");
  assert.ok(!source.includes("content-layout-v2"), "must not import content-layout-v2");
});

/* ------------------------------------------------------------------ */
/*  9. SortableBlockEditor still owns useSortable                      */
/* ------------------------------------------------------------------ */

test("SortableBlockEditor — still owns useSortable", () => {
  const source = readFileSync(
    "src/features/valuations/components/workspace/valuation-editor-panel.tsx",
    "utf-8",
  );
  assert.ok(source.includes("useSortable"), "SortableBlockEditor must still call useSortable");
  assert.ok(source.includes("@dnd-kit/sortable"), "panel must still import @dnd-kit/sortable");
});

/* ------------------------------------------------------------------ */
/*  10. ActionStrip/ContentCreationControl not duplicated              */
/* ------------------------------------------------------------------ */

test("BlockCard — does not contain ActionStrip or ContentCreationControl", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("ActionStrip"), "must not reference ActionStrip");
  assert.ok(!source.includes("ContentCreationControl"), "must not reference ContentCreationControl");
});

/* ------------------------------------------------------------------ */
/*  11. No section-specific code in BlockCard                          */
/* ------------------------------------------------------------------ */

test("BlockCard — no section-specific business logic", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("caratula"), "must not reference caratula");
  assert.ok(!source.includes("terreno"), "must not reference terreno");
  assert.ok(!source.includes("apartado"), "must not reference apartado");
  assert.ok(!source.includes("getBlockEditorCapabilities"), "must not compute capabilities");
  assert.ok(!source.includes("getCaratulaBlockKind"), "must not determine block kind");
  assert.ok(!source.includes("isTerrenoSection"), "must not check terreno section");
});

/* ------------------------------------------------------------------ */
/*  12. Carátula uses same card architecture                           */
/* ------------------------------------------------------------------ */

test("SortableBlockEditor — uses BlockCard for all block types including carátula", () => {
  const source = readFileSync(
    "src/features/valuations/components/workspace/valuation-editor-panel.tsx",
    "utf-8",
  );
  // The panel imports BlockCard
  assert.ok(source.includes('from "../editor/block-card"'), "panel imports BlockCard");
  // Find the SortableBlockEditor function body and verify it uses BlockCard
  const fnStart = source.indexOf("function SortableBlockEditor");
  assert.ok(fnStart >= 0, "SortableBlockEditor function exists");
  const fnBody = source.slice(fnStart, fnStart + 12000);
  assert.ok(fnBody.includes("<BlockCard"), "SortableBlockEditor uses BlockCard component");
});

/* ------------------------------------------------------------------ */
/*  13. visibility behavior remains enabled-based                      */
/* ------------------------------------------------------------------ */

test("BlockCard — structuralActions visibility maps to enabled toggle", () => {
  let capturedVisible: boolean | null = null;
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Title",
      structuralActions: {
        itemLabel: "bloque",
        visibility: {
          visible: true,
          onChange: (v) => { capturedVisible = v; },
        },
      },
    }),
  );
  // The visibility toggle renders with the current visible state
  assert.ok(html.includes("Ocultar"), "when visible=true, button says 'Ocultar'");
  // When not visible, it should say "Mostrar"
  const htmlHidden = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Title",
      structuralActions: {
        itemLabel: "bloque",
        visibility: {
          visible: false,
          onChange: () => {},
        },
      },
    }),
  );
  assert.ok(htmlHidden.includes("Mostrar"), "when visible=false, button says 'Mostrar'");
});

/* ------------------------------------------------------------------ */
/*  14. Apartado movement wired to BlockFlowV2                         */
/* ------------------------------------------------------------------ */

test("ApartadoEditor — onMoveUp/onMoveDown wired to BlockFlowV2", () => {
  const source = readFileSync(
    "src/features/valuations/components/workspace/valuation-editor-panel.tsx",
    "utf-8",
  );
  // The apartado render callback now uses real BlockFlowV2 movement
  assert.ok(source.includes('moveBlockFlowV2ApartadoOneStep'), "moveBlockFlowV2ApartadoOneStep imported");
  assert.ok(source.includes('canMoveBlockFlowV2ApartadoOneStep'), "canMoveBlockFlowV2ApartadoOneStep imported");
  // Stubs replaced with real handlers
  assert.ok(!source.includes('onMoveUp={() => {}}'), "onMoveUp stub removed");
  assert.ok(!source.includes('onMoveDown={() => {}}'), "onMoveDown stub removed");
  assert.ok(!source.includes('canMoveUp={false}'), "canMoveUp=false stub removed");
  assert.ok(!source.includes('canMoveDown={false}'), "canMoveDown=false stub removed");
});

/* ------------------------------------------------------------------ */
/*  15. Preview untouched                                              */
/* ------------------------------------------------------------------ */

test("BlockCard — does not reference preview or PDF rendering", () => {
  const source = readFileSync(
    "src/features/valuations/components/editor/block-card.tsx",
    "utf-8",
  );
  assert.ok(!source.includes("preview"), "must not reference preview");
  assert.ok(!source.includes("PDF"), "must not reference PDF");
  assert.ok(!source.includes("print"), "must not reference print");
});
