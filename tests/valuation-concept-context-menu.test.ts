/**
 * The same controls on every concept, block and table of the editor
 * (observations of 2 Nov 2026): the right-click menu of a concept, the menus
 * of the blocks the calculation writes, the rows of the capture tables of the
 * income approach and copying the template blocks the calculation replaces.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { editRows, rowActionsOf } from "../src/features/valuations/components/calculation/calc-table-rows";
import {
  DRAG_TO_ORDER_HINT,
  EMPTY_VALUE_HINT,
  GENERATED_CONCEPT_DELETE_HINT,
  GENERATED_CONCEPT_HINT,
  NO_TEXT_MARKS_HINT,
  READ_ONLY_CONCEPT_HINT,
  SOURCE_FORMAT_HINT,
  conceptContextMenu,
  spacingChoices,
  type ConceptMenuGroup,
  type ConceptMenuTarget,
} from "../src/features/valuations/services/concept-context-menu";
import {
  TEMPLATE_BLOCK_MOVE_REASON,
  blockCopyLockReason,
  duplicateBlock,
  moveBlockToSection,
  structureLockReason,
} from "../src/features/valuations/services/structure-transfer";
import { tableContextMenu, type TableMenuItem } from "../src/features/valuations/services/table-context-menu";
import type { AppSection, Block } from "../src/features/valuations/model";

/* ── The right-click menu of a concept ─────────────────────────────── */

const textConcept: ConceptMenuTarget = {
  generated: false,
  readOnly: false,
  takesTextMarks: true,
  hasValue: true,
  valueFormat: "enabled",
  paragraph: false,
  date: false,
  hasLineBreaks: false,
  canRowStyle: true,
  canDuplicate: true,
  canMoveTo: true,
  canSelect: true,
  canDelete: true,
};

const entry = (groups: ConceptMenuGroup[], action: string) => groups.flat().find((item) => item.action === action)!;

test("a concept's right-click menu offers what its ⋮ menu and the selection do, in the same order everywhere", () => {
  const groups = conceptContextMenu(textConcept);
  assert.deepEqual(groups.map((group) => group.map((item) => item.label)), [
    ["Negrita (N)", "Cursiva (K)", "Subrayado (S)"],
    ["Formato del valor", "Tipo de dato", "Formato de fecha", "Renglón", "Espacio antes", "Espacio después", "Unir líneas"],
    ["Subir concepto", "Bajar concepto", "Duplicar", "Mover a…", "Seleccionar varios…"],
    ["Eliminar concepto…"],
  ]);
  const enabled = groups.flat().filter((item) => !item.disabled).map((item) => item.action);
  assert.deepEqual(enabled, ["bold", "italic", "underline", "value-format", "data-type", "row-style", "spacing-before", "spacing-after", "duplicate", "move-to", "select", "delete"]);
  assert.equal(entry(groups, "delete").destructive, true);
  // What does not apply stays, disabled, with the reason.
  assert.equal(entry(groups, "move-up").hint, DRAG_TO_ORDER_HINT);
  assert.equal(entry(groups, "date-format").disabled, true);
});

test("the concept menu follows the concept: its type, its value, a linked format, its order", () => {
  const number = conceptContextMenu({ ...textConcept, takesTextMarks: false });
  assert.equal(entry(number, "bold").hint, NO_TEXT_MARKS_HINT);
  const empty = conceptContextMenu({ ...textConcept, hasValue: false });
  assert.equal(entry(empty, "italic").hint, EMPTY_VALUE_HINT);
  const linked = conceptContextMenu({ ...textConcept, valueFormat: "source-owned" });
  assert.equal(entry(linked, "value-format").hint, SOURCE_FORMAT_HINT);
  const date = conceptContextMenu({ ...textConcept, date: true, hasLineBreaks: true });
  assert.equal(entry(date, "date-format").disabled, undefined);
  assert.equal(entry(date, "join-lines").disabled, undefined);
  const ordered = conceptContextMenu({ ...textConcept, order: { canMoveUp: false, canMoveDown: true } });
  assert.equal(entry(ordered, "move-up").disabled, true);
  assert.equal(entry(ordered, "move-down").disabled, undefined);
  const readOnly = conceptContextMenu({ ...textConcept, readOnly: true });
  assert.ok(readOnly.flat().every((item) => item.disabled && item.hint === READ_ONLY_CONCEPT_HINT));
});

test("a concept the calculation writes keeps its spacing, row style and selection; its value and place stay the calculation's", () => {
  const groups = conceptContextMenu({ ...textConcept, generated: true, takesTextMarks: false, canDuplicate: false, canMoveTo: false, canDelete: false });
  const enabled = groups.flat().filter((item) => !item.disabled).map((item) => item.action);
  assert.deepEqual(enabled, ["row-style", "spacing-before", "spacing-after", "select"]);
  assert.equal(entry(groups, "value-format").hint, GENERATED_CONCEPT_HINT);
  assert.equal(entry(groups, "duplicate").hint, GENERATED_CONCEPT_HINT);
  assert.equal(entry(groups, "delete").hint, GENERATED_CONCEPT_DELETE_HINT);
  // The same items as any concept, in the same order.
  assert.deepEqual(groups.flat().map((item) => item.action), conceptContextMenu(textConcept).flat().map((item) => item.action));
});

test("the spacing submenus offer up to five blank lines and keep a larger one already set", () => {
  assert.deepEqual(spacingChoices(undefined), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(spacingChoices(8), [0, 1, 2, 3, 4, 5, 8]);
});

/* ── The title menu of a block, with the toolbar's reasons ─────────── */

const blockItem = (groups: TableMenuItem[][], action: string) => groups.flat().find((item) => item.action === action)!;

test("the title menu of a block the calculation writes has every item, disabled with the toolbar's reasons", () => {
  const groups = tableContextMenu("editable", {
    kind: "block",
    canRename: false,
    canTransfer: false,
    hidden: false,
    canHide: true,
    pageBreakBefore: false,
    canPageBreak: true,
    canDelete: false,
    hints: { rename: "El título lo pone el cálculo.", transfer: "Lo escribe el cálculo.", delete: "Si no debe imprimirse, ocúltalo." },
  });
  assert.equal(blockItem(groups, "block-rename").hint, "El título lo pone el cálculo.");
  assert.equal(blockItem(groups, "block-copy").hint, "Lo escribe el cálculo.");
  assert.equal(blockItem(groups, "block-move").hint, "Lo escribe el cálculo.");
  assert.equal(blockItem(groups, "block-delete").hint, "Si no debe imprimirse, ocúltalo.");
  assert.equal(blockItem(groups, "block-hide").disabled, undefined);
  assert.equal(blockItem(groups, "block-page-break").disabled, undefined);
});

test("a template block is copied and duplicated from its menu but not moved", () => {
  const groups = tableContextMenu("editable", {
    kind: "block",
    canRename: true,
    canTransfer: true,
    canMove: false,
    hidden: false,
    canHide: true,
    pageBreakBefore: false,
    canPageBreak: true,
    canDelete: true,
    hints: { move: TEMPLATE_BLOCK_MOVE_REASON },
  });
  assert.equal(blockItem(groups, "block-copy").disabled, undefined);
  assert.equal(blockItem(groups, "block-duplicate").disabled, undefined);
  assert.equal(blockItem(groups, "block-move").hint, TEMPLATE_BLOCK_MOVE_REASON);
});

/* ── Copying the template blocks of the income approach ────────────── */

const block = (id: string): Block => ({
  id,
  title: id.toUpperCase(),
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: [{ id: `${id}-c`, label: "Dato", value: "", enabled: true }],
  apartados: [],
  tables: [],
  images: [],
});
const section = (id: string, blocks: Block[]): AppSection => ({ id, label: "", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks });

test("the income approach's template blocks are copied and duplicated like the conclusion's; what the calculation writes is not", () => {
  const template = block("ingresos-block-1-capitalizacion-de-rentas");
  const generated = block("motor-ingresos-resultado");
  const sections = [section("ingresos", [template, generated]), section("conclusion", [block("conclusion-block-1")]), section("custom-x", [])];
  const ingresos = sections[0];

  assert.equal(blockCopyLockReason(ingresos, template.id), null);
  assert.equal(structureLockReason(ingresos, template.id), TEMPLATE_BLOCK_MOVE_REASON);
  const duplicated = duplicateBlock(sections, "ingresos", template.id);
  assert.equal(duplicated.changed, true);
  const copy = duplicated.sections[0].blocks[1];
  assert.notEqual(copy.id, template.id, "the copy is the appraiser's own block");
  assert.equal(structureLockReason(duplicated.sections[0], copy.id), null);
  assert.equal(moveBlockToSection(sections, "ingresos", template.id, "custom-x").changed, false);

  assert.ok(blockCopyLockReason(ingresos, generated.id));
  assert.equal(duplicateBlock(sections, "ingresos", generated.id).changed, false);
  assert.equal(blockCopyLockReason(sections[1], "conclusion-block-1"), null);
  assert.equal(structureLockReason(sections[1], "conclusion-block-1"), null);
});

/* ── Rows of the capture tables of the income approach ─────────────── */

test("the rows of a capture table are inserted, duplicated, moved and removed from its menu", () => {
  const rows = ["a", "b", "c"];
  const blank = () => "";
  assert.deepEqual(editRows(rows, "insert-above", 1, blank), ["a", "", "b", "c"]);
  assert.deepEqual(editRows(rows, "insert-below", 1, blank), ["a", "b", "", "c"]);
  assert.deepEqual(editRows(rows, "duplicate", 0, blank), ["a", "a", "b", "c"]);
  assert.deepEqual(editRows(rows, "move-up", 0, blank), rows, "the first row stays first");
  assert.deepEqual(editRows(rows, "move-up", 2, blank), ["a", "c", "b"]);
  assert.deepEqual(editRows(rows, "move-down", 0, blank), ["b", "a", "c"]);
  assert.deepEqual(editRows(rows, "delete", 1, blank), ["a", "c"]);
  assert.deepEqual(editRows(["solo"], "delete", 0, blank, 1), ["solo"], "the rentable area keeps one row");

  // A duplicated row is a copy of its own, not the same object.
  const objects = [{ description: "Local", area: "100", unitRent: "150" }];
  const duplicated = editRows(objects, "duplicate", 0, () => ({ description: "", area: "", unitRent: "" }));
  assert.deepEqual(duplicated[1], objects[0]);
  assert.notEqual(duplicated[1], objects[0]);

  let committed: string[] = [];
  const actions = rowActionsOf(rows, blank, (next) => { committed = next; });
  assert.equal(actions.count, 3);
  actions.moveDown(1);
  assert.deepEqual(committed, ["a", "c", "b"]);
  assert.ok(actions.delete);
  assert.equal(rowActionsOf(["solo"], blank, () => undefined, 1).delete, undefined, "no delete for the last required row");
});
