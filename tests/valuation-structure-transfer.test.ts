import assert from "node:assert/strict";
import test from "node:test";
import type { Apartado, AppSection, Block, Concept, ContentLayout, TableContent } from "../src/features/valuations/model";
import { linkConceptToCollection, resolveEffectiveConcept } from "../src/features/valuations/concept-links";
import { resolveBlockFlowV2 } from "../src/features/valuations/services/block-flow";
import { resolveContentLayout } from "../src/features/valuations/services/content-layout";
import {
  apartadoDestinations,
  blockDestinationSections,
  conceptDestinations,
  copyBlock,
  duplicateApartado,
  duplicateBlock,
  moveApartadoTo,
  moveBlockToSection,
  moveConceptsTo,
  pasteApartado,
  pasteBlock,
} from "../src/features/valuations/services/structure-transfer";
import type { TableV2 } from "../src/features/valuations/services/table";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const concept = (id: string, value = `valor ${id}`): Concept => ({ id, label: id, value, enabled: true, labelKey: `${id}-label`, valueKey: `${id}-value` });

/** Rows of concept ids: ["a", "b"] is one row with two columns. */
function layout(rows: string[][]): ContentLayout {
  return {
    version: 2,
    rows: rows.map((ids, rowIndex) => ({
      id: `r-${rowIndex}`,
      columns: ids.map((id, columnIndex) => ({ id: `c-${rowIndex}-${columnIndex}`, items: [{ type: "concept" as const, id }] })),
    })),
  };
}

function apartado(id: string, rows: string[][] = [], extra: Partial<Apartado> = {}): Apartado {
  return { id, title: id.toUpperCase(), enabled: true, concepts: rows.flat().map((conceptId) => concept(conceptId)), tables: [], images: [], contentLayout: layout(rows), ...extra };
}

function block(id: string, rows: string[][] = [], extra: Partial<Block> = {}): Block {
  return {
    id,
    title: id.toUpperCase(),
    sectionLabel: "",
    enabled: true,
    required: false,
    concepts: rows.flat().map((conceptId) => concept(conceptId)),
    apartados: [],
    tables: [],
    images: [],
    contentLayout: layout(rows),
    ...extra,
  };
}

const section = (id: string, blocks: Block[]): AppSection => ({ id, label: "", title: id.toUpperCase(), sourceFile: "", enabled: true, required: false, blocks });

const findSection = (sections: AppSection[], id: string) => sections.find((item) => item.id === id)!;
const findBlock = (sections: AppSection[], sectionId: string, blockId: string) => findSection(sections, sectionId).blocks.find((item) => item.id === blockId)!;
const rowsOf = (container: Block | Apartado) => resolveContentLayout(container).rows.map((row) => row.columns.map((column) => column.items[0].id));

function formulaTable(id: string, conceptId: string): TableContent {
  const table: TableV2 = {
    id,
    title: "Superficies",
    version: 2,
    columns: [{ id: "col-a", name: "Concepto" }, { id: "col-b", name: "Valor" }],
    rows: [
      { id: "row-1", cells: { "col-a": { kind: "value", value: "Terreno" }, "col-b": { kind: "value", value: "120" } } },
      {
        id: "row-2",
        cells: {
          "col-a": { kind: "value", value: "Total" },
          "col-b": { kind: "formula", formula: { expression: { type: "binary", operator: "ADD", left: { type: "operand", operand: { type: "cell", tableId: id, rowId: "row-1", columnId: "col-b" } }, right: { type: "operand", operand: { type: "concept", conceptId } } } } },
        },
      },
    ],
  };
  return table as unknown as TableContent;
}

/* ------------------------------------------------------------------ */
/*  Concepts: "Mover a…"                                               */
/* ------------------------------------------------------------------ */

test("several concepts move to another section in their order and keeping the rows they share", () => {
  const sections = [
    section("terreno", [block("origen", [["a", "b"], ["c"], ["d", "e"]])]),
    section("custom-x", [block("destino", [["z"]])]),
  ];
  const result = moveConceptsTo(sections, { sectionId: "terreno", blockId: "origen" }, ["e", "a", "b"], { sectionId: "custom-x", blockId: "destino" });
  assert.equal(result.changed, true);
  const origin = findBlock(result.sections, "terreno", "origen");
  const destination = findBlock(result.sections, "custom-x", "destino");
  assert.deepEqual(rowsOf(origin), [["c"], ["d"]]);
  assert.deepEqual(origin.concepts.map((item) => item.id), ["c", "d"]);
  assert.deepEqual(rowsOf(destination), [["z"], ["a", "b"], ["e"]], "a and b still side by side, after what was there");
  assert.deepEqual(destination.concepts.map((item) => item.id), ["z", "a", "b", "e"]);
  assert.equal(destination.concepts.find((item) => item.id === "a")?.value, "valor a", "the same concept, value included");
  const flowRows = resolveBlockFlowV2(destination)!.rows.length;
  assert.equal(flowRows, 3, "the block flow takes the new rows");
});

test("concepts move from a block into an apartado of another block and back out", () => {
  const sections = [section("terreno", [block("uno", [["a"], ["b"]]), block("dos", [], { apartados: [apartado("ap", [["x"]])] })])];
  const into = moveConceptsTo(sections, { sectionId: "terreno", blockId: "uno" }, ["b"], { sectionId: "terreno", blockId: "dos", apartadoId: "ap" });
  const target = findBlock(into.sections, "terreno", "dos").apartados[0];
  assert.deepEqual(rowsOf(target), [["x"], ["b"]]);
  const back = moveConceptsTo(into.sections, { sectionId: "terreno", blockId: "dos", apartadoId: "ap" }, ["x", "b"], { sectionId: "terreno", blockId: "uno" });
  assert.deepEqual(rowsOf(findBlock(back.sections, "terreno", "uno")), [["a"], ["x"], ["b"]]);
  assert.deepEqual(findBlock(back.sections, "terreno", "dos").apartados[0].concepts, []);
});

test("linked concepts keep their link when they move", () => {
  const base = [section("datos", [block("fuente", [["s"]])]), section("terreno", [block("origen", [["m"]])]), section("custom-x", [block("destino")])];
  // "m2" reads the value of "s" (linked value), sitting in the origin block.
  const linked = linkConceptToCollection([...base[0].blocks[0].concepts, ...base[1].blocks[0].concepts], "s", "m2", "value");
  const linkedConcept = linked.at(-1)!;
  const sections = base.map((item) => item.id !== "terreno" ? item : {
    ...item,
    blocks: [{ ...item.blocks[0], concepts: [...item.blocks[0].concepts, linkedConcept], contentLayout: layout([["m"], ["m2"]]) }],
  });
  const result = moveConceptsTo(sections, { sectionId: "terreno", blockId: "origen" }, ["m2"], { sectionId: "custom-x", blockId: "destino" });
  const moved = findBlock(result.sections, "custom-x", "destino").concepts[0];
  assert.equal(moved.id, "m2");
  assert.equal(moved.valueKey, linkedConcept.valueKey);
  const all = result.sections.flatMap((item) => item.blocks.flatMap((candidate) => candidate.concepts));
  assert.equal(resolveEffectiveConcept(moved, all).value, "valor s");
});

test("concepts do not move into or out of a block the calculation writes", () => {
  const sections = [
    section("mercadoVenta", [block("motor-mercado-terreno_venta-1", [["g"]]), block("mercadoVenta-block-1-comparables-de-mercado-en-venta", [["p"]])]),
    section("terreno", [block("origen", [["a"]])]),
  ];
  const out = moveConceptsTo(sections, { sectionId: "mercadoVenta", blockId: "motor-mercado-terreno_venta-1" }, ["g"], { sectionId: "terreno", blockId: "origen" });
  assert.equal(out.changed, false);
  assert.match(out.reason ?? "", /cálculo/);
  const into = moveConceptsTo(sections, { sectionId: "terreno", blockId: "origen" }, ["a"], { sectionId: "mercadoVenta", blockId: "mercadoVenta-block-1-comparables-de-mercado-en-venta" });
  assert.equal(into.changed, false);
  const offered = conceptDestinations(sections, { sectionId: "terreno", blockId: "origen" });
  assert.deepEqual(offered.map((item) => item.address.blockId), [], "neither locked block is offered");
});

/* ------------------------------------------------------------------ */
/*  Copies: new ids, references and links                              */
/* ------------------------------------------------------------------ */

test("a copied block gets new ids for everything and its references follow the copies", () => {
  const table = formulaTable("tbl-1", "a");
  const source = block("origen", [["a", "b"]], {
    tables: [table],
    images: [{ id: "img-1", title: "Foto", src: "uploads/2026-10/foto.jpg" }],
    contentLayout: {
      version: 2,
      rows: [
        { id: "r-0", columns: [{ id: "c-0", items: [{ type: "concept", id: "a" }] }, { id: "c-1", items: [{ type: "concept", id: "b" }] }] },
        { id: "r-1", columns: [{ id: "c-2", items: [{ type: "table", id: "tbl-1" }] }] },
        { id: "r-2", columns: [{ id: "c-3", items: [{ type: "image", id: "img-1" }] }] },
      ],
    },
    apartados: [apartado("ap-1", [["x"]])],
  });
  source.concepts = source.concepts.map((item) => item.id === "b" ? { ...item, formula: { expression: { type: "operand", operand: { type: "concept", conceptId: "a" } } } } : item);
  const sections = [section("terreno", [source])];
  const copy = copyBlock(source, sections);

  assert.notEqual(copy.id, source.id);
  const oldIds = new Set(["origen", "a", "b", "x", "ap-1", "tbl-1", "img-1"]);
  const newIds = [copy.id, ...copy.concepts.map((item) => item.id), copy.apartados[0].id, copy.apartados[0].concepts[0].id, copy.tables[0].id, copy.images[0].id];
  assert.equal(newIds.some((id) => oldIds.has(id)), false, "no id of the original is reused");
  assert.equal(new Set(newIds).size, newIds.length);

  const [copyA, copyB] = copy.concepts;
  assert.deepEqual(copyB.formula, { expression: { type: "operand", operand: { type: "concept", conceptId: copyA.id } } }, "the formula reads the copy of a");
  const copiedTable = copy.tables[0] as unknown as TableV2;
  const cell = copiedTable.rows[1].cells["col-b"];
  assert.equal(cell.kind, "formula");
  const expression = cell.kind === "formula" ? cell.formula.expression : null;
  assert.deepEqual(expression?.type === "binary" ? [expression.left, expression.right] : null, [
    { type: "operand", operand: { type: "cell", tableId: copiedTable.id, rowId: "row-1", columnId: "col-b" } },
    { type: "operand", operand: { type: "concept", conceptId: copyA.id } },
  ]);

  const refs = resolveContentLayout(copy).rows.flatMap((row) => row.columns.map((column) => `${column.items[0].type}:${column.items[0].id}`));
  assert.deepEqual(refs, [`concept:${copyA.id}`, `concept:${copyB.id}`, `table:${copiedTable.id}`, `image:${copy.images[0].id}`]);
  const flowApartados = resolveBlockFlowV2(copy)!.rows.flatMap((row) => row.items).filter((item) => item.type === "apartado");
  assert.deepEqual(flowApartados, [{ type: "apartado", apartadoId: copy.apartados[0].id }]);
  assert.equal(copy.images[0].src, "uploads/2026-10/foto.jpg", "the copy shows the same file");
  assert.equal(copyA.value, "valor a", "a copy in the document keeps the values");
});

test("a copy is independent of the original, but keeps the links to concepts outside it", () => {
  const outside = concept("fuera");
  const inside = concept("dentro");
  const [, linkedInside] = linkConceptToCollection([outside, inside], "fuera", "liga", "value").slice(1);
  const withLink = linkConceptToCollection([outside, inside], "fuera", "liga", "value");
  const sourceOutside = withLink.find((item) => item.id === "fuera")!;
  const original = block("origen", [], { concepts: [inside, linkedInside], contentLayout: layout([["dentro"], ["liga"]]) });
  const sections = [section("datos", [block("fuente", [], { concepts: [sourceOutside], contentLayout: layout([["fuera"]]) })]), section("terreno", [original])];

  const copy = copyBlock(original, sections);
  const [copiedInside, copiedLink] = copy.concepts;
  assert.notEqual(copiedInside.valueKey, inside.valueKey, "the plain concept is a copy of its own");
  assert.notEqual(copiedInside.labelKey, inside.labelKey);
  assert.equal(copiedLink.valueKey, sourceOutside.valueKey, "the link to the outside concept keeps working");
});

test("two linked concepts copied together stay linked to each other only", () => {
  const first = concept("uno");
  const linked = linkConceptToCollection([first], "uno", "dos", "full");
  const original = block("origen", [], { concepts: linked, contentLayout: layout([["uno"], ["dos"]]) });
  const copy = copyBlock(original, [section("terreno", [original])]);
  const [copyOne, copyTwo] = copy.concepts;
  assert.equal(copyOne.valueKey, copyTwo.valueKey);
  assert.equal(copyOne.labelKey, copyTwo.labelKey);
  assert.notEqual(copyOne.valueKey, linked[0].valueKey);
});

test("a copy without data keeps titles, types, headers and formulas", () => {
  const original = block("origen", [["a"]], { tables: [formulaTable("tbl-1", "a")] });
  const copy = copyBlock(original, [section("terreno", [original])], { includeData: false, includeImages: false });
  assert.equal(copy.concepts[0].label, "a");
  assert.equal(copy.concepts[0].value, "");
  const table = copy.tables[0] as unknown as TableV2;
  assert.deepEqual(table.columns.map((column) => column.name), ["Concepto", "Valor"]);
  assert.equal(table.rows.length, 1, "only the formula row is kept");
  assert.equal(table.rows[0].cells["col-a"].kind === "value" && table.rows[0].cells["col-a"].value, "");
  assert.equal(table.rows[0].cells["col-b"].kind, "formula");
});

/* ------------------------------------------------------------------ */
/*  Blocks and apartados across sections                               */
/* ------------------------------------------------------------------ */

test("a block moves to another section with its ids and leaves its section", () => {
  const sections = [section("terreno", [block("uno", [["a"]]), block("dos")]), section("custom-x", [block("z")])];
  const result = moveBlockToSection(sections, "terreno", "uno", "custom-x");
  assert.deepEqual(findSection(result.sections, "terreno").blocks.map((item) => item.id), ["dos"]);
  assert.deepEqual(findSection(result.sections, "custom-x").blocks.map((item) => item.id), ["z", "uno"]);
  assert.equal(findBlock(result.sections, "custom-x", "uno").concepts[0].id, "a");
});

test("blocks the calculation writes and the carátula's are neither moved, copied nor duplicated", () => {
  const generated = block("motor-mercado-terreno_venta-1", [["g"]]);
  const sections = [
    section("caratula", [block("caratula-block-1-datos", [["c"]])]),
    section("mercadoVenta", [generated]),
    section("custom-x", [block("z")]),
  ];
  assert.equal(moveBlockToSection(sections, "mercadoVenta", generated.id, "custom-x").changed, false);
  assert.equal(duplicateBlock(sections, "mercadoVenta", generated.id).changed, false);
  assert.equal(moveBlockToSection(sections, "caratula", "caratula-block-1-datos", "custom-x").changed, false);
  assert.equal(moveBlockToSection(sections, "custom-x", "z", "caratula").changed, false);
  assert.equal(pasteBlock(sections, "caratula", block("z")).changed, false);
  assert.deepEqual(blockDestinationSections(sections, "custom-x").map((item) => item.id), ["mercadoVenta"]);
  assert.deepEqual(apartadoDestinations(sections).map((item) => item.address.blockId), ["z"]);
});

test("a duplicated block lands right after the original, and a pasted one at the end of the destination", () => {
  const sections = [section("terreno", [block("uno", [["a"]]), block("dos")]), section("custom-x", [block("z")])];
  const duplicated = duplicateBlock(sections, "terreno", "uno");
  const ids = findSection(duplicated.sections, "terreno").blocks.map((item) => item.id);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], "uno");
  assert.equal(ids[2], "dos");
  assert.notEqual(ids[1], "uno");

  const clip = findBlock(sections, "terreno", "uno");
  const first = pasteBlock(sections, "custom-x", clip);
  const second = pasteBlock(first.sections, "custom-x", clip);
  const pasted = findSection(second.sections, "custom-x").blocks;
  assert.equal(pasted.length, 3);
  assert.notEqual(pasted[1].id, pasted[2].id, "each paste is a copy of its own");
  assert.notEqual(pasted[1].concepts[0].id, pasted[2].concepts[0].id);
});

test("an apartado is duplicated right after itself and moved or pasted into a block of another section", () => {
  const host = block("uno", [["a"]], { apartados: [apartado("ap-1", [["x"]]), apartado("ap-2", [["y"]])] });
  const sections = [section("terreno", [host]), section("custom-x", [block("z", [["q"]])])];

  const duplicated = duplicateApartado(sections, "terreno", "uno", "ap-1");
  const order = resolveBlockFlowV2(findBlock(duplicated.sections, "terreno", "uno"))!.rows.flatMap((row) => row.items)
    .flatMap((item) => (item.type === "apartado" ? [item.apartadoId] : []));
  assert.equal(order.length, 3);
  assert.equal(order[0], "ap-1");
  assert.equal(order[2], "ap-2", "the copy sits between the original and the next one");

  const moved = moveApartadoTo(sections, { sectionId: "terreno", blockId: "uno", apartadoId: "ap-2" }, { sectionId: "custom-x", blockId: "z" });
  assert.deepEqual(findBlock(moved.sections, "terreno", "uno").apartados.map((item) => item.id), ["ap-1"]);
  const destination = findBlock(moved.sections, "custom-x", "z");
  assert.deepEqual(destination.apartados.map((item) => item.id), ["ap-2"]);
  assert.deepEqual(resolveBlockFlowV2(destination)!.rows.flatMap((row) => row.items).at(-1), { type: "apartado", apartadoId: "ap-2" });

  const pasted = pasteApartado(sections, { sectionId: "custom-x", blockId: "z" }, host.apartados[0]);
  const copy = findBlock(pasted.sections, "custom-x", "z").apartados[0];
  assert.notEqual(copy.id, "ap-1");
  assert.notEqual(copy.concepts[0].id, "x");
  assert.deepEqual(rowsOf(copy), [[copy.concepts[0].id]]);
});

test("a copy taken to Datos generales leaves its images behind; a move with images is refused there", () => {
  const withImage = block("uno", [["a"]], {
    images: [{ id: "img", title: "Foto", src: "uploads/foto.jpg" }],
    contentLayout: { version: 2, rows: [{ id: "r-0", columns: [{ id: "c-0", items: [{ type: "concept", id: "a" }] }] }, { id: "r-1", columns: [{ id: "c-1", items: [{ type: "image", id: "img" }] }] }] },
  });
  const sections = [section("terreno", [withImage]), section("datos", [block("d")])];
  const pasted = pasteBlock(sections, "datos", withImage);
  const copy = findSection(pasted.sections, "datos").blocks[1];
  assert.deepEqual(copy.images, []);
  assert.deepEqual(rowsOf(copy), [[copy.concepts[0].id]]);
  assert.equal(moveBlockToSection(sections, "terreno", "uno", "datos").changed, false);
});
