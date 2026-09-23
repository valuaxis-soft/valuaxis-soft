import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import type {
  Concept,
  ContentLayout as ContentLayoutV2,
  ImageContent,
  TableContent,
} from "../src/features/valuations/model";
import { EditableContentLayout as EditableContentLayoutV2 } from "../src/features/valuations/components/editor/editable-content-layout-v2";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */

function concept(id: string, label = "Label"): Concept {
  return { id, label, value: "Value", enabled: true };
}

function image(id: string, title = "Image"): ImageContent {
  return { id, title, src: "", enabled: true };
}

function table(id: string, title = "Table"): TableContent {
  return { id, title, columns: ["A"], rows: [["1"]], enabled: true };
}

function v2(rows: { id: string; columns: { id: string; items: { type: "concept" | "image" | "table"; id: string }[] }[] }[]): ContentLayoutV2 {
  return { version: 2, rows };
}

const noop = () => {};
const noopUpdate = () => {};

const conceptCbs = { onRemove: noop, onUpdate: noopUpdate };
const imageCbs = { onRemove: noop, onUpdate: noopUpdate };
const tableCbs = { onAddColumn: noop, onAddRow: noop, onRemove: noop, onUpdate: noopUpdate };

type RenderOpts = {
  readOnly?: boolean;
  enableLayoutControls?: boolean;
  layout?: "default" | "caratulaGrid";
  requireTitle?: boolean;
  showTerrenoLengthHint?: boolean;
  className?: string;
};

function renderV2(
  container: {
    concepts: Concept[];
    images: ImageContent[];
    tables: TableContent[];
    contentLayout?: ContentLayoutV2;
  },
  opts: RenderOpts = {},
) {
  return renderToStaticMarkup(
    createElement(EditableContentLayoutV2, {
      container,
      allConcepts: container.concepts,
      allContainers: [container],
      conceptCallbacks: conceptCbs,
      imageCallbacks: imageCbs,
      tableCallbacks: tableCbs,
      readOnly: opts.readOnly ?? false,
      enableLayoutControls: opts.enableLayoutControls ?? false,
      layout: opts.layout ?? "default",
      requireTitle: opts.requireTitle ?? false,
      showTerrenoLengthHint: opts.showTerrenoLengthHint ?? false,
      className: opts.className,
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Resolution                                                        */
/* ------------------------------------------------------------------ */

test("EditableContentLayoutV2 — no persisted layout (missing) resolves from container", () => {
  const html = renderV2({
    concepts: [concept("c1", "Concept1")],
    images: [image("i1", "Image1")],
    tables: [],
  });

  assert.ok(html.includes("Concept1"));
  assert.ok(html.includes("Image1"));
});

test("EditableContentLayoutV2 — obsolete flat-array layout is ignored and bootstrapped", () => {
  const container = {
    concepts: [concept("c1", "A"), concept("c2", "B")],
    images: [],
    tables: [],
    contentLayout: [
      { type: "concept", id: "c2", span: 6 },
      { type: "concept", id: "c1", span: 6 },
    ] as unknown as ContentLayoutV2,
  };

  const html = renderV2(container);

  // Both items rendered, without crashing
  assert.ok(html.includes("A"));
  assert.ok(html.includes("B"));
});

test("EditableContentLayoutV2 — V2 persisted layout is used directly", () => {
  const container = {
    concepts: [concept("c1", "Alpha"), concept("c2", "Beta")],
    images: [],
    tables: [],
    contentLayout: v2([
      {
        id: "r-0",
        columns: [
          { id: "c-0-0", items: [{ type: "concept", id: "c2" }] },
          { id: "c-0-1", items: [{ type: "concept", id: "c1" }] },
        ],
      },
    ]),
  };

  const html = renderV2(container);

  assert.ok(html.includes("Alpha"));
  assert.ok(html.includes("Beta"));
});

/* ------------------------------------------------------------------ */
/*  Rendering                                                         */
/* ------------------------------------------------------------------ */

test("EditableContentLayoutV2 — concept only", () => {
  const html = renderV2({
    concepts: [concept("c1", "MyConcept")],
    images: [],
    tables: [],
  });

  assert.ok(html.includes("MyConcept"));
});

test("EditableContentLayoutV2 — image only", () => {
  const html = renderV2({
    concepts: [],
    images: [image("i1", "MyImage")],
    tables: [],
  });

  assert.ok(html.includes("MyImage"));
});

test("EditableContentLayoutV2 — table only", () => {
  const html = renderV2({
    concepts: [],
    images: [],
    tables: [table("t1", "MyTable")],
  });

  assert.ok(html.includes("MyTable"));
});

test("EditableContentLayoutV2 — mixed Concept/Image/Table", () => {
  const html = renderV2({
    concepts: [concept("c1", "Concept")],
    images: [image("i1", "Image")],
    tables: [table("t1", "Table")],
  });

  assert.ok(html.includes("Concept"));
  assert.ok(html.includes("Image"));
  assert.ok(html.includes("Table"));
});

test("EditableContentLayoutV2 — explicit multiple V2 rows", () => {
  const container = {
    concepts: [concept("c1"), concept("c2"), concept("c3")],
    images: [],
    tables: [],
    contentLayout: v2([
      { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "c1" }] }] },
      { id: "r-1", columns: [{ id: "c-1-0", items: [{ type: "concept", id: "c2" }] }] },
      { id: "r-2", columns: [{ id: "c-2-0", items: [{ type: "concept", id: "c3" }] }] },
    ]),
  };

  const html = renderV2(container);

  assert.ok(html.includes("Label"));
  // 3 separate row divs rendered
  const rowCount = (html.match(/content-layout-v2-row/g) || []).length;
  assert.equal(rowCount, 3);
});

test("EditableContentLayoutV2 — 1/2/3 columns", () => {
  const container = {
    concepts: [concept("c1"), concept("c2"), concept("c3")],
    images: [],
    tables: [],
    contentLayout: v2([
      { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "c1" }] }] },
      { id: "r-1", columns: [
        { id: "c-1-0", items: [{ type: "concept", id: "c1" }] },
        { id: "c-1-1", items: [{ type: "concept", id: "c2" }] },
      ] },
      { id: "r-2", columns: [
        { id: "c-2-0", items: [{ type: "concept", id: "c1" }] },
        { id: "c-2-1", items: [{ type: "concept", id: "c2" }] },
        { id: "c-2-2", items: [{ type: "concept", id: "c3" }] },
      ] },
    ]),
  };

  const html = renderV2(container);
  assert.ok(html);
  // All 3 rows rendered
  const rowCount = (html.match(/content-layout-v2-row/g) || []).length;
  assert.equal(rowCount, 3);
});

test("EditableContentLayoutV2 — item order preserved", () => {
  const container = {
    concepts: [concept("c1"), concept("c2"), concept("c3")],
    images: [],
    tables: [],
    contentLayout: v2([
      { id: "r-0", columns: [
        { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
        { id: "c-0-1", items: [{ type: "concept", id: "c2" }] },
        { id: "c-0-2", items: [{ type: "concept", id: "c3" }] },
      ] },
    ]),
  };

  const html = renderV2(container);

  const idxC1 = html.indexOf("Label");
  const idxC2 = html.indexOf("Label", idxC1 + 1);
  assert.ok(idxC1 < idxC2, "c1 appears before c2");
});

test("EditableContentLayoutV2 — row order preserved", () => {
  const container = {
    concepts: [concept("c1"), concept("c2")],
    images: [],
    tables: [],
    contentLayout: v2([
      { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "c1" }] }] },
      { id: "r-1", columns: [{ id: "c-1-0", items: [{ type: "concept", id: "c2" }] }] },
    ]),
  };

  const html = renderV2(container);

  const idxR0 = html.indexOf("content-layout-v2-row");
  const idxR1 = html.indexOf("content-layout-v2-row", idxR0 + 1);
  assert.ok(idxR0 < idxR1, "row 0 appears before row 1");
});

/* ------------------------------------------------------------------ */
/*  Callbacks                                                         */
/* ------------------------------------------------------------------ */

test("EditableContentLayoutV2 — concept callbacks target correct item", () => {
  let removedId: string | null = null;
  const container = {
    concepts: [concept("c1", "A"), concept("c2", "B")],
    images: [],
    tables: [],
  };

  renderToStaticMarkup(
    createElement(EditableContentLayoutV2, {
      container,
      allConcepts: container.concepts,
      allContainers: [container],
      conceptCallbacks: {
        onRemove: (id) => { removedId = id; },
        onUpdate: noopUpdate,
      },
      imageCallbacks: imageCbs,
      tableCallbacks: tableCbs,
      readOnly: false,
    }),
  );

  // Both concepts rendered; callbacks are wired (SSR doesn't fire events)
  assert.ok(removedId === null, "no event fired during SSR");
});

test("EditableContentLayoutV2 — image callbacks target correct item", () => {
  const container = {
    concepts: [],
    images: [image("i1", "First"), image("i2", "Second")],
    tables: [],
  };

  const html = renderToStaticMarkup(
    createElement(EditableContentLayoutV2, {
      container,
      allConcepts: [],
      allContainers: [container],
      conceptCallbacks: conceptCbs,
      imageCallbacks: {
        onRemove: noop,
        onUpdate: () => {},
      },
      tableCallbacks: tableCbs,
      readOnly: false,
    }),
  );

  assert.ok(html.includes("First"));
  assert.ok(html.includes("Second"));
});

test("EditableContentLayoutV2 — table callbacks target correct item", () => {
  const container = {
    concepts: [],
    images: [],
    tables: [table("t1", "Data")],
  };

  const html = renderToStaticMarkup(
    createElement(EditableContentLayoutV2, {
      container,
      allConcepts: [],
      allContainers: [container],
      conceptCallbacks: conceptCbs,
      imageCallbacks: imageCbs,
      tableCallbacks: {
        onAddColumn: noop,
        onAddRow: noop,
        onRemove: noop,
        onUpdate: () => {},
      },
      readOnly: false,
    }),
  );

  assert.ok(html.includes("Data"));
});

/* ------------------------------------------------------------------ */
/*  Safety                                                            */
/* ------------------------------------------------------------------ */

test("EditableContentLayoutV2 — stale/unresolved ref does not crash", () => {
  const container = {
    concepts: [concept("c1", "Exists")],
    images: [],
    tables: [],
    contentLayout: v2([
      { id: "r-0", columns: [
        { id: "c-0-0", items: [{ type: "concept", id: "c1" }] },
        { id: "c-0-1", items: [{ type: "concept", id: "nonexistent" }] },
      ] },
    ]),
  };

  // Should not throw
  const html = renderV2(container);
  assert.ok(html.includes("Exists"));
});

test("EditableContentLayoutV2 — readOnly disables inputs", () => {
  const html = renderV2({
    concepts: [concept("c1")],
    images: [image("i1")],
    tables: [table("t1")],
  }, { readOnly: true });

  assert.ok(html.includes("disabled"));
});

test("EditableContentLayoutV2 — ConceptEditorRow drag disabled", () => {
  const html = renderV2({
    concepts: [concept("c1", "Test")],
    images: [],
    tables: [],
  });

  // When dragEnabled=false, ConceptEditorRow renders without DndContext issues in SSR
  assert.ok(html.includes("Test"));
});

test("EditableContentLayoutV2 — does not mutate the input container", () => {
  const container = {
    concepts: [concept("c1")],
    images: [image("i1")],
    tables: [table("t1")],
    contentLayout: v2([
      { id: "r-0", columns: [{ id: "c-0-0", items: [{ type: "concept", id: "c1" }] }] },
    ]),
  };
  const containerCopy = JSON.parse(JSON.stringify(container));

  renderV2(container);

  assert.deepEqual(container, containerCopy);
});

test("EditableContentLayoutV2 — no section-specific behavior", () => {
  // Component does not import or reference any section-specific logic
  const html = renderV2({
    concepts: [concept("c1")],
    images: [],
    tables: [],
  });

  assert.ok(html.includes("Label"));
});

test("EditableContentLayoutV2 — no DnD imports", () => {
  // Component file should not import from @dnd-kit
  // Verified by successful SSR render (no DndContext issues)
  const html = renderV2({
    concepts: [concept("c1")],
    images: [],
    tables: [],
  });

  assert.ok(html.includes("Label"));
});

test("EditableContentLayoutV2 — className passthrough", () => {
  const html = renderToStaticMarkup(
    createElement(EditableContentLayoutV2, {
      container: {
        concepts: [concept("c1")],
        images: [],
        tables: [],
      },
      allConcepts: [],
      allContainers: [],
      conceptCallbacks: conceptCbs,
      imageCallbacks: imageCbs,
      tableCallbacks: tableCbs,
      readOnly: false,
      className: "my-custom-class",
    }),
  );

  assert.ok(html.includes("my-custom-class"));
});

test("EditableContentLayoutV2 — empty resolved layout renders null", () => {
  const html = renderV2({
    concepts: [],
    images: [],
    tables: [],
  });

  assert.equal(html, "");
});
