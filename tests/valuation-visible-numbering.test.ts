import assert from "node:assert/strict";
import test from "node:test";
import type { Block, BlockFlow, Apartado } from "../src/features/valuations/model";
import {
  getVisibleOrdinal,
  formatVisibleChildLabel,
  getBlockFlowApartadoOrder,
} from "../src/features/valuations/services/visible-numbering";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function subBlock(id: string, enabled = true): Apartado {
  return {
    id,
    title: `Apartado ${id}`,
    enabled,
    concepts: [],
    tables: [],
    images: [],
  };
}

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "block-1",
    title: "Block 1",
    sectionLabel: "I",
    enabled: true,
    required: false,
    concepts: [],
    apartados: [],
    tables: [],
    images: [],
    ...overrides,
  };
}

/* ================================================================== */
/*  getVisibleOrdinal — existing behavior                              */
/* ================================================================== */

test("getVisibleOrdinal — counts only enabled items", () => {
  const items = [
    { id: "a", enabled: true },
    { id: "b", enabled: false },
    { id: "c", enabled: true },
  ];
  assert.equal(getVisibleOrdinal(items, "a"), 1);
  assert.equal(getVisibleOrdinal(items, "b"), null);
  assert.equal(getVisibleOrdinal(items, "c"), 2);
});

/* ================================================================== */
/*  formatVisibleChildLabel — existing behavior                        */
/* ================================================================== */

test("formatVisibleChildLabel — formats correctly", () => {
  const items = [
    { id: "a", enabled: true },
    { id: "b", enabled: true },
  ];
  assert.equal(formatVisibleChildLabel("I", items, "a"), "I.1");
  assert.equal(formatVisibleChildLabel("I", items, "b"), "I.2");
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — BlockFlow present                      */
/* ================================================================== */

test("getBlockFlowApartadoOrder — BlockFlow R1 B R2 A → [B, A]", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "b" },
        { type: "content-row", rowId: "r2" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(order.length, 2);
  assert.equal(order[0].id, "b");
  assert.equal(order[1].id, "a");
});

test("getBlockFlowApartadoOrder — BlockFlow A B → [A, B]", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(order.length, 2);
  assert.equal(order[0].id, "a");
  assert.equal(order[1].id, "b");
});

test("getBlockFlowApartadoOrder — BlockFlow B A → [B, A] (reversed)", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "b" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(order.length, 2);
  assert.equal(order[0].id, "b");
  assert.equal(order[1].id, "a");
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — no BlockFlow (legacy)                  */
/* ================================================================== */

test("getBlockFlowApartadoOrder — no blockFlow → apartados order", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(order.length, 3);
  assert.equal(order[0].id, "a");
  assert.equal(order[1].id, "b");
  assert.equal(order[2].id, "c");
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — disabled apartados                     */
/* ================================================================== */

test("getBlockFlowApartadoOrder — disabled apartados still in order", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b", false), subBlock("c")],
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "c" },
        { type: "apartado", apartadoId: "a" },
        { type: "apartado", apartadoId: "b" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(order.length, 3);
  assert.equal(order[0].id, "c");
  assert.equal(order[1].id, "a");
  assert.equal(order[2].id, "b");
  assert.equal(order[2].enabled, false);
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — numbering reflects visual order        */
/* ================================================================== */

test("numbering — B before A via BlockFlow → B=1, A=2", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "b" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(formatVisibleChildLabel("I", order, "b"), "I.1");
  assert.equal(formatVisibleChildLabel("I", order, "a"), "I.2");
});

test("numbering — R1 B R2 A via BlockFlow → B=1, A=2", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
    blockFlow: {
      version: 1,
      items: [
        { type: "content-row", rowId: "r1" },
        { type: "apartado", apartadoId: "b" },
        { type: "content-row", rowId: "r2" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(formatVisibleChildLabel("I", order, "b"), "I.1");
  assert.equal(formatVisibleChildLabel("I", order, "a"), "I.2");
});

test("numbering — legacy order A B → A=1, B=2", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b")],
  });
  const order = getBlockFlowApartadoOrder(b);
  assert.equal(formatVisibleChildLabel("I", order, "a"), "I.1");
  assert.equal(formatVisibleChildLabel("I", order, "b"), "I.2");
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — defensive: missing apartado in flow    */
/* ================================================================== */

test("getBlockFlowApartadoOrder — missing apartado in flow appended", () => {
  const b = block({
    apartados: [subBlock("a"), subBlock("b"), subBlock("c")],
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "a" },
        // "c" is missing from flow
      ],
    },
  });
  const order = getBlockFlowApartadoOrder(b);
  // "a" first from flow, then "b" and "c" appended defensively
  assert.equal(order.length, 3);
  assert.equal(order[0].id, "a");
});

/* ================================================================== */
/*  getBlockFlowApartadoOrder — never mutates block                    */
/* ================================================================== */

test("getBlockFlowApartadoOrder — does not mutate block.apartados", () => {
  const subBlocks = [subBlock("a"), subBlock("b")];
  const b = block({
    apartados: subBlocks,
    blockFlow: {
      version: 1,
      items: [
        { type: "apartado", apartadoId: "b" },
        { type: "apartado", apartadoId: "a" },
      ],
    },
  });
  getBlockFlowApartadoOrder(b);
  assert.equal(subBlocks[0].id, "a");
  assert.equal(subBlocks[1].id, "b");
});
