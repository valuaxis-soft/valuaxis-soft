import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado, AppSection, Block, Concept, ContentLayout } from "../src/features/valuations/model";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import { contentDropSourceFromData, planApartadoBoundarySlots } from "../src/features/valuations/services/content-drop";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import { contentMoveRulesForSection } from "../src/features/valuations/services/content-move-rules";
import {
  apartadoDestinations,
  conceptDestinations,
  moveApartadoTo,
  moveConceptGroupToDrop,
  moveConceptsTo,
  transferPositions,
} from "../src/features/valuations/services/structure-transfer";
import { scrollTopToReveal } from "../src/features/valuations/components/workspace/model/editor-focus-reveal";
import { pickPlaceAnchor, scrollTopForAnchor } from "../src/features/valuations/components/workspace/model/editor-place";

/* ------------------------------------------------------------------ */
/*  Fixtures (invented content)                                        */
/* ------------------------------------------------------------------ */

const concept = (id: string): Concept => ({ id, label: `Concepto ${id}`, value: "", enabled: true, labelKey: `${id}-label`, valueKey: `${id}-value` });

function layout(rows: string[][], prefix = "r"): ContentLayout {
  return {
    version: 2,
    rows: rows.map((ids, rowIndex) => ({
      id: `${prefix}-${rowIndex}`,
      columns: ids.map((id, columnIndex) => ({ id: `${prefix}c-${rowIndex}-${columnIndex}`, items: [{ type: "concept" as const, id }] })),
    })),
  };
}

const apartado = (id: string, rows: string[][] = []): Apartado =>
  ({ id, title: `Subbloque ${id}`, enabled: true, concepts: rows.flat().map(concept), tables: [], images: [], contentLayout: layout(rows, id) });

const block = (id: string, rows: string[][] = [], apartados: Apartado[] = []): Block => ({
  id,
  title: `Bloque ${id}`,
  sectionLabel: "",
  enabled: true,
  required: false,
  concepts: rows.flat().map(concept),
  apartados,
  tables: [],
  images: [],
  contentLayout: layout(rows),
});

const section = (id: string, blocks: Block[]): AppSection => ({ id, label: "", title: id, sourceFile: "", enabled: true, required: false, blocks });

const findBlock = (sections: AppSection[], blockId: string) => sections.flatMap((item) => item.blocks).find((item) => item.id === blockId)!;
const rowsOf = (container: Block | Apartado) => resolveContentLayout(container).rows.map((row) => row.columns.map((column) => column.items[0].id));
/** The Block as it is shown: content rows (their concepts) and Apartados, in flow order. */
const flowOf = (target: Block) => {
  const rows = new Map(resolveContentLayout(target).rows.map((row) => [row.id, row.columns.map((column) => column.items[0].id).join("+")]));
  return resolveBlockFlowV2(target)!.rows.map((row) => row.items.map((item) => (item.type === "apartado" ? `[${item.apartadoId}]` : rows.get(item.rowId))).join(" | "));
};

/* ------------------------------------------------------------------ */
/*  V5.6-28 — "Mover a…" with a position                               */
/* ------------------------------------------------------------------ */

test("concepts moved before an apartado land above it, not under the apartados at the end", () => {
  const sections = [section("custom-x", [
    block("origen", [["a"], ["b"], ["c"]]),
    block("destino", [["x"]], [apartado("ap", [["y"]])]),
  ])];
  const result = moveConceptsTo(
    sections,
    { sectionId: "custom-x", blockId: "origen" },
    ["c", "a"],
    { sectionId: "custom-x", blockId: "destino" },
    { placement: "before", anchor: { type: "apartado", apartadoId: "ap" } },
  );
  assert.equal(result.changed, true);
  assert.deepEqual(flowOf(findBlock(result.sections, "destino")), ["x", "a", "c", "[ap]"]);
  assert.deepEqual(rowsOf(findBlock(result.sections, "destino")), [["x"], ["a"], ["c"]], "the layout keeps the order shown");
  assert.deepEqual(rowsOf(findBlock(result.sections, "origen")), [["b"]]);
});

test("without a position the concepts still go to the end, under the apartados", () => {
  const sections = [section("custom-x", [block("origen", [["a"]]), block("destino", [["x"]], [apartado("ap", [["y"]])])])];
  const result = moveConceptsTo(sections, { sectionId: "custom-x", blockId: "origen" }, ["a"], { sectionId: "custom-x", blockId: "destino" });
  assert.deepEqual(flowOf(findBlock(result.sections, "destino")), ["x", "[ap]", "a"]);
});

test("concepts change place inside their own block with a position, and still not without one", () => {
  const sections = [section("custom-x", [block("uno", [["a"], ["b", "c"], ["d"]], [apartado("ap")])])];
  const source = { sectionId: "custom-x", blockId: "uno" };
  assert.equal(moveConceptsTo(sections, source, ["d"], source).changed, false);

  const first = moveConceptsTo(sections, source, ["d"], source, { placement: "start" });
  assert.deepEqual(flowOf(findBlock(first.sections, "uno")), ["d", "a", "b+c", "[ap]"]);

  const after = moveConceptsTo(sections, source, ["a"], source, { placement: "after", anchor: { type: "row", rowId: "r-1" } });
  assert.deepEqual(flowOf(findBlock(after.sections, "uno")), ["b+c", "a", "d", "[ap]"]);
});

test("concepts go before a row of an apartado, inside it", () => {
  const sections = [section("custom-x", [block("uno", [["a"]], [apartado("ap", [["y"], ["z"]])])])];
  const result = moveConceptsTo(
    sections,
    { sectionId: "custom-x", blockId: "uno" },
    ["a"],
    { sectionId: "custom-x", blockId: "uno", apartadoId: "ap" },
    { placement: "before", anchor: { type: "row", rowId: "ap-1" } },
  );
  assert.deepEqual(rowsOf(findBlock(result.sections, "uno").apartados[0]), [["y"], ["a"], ["z"]]);
});

test("the picker offers the place before each row and apartado, and the end; what moves is no place", () => {
  const sections = [section("custom-x", [block("uno", [["a"], ["b", "c"]], [apartado("ap", [["y"]])])])];
  const positions = transferPositions(sections, { sectionId: "custom-x", blockId: "uno" }, { conceptIds: ["a", "b"] });
  assert.deepEqual(positions.map((option) => option.label), [
    "Antes de «Concepto c»",
    "Antes del subbloque «Subbloque ap»",
    "Al final",
  ]);
  assert.deepEqual(positions[1].position, { placement: "before", anchor: { type: "apartado", apartadoId: "ap" } });

  const forApartado = transferPositions(sections, { sectionId: "custom-x", blockId: "uno" }, { apartadoId: "ap" });
  assert.deepEqual(forApartado.map((option) => option.label), ["Antes de «Concepto a»", "Antes de «Concepto b · Concepto c»", "Al final"]);
});

test("the concepts' own block and the apartado's own block are offered, marked as where they are", () => {
  const sections = [section("custom-x", [block("uno", [["a"]], [apartado("ap")]), block("dos")])];
  const forConcepts = conceptDestinations(sections, { sectionId: "custom-x", blockId: "uno" });
  assert.deepEqual(forConcepts.map((item) => [item.address.blockId, item.address.apartadoId ?? null, Boolean(item.here)]), [
    ["uno", null, true],
    ["uno", "ap", false],
    ["dos", null, false],
  ]);
  const forApartado = apartadoDestinations(sections, { sectionId: "custom-x", blockId: "uno" });
  assert.deepEqual(forApartado.map((item) => [item.address.blockId, Boolean(item.here)]), [["uno", true], ["dos", false]]);
});

test("an apartado moves before a row of another block, or to another place of its own", () => {
  const sections = [section("custom-x", [
    block("uno", [["a"]], [apartado("ap-1"), apartado("ap-2")]),
    block("dos", [["x"], ["y"]]),
  ])];
  const across = moveApartadoTo(
    sections,
    { sectionId: "custom-x", blockId: "uno", apartadoId: "ap-2" },
    { sectionId: "custom-x", blockId: "dos" },
    { placement: "before", anchor: { type: "row", rowId: "r-1" } },
  );
  assert.equal(across.changed, true);
  assert.deepEqual(flowOf(findBlock(across.sections, "dos")), ["x", "[ap-2]", "y"]);
  assert.deepEqual(flowOf(findBlock(across.sections, "uno")), ["a", "[ap-1]"]);

  const source = { sectionId: "custom-x", blockId: "uno", apartadoId: "ap-2" };
  assert.equal(moveApartadoTo(sections, source, { sectionId: "custom-x", blockId: "uno" }).changed, false, "same block needs a position");
  const inside = moveApartadoTo(sections, source, { sectionId: "custom-x", blockId: "uno" }, { placement: "start" });
  assert.deepEqual(flowOf(findBlock(inside.sections, "uno")), ["[ap-2]", "a", "[ap-1]"]);
  assert.deepEqual(findBlock(inside.sections, "uno").apartados.find((item) => item.id === "ap-2")?.title, "Subbloque ap-2", "the same apartado, with its ids");
});

/* ------------------------------------------------------------------ */
/*  V5.6-05 — dragging one of the chosen concepts takes them all       */
/* ------------------------------------------------------------------ */

test("the drag data carries the selection only when the dragged concept is part of it", () => {
  const base = { kind: "content-column", container: { kind: "block", blockId: "uno" }, columnId: "c", itemType: "concept", itemId: "b" };
  assert.deepEqual(contentDropSourceFromData({ ...base, groupIds: ["a", "b", "d"] })?.groupIds, ["a", "b", "d"]);
  assert.equal(contentDropSourceFromData({ ...base, groupIds: ["a", "d"] })?.groupIds, undefined);
  assert.equal(contentDropSourceFromData({ ...base, groupIds: ["b"] })?.groupIds, undefined);
});

test("the chosen concepts follow the dragged one to another block, in their order and around it", () => {
  const sections = [section("custom-x", [
    block("origen", [["a"], ["b", "c"], ["d"], ["e"]]),
    block("destino", [["x"], ["y"]]),
  ])];
  const rules = contentMoveRulesForSection(sections[0]);
  // "c" is dragged under "x"; "a", "c" and "e" are chosen, "b" and "d" are not.
  const result = moveConceptGroupToDrop(
    sections,
    "custom-x",
    { container: { kind: "block", blockId: "origen" }, itemType: "concept", itemId: "c", groupIds: ["e", "c", "a"] },
    ["e", "c", "a"],
    { kind: "row", container: { kind: "block", blockId: "destino" }, rowId: "r-0", placement: "below" },
    rules,
  );
  assert.equal(result.changed, true);
  assert.deepEqual(flowOf(findBlock(result.sections, "destino")), ["x", "a", "c", "e", "y"]);
  assert.deepEqual(rowsOf(findBlock(result.sections, "origen")), [["b"], ["d"]]);
  assert.deepEqual(findBlock(result.sections, "destino").concepts.map((item) => item.id).sort(), ["a", "c", "e", "x", "y"]);
});

test("the chosen concepts go into an apartado together", () => {
  const sections = [section("custom-x", [block("uno", [["a"], ["b"], ["c"]], [apartado("ap", [["y"]])])])];
  const rules = contentMoveRulesForSection(sections[0]);
  const result = moveConceptGroupToDrop(
    sections,
    "custom-x",
    { container: { kind: "block", blockId: "uno" }, itemType: "concept", itemId: "a", groupIds: ["a", "c"] },
    ["a", "c"],
    { kind: "apartado-inside", container: { kind: "apartado", blockId: "uno", apartadoId: "ap" } },
    rules,
  );
  assert.deepEqual(rowsOf(findBlock(result.sections, "uno").apartados[0]), [["y"], ["a"], ["c"]]);
  assert.deepEqual(rowsOf(findBlock(result.sections, "uno")), [["b"]]);
});

test("chosen concepts reorder inside their own block when one of them is dragged", () => {
  const sections = [section("custom-x", [block("uno", [["a"], ["b"], ["c"], ["d"]])])];
  const rules = contentMoveRulesForSection(sections[0]);
  const result = moveConceptGroupToDrop(
    sections,
    "custom-x",
    { container: { kind: "block", blockId: "uno" }, itemType: "concept", itemId: "a", groupIds: ["a", "b"] },
    ["a", "b"],
    { kind: "row", container: { kind: "block", blockId: "uno" }, rowId: "r-3", placement: "below" },
    rules,
  );
  assert.deepEqual(rowsOf(findBlock(result.sections, "uno")), [["c"], ["d"], ["a"], ["b"]]);
});

/* ------------------------------------------------------------------ */
/*  V5.2-04 / V5.6-21 — the lines an apartado is dropped on            */
/* ------------------------------------------------------------------ */

test("an apartado dragged gets a line before the first row and after each one, none around its own place", () => {
  const host = block("uno", [["a"]], [apartado("ap-1"), apartado("ap-2")]);
  const flow = resolveBlockFlowV2(host)!;
  const plan = planApartadoBoundarySlots(flow, "ap-1");
  assert.deepEqual(plan.map((row) => [row.before ?? null, row.after]), [
    ["open", "noop"],
    [null, "noop"],
    [null, "open"],
  ]);
  // Coming from another Block, every line is open.
  assert.deepEqual(planApartadoBoundarySlots(flow, null).map((row) => [row.before ?? null, row.after]), [
    ["open", "open"],
    [null, "open"],
    [null, "open"],
  ]);
});

/* ------------------------------------------------------------------ */
/*  V5.6-04 / V5.6-12 — the editor's viewport                          */
/* ------------------------------------------------------------------ */

test("bringing a change into view scrolls the editor by the right amount", () => {
  const view = { scrollTop: 500, viewTop: 100, viewHeight: 600 };
  assert.equal(scrollTopToReveal({ ...view, elementTop: 900, elementHeight: 100 }, "center"), 500 + 800 - 250);
  assert.equal(scrollTopToReveal({ ...view, elementTop: 300, elementHeight: 50 }, "nearest"), 500, "already in view: nothing moves");
  assert.equal(scrollTopToReveal({ ...view, elementTop: 50, elementHeight: 20 }, "nearest"), 450);
  assert.equal(scrollTopToReveal({ ...view, elementTop: 690, elementHeight: 40 }, "nearest"), 530);
  assert.equal(scrollTopToReveal({ scrollTop: 0, viewTop: 0, viewHeight: 600, elementTop: 10, elementHeight: 10 }, "center"), 0, "never above the top");
});

test("the editor's place is the first block or concept still at the top of its view", () => {
  const candidates = [
    { attribute: "data-block-id" as const, id: "uno", top: -400, bottom: 50 },
    { attribute: "data-concept-id" as const, id: "a", top: -300, bottom: -260 },
    { attribute: "data-concept-id" as const, id: "b", top: 20, bottom: 60 },
    { attribute: "data-block-id" as const, id: "dos", top: 80, bottom: 600 },
  ];
  assert.deepEqual(pickPlaceAnchor(candidates, 0)?.id, "uno", "the block whose bottom still shows");
  assert.deepEqual(pickPlaceAnchor(candidates.slice(1), 0)?.id, "b");
  assert.equal(pickPlaceAnchor([], 0), null);
  // The block sat 40 px above the top; it is now 1200 px down in a new editor that starts at 0.
  assert.equal(scrollTopForAnchor(0, 100, 1300, -40), 1240);
});
