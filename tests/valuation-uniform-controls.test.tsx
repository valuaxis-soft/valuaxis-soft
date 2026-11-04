import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BlockCard } from "../src/features/valuations/components/editor/block-card";
import {
  ADD_BLOCK_LABEL,
  BLOCK_TOOLBAR_CONTROLS,
  GENERATED_BLOCK_REASON,
  blockToolbarControls,
  blockToolbarLocks,
  blockToolbarState,
  type BlockToolbarKind,
} from "../src/features/valuations/components/editor/block-toolbar";
import { DeleteConfirmDialog, deleteConfirmation } from "../src/features/valuations/components/editor/delete-confirm";
import { createConcept } from "../src/features/valuations/components/workspace/model/content-factories";
import { editorSnapshotEquals } from "../src/features/valuations/components/workspace/model/editor-history";
import { withDuplicatedConcepts } from "../src/features/valuations/components/workspace/model/section-content";
import { addCustomUnitTo, removeCustomUnitFrom, renameCustomUnitIn } from "../src/features/firm/custom-units";
import type { Block, Concept } from "../src/features/valuations/model";
import { CONCEPT_CREATION_OPTIONS, conceptDataTypePatch, conceptDataTypeValue } from "../src/features/valuations/services/concept-types";
import { initialMeta } from "../src/features/valuations/services/valuation-constants";
import { createInitialSections } from "../src/features/valuations/sections";
import { caratulaFromValuation } from "../src/features/valuations/components/workspace/model/initial-hydration";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

/* ------------------------------------------------------------------ */
/*  1. One toolbar for every block                                    */
/* ------------------------------------------------------------------ */

const KINDS: BlockToolbarKind[] = ["content", "caratula-block", "caratula-fixed", "generated"];

test("every kind of block offers the same controls, in the same order", () => {
  for (const kind of KINDS) {
    const state = blockToolbarState({ kind });
    assert.deepEqual(blockToolbarControls(state), [...BLOCK_TOOLBAR_CONTROLS], kind);
    assert.deepEqual(Object.keys(state), [...BLOCK_TOOLBAR_CONTROLS], `${kind}: same keys in the same order`);
  }
});

test("a block the calculation writes keeps its controls disabled with the reason, and the ones that apply enabled", () => {
  const state = blockToolbarState({ kind: "generated" });
  assert.equal(state.visibility.enabled, true);
  assert.equal(state.move.enabled, true);
  assert.equal(state.pageBreak.enabled, true);
  assert.equal(state.alignment.enabled, true);
  assert.equal(state.add.enabled, false);
  assert.equal(state.add.reason, GENERATED_BLOCK_REASON);
  assert.equal(state.delete.enabled, false);
  assert.ok(state.delete.reason?.includes("ocúltalo"));
  assert.equal(state.transfer.enabled, false);
  const locks = blockToolbarLocks(state);
  assert.deepEqual(Object.keys(locks), ["transfer", "add", "subblock", "delete"]);
});

test("a content block locked for transfer says why on the ··· menu only", () => {
  const state = blockToolbarState({ kind: "content", transferLock: "Lo escribe el cálculo." });
  assert.equal(state.transfer.reason, "Lo escribe el cálculo.");
  assert.ok(BLOCK_TOOLBAR_CONTROLS.filter((control) => control !== "transfer").every((control) => state[control].enabled));
});

test("read only disables every control with one reason", () => {
  const state = blockToolbarState({ kind: "content", readOnly: true });
  assert.ok(BLOCK_TOOLBAR_CONTROLS.every((control) => !state[control].enabled && state[control].reason));
});

test("the block card prints the disabled controls with their reason as tooltip", () => {
  const html = renderToStaticMarkup(
    createElement(BlockCard, {
      cardRef: () => {},
      title: "Enfoque físico",
      structuralActions: {
        itemLabel: "bloque",
        locks: { delete: "Lo escribe el cálculo." },
        move: { canMoveUp: true, canMoveDown: true, onMoveUp: () => {}, onMoveDown: () => {} },
        visibility: { visible: true, onChange: () => {} },
        pageBreak: { value: "auto", onChange: () => {} },
        onConceptPresentationChange: () => {},
        deleteAction: { onDelete: () => {} },
      },
    }),
  );
  const order = [...html.matchAll(/data-structural-action="([A-Za-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ["move-up", "move-down", "visibility", "pageBreak", "alignment", "delete"]);
  assert.match(html, /data-structural-action="delete"[^>]*disabled/);
  assert.ok(html.includes('title="Lo escribe el cálculo."'));
});

/* ------------------------------------------------------------------ */
/*  2. Deleting asks first                                             */
/* ------------------------------------------------------------------ */

test("the confirmation names what goes and that it can be undone", () => {
  const block = deleteConfirmation("block", "Datos del bien");
  assert.equal(block.title, "¿Eliminar el bloque «Datos del bien»?");
  assert.equal(block.confirmLabel, "Eliminar bloque");
  assert.ok(block.description.includes("Deshacer"));
  assert.equal(deleteConfirmation("subblock").title, "¿Eliminar el subbloque?");
  assert.equal(deleteConfirmation("concepts", undefined, 3).title, "¿Eliminar 3 conceptos?");
  assert.equal(deleteConfirmation("concept", "Calle").confirmLabel, "Eliminar concepto");
});

test("the dialog is a component that takes the confirmation", () => {
  // Its content lives in a portal, which the server does not render: the wording is what is checked above.
  assert.equal(typeof DeleteConfirmDialog, "function");
});

/* ------------------------------------------------------------------ */
/*  3. "+ Bloque" creates a block                                      */
/* ------------------------------------------------------------------ */

test("the button that adds a block says so", () => {
  assert.equal(ADD_BLOCK_LABEL, "Bloque");
});

/* ------------------------------------------------------------------ */
/*  4. Concept types                                                   */
/* ------------------------------------------------------------------ */

test("+ Concepto offers number, currency, percent and list besides the texts", () => {
  const labels = CONCEPT_CREATION_OPTIONS.map((option) => option.label);
  for (const expected of ["Texto", "Texto largo", "Párrafo", "Número", "Moneda", "Porcentaje", "Fecha", "Teléfono", "Url", "Lista"]) {
    assert.ok(labels.includes(expected), expected);
  }
});

test("a percentage is a number in %, a list starts with no options", () => {
  const percent = createConcept(undefined, "percent");
  assert.equal(percent.type, "number");
  assert.equal(percent.valueFormat, "percent");
  assert.equal(percent.label, "Porcentaje");
  const list = createConcept(undefined, "list");
  assert.equal(list.type, "list");
  assert.deepEqual(list.options, []);
  assert.equal(createConcept(undefined, "currency").type, "currency");
});

test("the type of a concept changes from its menu, keeping the value", () => {
  const text: Concept = { id: "c", label: "Vida útil", value: "30", type: "text" };
  assert.equal(conceptDataTypeValue(text), "text");
  const asPercent = conceptDataTypePatch(text, "percent");
  assert.deepEqual(asPercent, { type: "number", valueFormat: "percent", options: undefined });
  assert.equal(conceptDataTypeValue({ ...text, ...asPercent }), "percent");
  const asList = conceptDataTypePatch(text, "list");
  assert.equal(asList.type, "list");
  assert.deepEqual(asList.options, []);
  assert.deepEqual(conceptDataTypePatch(text, "nope"), {});
});

/* ------------------------------------------------------------------ */
/*  5. Duplicating a concept                                           */
/* ------------------------------------------------------------------ */

test("a duplicated concept goes right after its original, in the list and in the layout", () => {
  const a: Concept = { id: "a", label: "A", value: "1" };
  const b: Concept = { id: "b", label: "B", value: "2" };
  const block: Block = {
    id: "blk", title: "T", sectionLabel: "", enabled: true, required: false,
    concepts: [a, b], apartados: [], tables: [], images: [],
    contentLayout: { version: 2, rows: [{ id: "r1", columns: [{ id: "ca", items: [{ type: "concept", id: "a" }] }, { id: "cb", items: [{ type: "concept", id: "b" }] }] }] },
  };
  const copy: Concept = { id: "a2", label: "A", value: "1" };
  const next = withDuplicatedConcepts(block, new Map([["a", copy]]));
  assert.deepEqual(next.concepts.map((concept) => concept.id), ["a", "a2", "b"]);
  assert.deepEqual(next.contentLayout?.rows[0].columns.map((column) => column.items[0].id), ["a", "a2", "b"]);
});

/* ------------------------------------------------------------------ */
/*  6. "Cambios pendientes" clears after undoing back to what was saved */
/* ------------------------------------------------------------------ */

test("two snapshots with the same content are equal even when rebuilt", () => {
  const sections = createInitialSections();
  const meta = { ...initialMeta };
  const caratula = caratulaFromValuation(null, meta, sections);
  const saved = { caratula: { ...caratula }, meta: { ...meta }, sections: structuredClone(sections) };
  assert.equal(editorSnapshotEquals({ caratula, meta, sections }, saved), true);
  assert.equal(editorSnapshotEquals({ caratula: { ...caratula, folio: "X-1" }, meta, sections }, saved), false);
});

/* ------------------------------------------------------------------ */
/*  7. Units of the firm                                               */
/* ------------------------------------------------------------------ */

test("a firm unit is renamed or removed from the list", () => {
  const units = addCustomUnitTo(addCustomUnitTo([], "piezas").units, "km3").units;
  const renamed = renameCustomUnitIn(units, "KM3", "lotes");
  assert.deepEqual(renamed, { units: ["piezas", "lotes"], renamed: true });
  assert.equal(renameCustomUnitIn(units, "km3", "Piezas").renamed, false, "a name another unit has");
  assert.equal(renameCustomUnitIn(units, "nope", "x").renamed, false);
  assert.deepEqual(removeCustomUnitFrom(units, "Piezas"), { units: ["km3"], removed: true });
  assert.equal(removeCustomUnitFrom(units, "nope").removed, false);
});
