/**
 * Observations of 27 Oct 2026 on the editor: undo reaches every cell of a
 * configurable table and says where the change was; every section but the
 * required ones is deleted (a registry section is kept removed, and restored);
 * a block whose content is all hidden prints nothing and takes no number; the
 * projection window browses every section.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { externalPreviewNavigation } from "../src/features/valuations/components/workspace/external-preview-sync";
import { changedTableCell, locateEditorChange } from "../src/features/valuations/components/workspace/model/editor-history";
import { resequenceSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import type { AppSection, Apartado, Block, TableContent } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { blockContentHidden } from "../src/features/valuations/services/hidden-content";
import {
  canRemoveSection,
  listedSections,
  removeSection,
  restoreSection,
  withListedOrder,
} from "../src/features/valuations/services/section-edit-operations";
import { ensureTableV2, type TableV2 } from "../src/features/valuations/services/table";

/* ------------------------------------------------------------------ */
/*  Undo                                                               */
/* ------------------------------------------------------------------ */

function table(rows: string[][]): TableContent {
  return ensureTableV2({ id: "info", title: "Info. construcciones", columns: ["Tipo", "Sup."], rows }) as unknown as TableContent;
}

function setCell(source: TableContent, rowIndex: number, columnIndex: number, value: string): TableContent {
  const v2 = ensureTableV2(source);
  const columnId = v2.columns[columnIndex].id;
  const rows = v2.rows.map((row, index) => (index === rowIndex ? { ...row, cells: { ...row.cells, [columnId]: { kind: "value" as const, value } } } : row));
  return { ...v2, rows } as TableV2 as unknown as TableContent;
}

test("a table edit is known by its one cell; a change of rows or of several cells is not", () => {
  const before = table([["T-1", "120"], ["T-2", ""]]);
  const v2 = ensureTableV2(before);
  const after = setCell(before, 1, 1, "85");
  assert.deepEqual(changedTableCell(before, after), { rowId: v2.rows[1].id, columnId: v2.columns[1].id });
  assert.equal(changedTableCell(before, before), null, "nothing changed");
  assert.equal(changedTableCell(before, setCell(after, 0, 0, "T-9")), null, "two cells");
  assert.equal(changedTableCell(before, table([["T-1", "120"]])), null, "a row less");
});

function sectionWith(tables: TableContent[], id = "construccion"): AppSection {
  return {
    id, label: "IV", title: "INF. CONSTRUCCION", sourceFile: "", enabled: true, required: false,
    blocks: [{
      id: "b1", title: "Descripción", sectionLabel: "IV", enabled: true, required: false,
      concepts: [{ id: "c1", label: "Uso actual", value: "Casa" }], images: [], tables: [],
      apartados: [{ id: "ap", title: "Tipos", enabled: true, concepts: [], images: [], tables }],
    }],
  } as AppSection;
}

test("an undo that knows no better finds the cell, the concept or the section the change was in", () => {
  const before = table([["T-1", "120"]]);
  const after = setCell(before, 0, 1, "130");
  const v2 = ensureTableV2(before);
  const other = { ...sectionWith([]), id: "terreno", title: "TERRENO" };
  assert.deepEqual(
    locateEditorChange([other, sectionWith([before])], [other, sectionWith([after])]),
    { sectionId: "construccion", blockId: "b1", tableId: "info", rowId: v2.rows[0].id, columnId: v2.columns[1].id },
  );
  const renamed = sectionWith([before]);
  const changedConcept = { ...renamed, blocks: [{ ...renamed.blocks[0], concepts: [{ id: "c1", label: "Uso actual", value: "Oficinas" }] }] };
  assert.deepEqual(locateEditorChange([renamed], [changedConcept]), { sectionId: "construccion", blockId: "b1", conceptId: "c1" });
  assert.equal(locateEditorChange([renamed], [renamed]), null, "nothing changed");
  assert.deepEqual(locateEditorChange([other, renamed], [other]), { sectionId: "terreno" }, "a section went away: its neighbor");
});

/* ------------------------------------------------------------------ */
/*  Deleting and restoring sections                                    */
/* ------------------------------------------------------------------ */

test("any section but the required ones is deleted; a registry one stays, removed and hidden, and comes back", () => {
  const sections = createInitialSections();
  assert.equal(canRemoveSection(sections.find((section) => section.id === "caratula")!), false);
  assert.equal(canRemoveSection(sections.find((section) => section.id === "conclusiones")!), false);
  assert.equal(removeSection(sections, "caratula"), sections, "the carátula is required");

  const removed = removeSection(sections, "fotosSujeto");
  const fotos = removed.find((section) => section.id === "fotosSujeto")!;
  assert.equal(fotos.removed, true);
  assert.equal(fotos.enabled, false, "it does not print");
  assert.equal(removed.length, sections.length, "kept in the document");
  assert.equal(listedSections(removed).some((section) => section.id === "fotosSujeto"), false, "out of the tab strip");
  assert.equal(removeSection(removed, "fotosSujeto"), removed, "deleted once");

  const restored = restoreSection(removed, "fotosSujeto").find((section) => section.id === "fotosSujeto")!;
  assert.equal(restored.removed, undefined);
  assert.equal(restored.enabled, true);
});

test("reordering the tab strip keeps each deleted section after the one it followed", () => {
  const sections = removeSection(createInitialSections(), "ingresos");
  const listed = listedSections(sections);
  const conclusion = listed.find((section) => section.id === "conclusiones")!;
  const fotosIndex = listed.findIndex((section) => section.id === "fotosSujeto");
  const reordered = listed.filter((section) => section.id !== "conclusiones");
  reordered.splice(fotosIndex, 0, conclusion);
  const next = withListedOrder(sections, reordered);
  const ids = next.map((section) => section.id);
  assert.equal(next.length, sections.length, "no section lost");
  assert.equal(ids.indexOf("ingresos"), ids.indexOf("mercadoRentas") + 1, "the deleted Ingresos stays after Mercado de rentas");
  assert.equal(ids.indexOf("conclusiones"), ids.indexOf("fotosSujeto") - 1, "Conclusión before Fotografías");
  assert.equal(withListedOrder(createInitialSections(), reordered), reordered, "nothing deleted: the strip's order as it is");
});

/* ------------------------------------------------------------------ */
/*  Hidden content                                                     */
/* ------------------------------------------------------------------ */

function block(apartados: Apartado[], extra: Partial<Block> = {}): Block {
  return {
    id: "b", title: "ELEMENTOS DE CONSTRUCCIÓN", sectionLabel: "V", enabled: true, required: false,
    concepts: [], images: [], tables: [], apartados, ...extra,
  };
}
const apartado = (id: string, enabled: boolean): Apartado => ({
  id, title: id.toUpperCase(), enabled, concepts: [{ id: `${id}-c`, label: "Cimentación", value: "Zapatas" }], images: [], tables: [],
});

test("a block whose apartados are all hidden prints nothing, not even its title, and takes no number", () => {
  const hidden = block([apartado("obra", false), apartado("acabados", false)]);
  assert.equal(blockContentHidden(hidden), true);
  assert.deepEqual(documentBlockFlowItems(hidden), []);

  const oneShown = block([apartado("obra", false), apartado("acabados", true)]);
  assert.equal(blockContentHidden(oneShown), false);
  assert.equal(documentBlockFlowItems(oneShown)[0].id, "b:title");

  // A block with nothing in it is a heading: its title prints.
  assert.equal(blockContentHidden(block([])), false);
  assert.deepEqual(documentBlockFlowItems(block([])).map((item) => item.id), ["b:title"]);

  const section = (blocks: Block[]) => ({ id: "construccion", label: "", title: "INF. CONSTRUCCION", sourceFile: "", enabled: true, required: false, blocks }) as AppSection;
  const [numbered] = resequenceSections([section([{ ...oneShown, id: "b1" }, { ...hidden, id: "b2" }, { ...oneShown, id: "b3" }])]);
  assert.deepEqual(numbered.blocks.map((item) => item.sectionLabel), ["I", "", "II"], "the hidden one is skipped");
});

/* ------------------------------------------------------------------ */
/*  Projection window                                                  */
/* ------------------------------------------------------------------ */

test("the projection window asks the editor for the previous or next section, and nothing else is read as that", () => {
  assert.equal(externalPreviewNavigation({ type: "preview-navigate", direction: 1 }), 1);
  assert.equal(externalPreviewNavigation({ type: "preview-navigate", direction: -1 }), -1);
  for (const message of [null, "x", { type: "preview-navigate", direction: 2 }, { type: "preview-ready" }]) {
    assert.equal(externalPreviewNavigation(message), null);
  }
});
