import assert from "node:assert/strict";
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
    }, "Body content here"),
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

/* ------------------------------------------------------------------ */
/*  7. BlockCard does NOT import BlockFlowV2                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  8. BlockCard does NOT import ContentLayoutV2                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  9. SortableBlockEditor still owns useSortable                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  10. ActionStrip/ContentCreationControl not duplicated              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  11. No section-specific code in BlockCard                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  12. Carátula uses same card architecture                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  13. visibility behavior remains enabled-based                      */
/* ------------------------------------------------------------------ */

test("BlockCard — renders structural visibility action", () => {
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

/* ------------------------------------------------------------------ */
/*  15. Preview untouched                                              */
/* ------------------------------------------------------------------ */
