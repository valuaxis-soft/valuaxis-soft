/**
 * What the check on screen of 13 Nov 2026 found unfinished (videos 5.4, 5.5
 * and 5.7): «Copiar valor a toda la fila/columna» filled nothing in the
 * capture tables of the panels, the room before and after a table printed
 * more than set, the image control was called «Tamaño» and the comparables'
 * photos had none, and «Calle» had no type of road.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { STREET_TYPES, addressFromRecord, formatAddress, streetTypeOf } from "../src/features/valuations/calculation/comparable-card";
import { comparableInputSchema, comparablePhotoFramingSchema } from "../src/features/valuations/calculation/market-schemas";
import { typeInto } from "../src/features/valuations/components/calculation/calc-table-context-menu";
import { ComparablePhotoFraming } from "../src/features/valuations/components/calculation/comparable-photo-framing";
import { MarketCharacteristicsTable } from "../src/features/valuations/components/calculation/market-characteristics-table";
import { documentBlockFlowItems } from "../src/features/valuations/components/document-block-renderer";
import { DocumentThemeProvider } from "../src/features/valuations/components/document-theme";
import { ImageFramingControl } from "../src/features/valuations/components/editor/image-framing-control";
import { TableEditorItem } from "../src/features/valuations/components/editor/table-editor";
import { parseComparableSearchQuery } from "../src/features/valuations/comparable-search/schemas";
import type { Block, Concept, ContentLayout, TableContent } from "../src/features/valuations/model";
import { DEFAULT_IMAGE_SIZE } from "../src/features/valuations/services/image-framing";
import { captureFillPlan, captureFillSummary } from "../src/features/valuations/services/table-context-menu";
import { CommitCell } from "../src/features/valuations/components/calculation/commit-cell";
import { FormulaInput } from "../src/features/valuations/components/calculation/formula-input";
import { ensureTableV2, setTablePrintLayout, type TableV2 } from "../src/features/valuations/services/table";
// Must load after the components so client-only libraries still see no DOM at import time.
import "./support/ssr-portal-shim";

/* ------------------------------------------------------------------ */
/*  V5.7-18: «Copiar valor a toda la fila/columna» in the panels        */
/* ------------------------------------------------------------------ */

/**
 * A cell that sends what was typed when it is left, as CommitCell does: what
 * it reads on blur is its state as last rendered, not what was set since.
 */
class FakeCellInput extends EventTarget {
  text = "";
  onFocus = () => {};
  onBlur = () => {};
  get value() { return this.text; }
  set value(value: string) { this.text = value; }
  focus() { this.onFocus(); }
  blur() { this.onBlur(); }
}
// Node has no DOM: the menu's typing finds the value setter on this input's prototype.
Object.assign(globalThis, { HTMLInputElement: FakeCellInput, HTMLTextAreaElement: class {} });

function commitOnBlurCell(stored: string) {
  const sent: string[] = [];
  let rendered: { editing: string | null } = { editing: null };
  let next = { ...rendered };
  const input = new FakeCellInput();
  input.text = stored;
  input.onFocus = () => { next = { editing: stored }; };
  input.onBlur = () => {
    if (rendered.editing !== null && rendered.editing !== stored) sent.push(rendered.editing);
    next = { editing: null };
  };
  input.addEventListener("input", () => { next = { editing: input.text }; });
  /** React rendering what a step left: the next step reads it. */
  const render = (step: () => void) => { step(); rendered = { ...next }; };
  return { input: input as unknown as HTMLInputElement, sent, render };
}

test("V5.7-18: the menu writes each cell as typing does, rendering between steps, so a cell that sends on blur sends the value", () => {
  const cell = commitOnBlurCell("");
  typeInto(cell.input, "1", cell.render);
  assert.deepEqual(cell.sent, ["1"], "N. FRENTES = 1 reaches the cell's commit, and with it the server");

  // As it was: the three steps without a render in between, the cell read nothing typed and sent nothing.
  const before = commitOnBlurCell("");
  let pending: Array<() => void> = [];
  typeInto(before.input, "1", (step) => { pending.push(step); });
  before.render(() => { for (const step of pending) step(); pending = []; });
  assert.deepEqual(before.sent, [], "the bug of the market's characteristics table");
});

test("V5.7-18: copying down a comparable's column leaves its free text alone, which would replace its whole line of characteristics", () => {
  const html = renderToStaticMarkup(
    <MarketCharacteristicsTable
      fields={[{ key: "frentes", label: "N. FRENTES" }]}
      defaults
      subject={{}}
      comparables={[{ id: "cmp-1", reference: "1", characteristics: { frentes: { value: 1, text: "1" } } }] as never}
      readOnly={false}
      onFields={() => {}}
      onSubject={() => {}}
      onComparable={() => {}}
    />,
  );
  assert.match(html, /<input[^>]*aria-label="Texto libre de características, comparable 1"[^>]*data-no-fill=""/);
  assert.doesNotMatch(html.match(/<input[^>]*aria-label="N. FRENTES, comparable 1"[^>]*>/)?.[0] ?? "", /data-no-fill/);
});

test("V5.7-18: copying «Ubicación» along the land row of Costos leaves the calculated cells (subject's area, Sup., FRe) alone and says so", () => {
  // The land row as the panel marks it: what the system calculates while empty is `computed`.
  const field = (noFill: "computed" | null = null, text = "") => ({ takesTyping: true, text, hasFormula: false, noFill });
  const row = [
    null, // Fracción
    field("computed"), // Superficie de Sujeto (from the market)
    null, // Valor unitario (read only)
    field(), // Neg.
    field(null, "0.95"), // Ubic., the one copied
    field("computed"), // Sup.
    field(), // Serv.
    field(), // Clas.
    field(), // Top.
    field("computed"), // FRe
  ];
  const plan = captureFillPlan(row, 4);
  assert.deepEqual(plan.targets, [3, 6, 7, 8], "only the factors the appraiser captures");
  assert.equal(plan.computedSkipped, 3);
  assert.equal(captureFillSummary(plan.targets.length, plan.computedSkipped, "row"),
    "Se llenaron 4 celdas de la fila. Se omitieron 3 celdas que calcula el sistema; para cambiarlas, escribe en ellas.");
  assert.equal(captureFillSummary(1, 0, "column"), "Se llenó 1 celda de la columna.");
  assert.equal(captureFillSummary(0, 1, "row"), "No hay celdas vacías en la fila para copiarlo. Se omitió 1 celda que calcula el sistema; para cambiarla, escribe en ella.");
  // The free text is left out too, but it is not a calculation.
  assert.deepEqual(captureFillPlan([field(null, "1"), { ...field(), noFill: "other" as const }], 0), { targets: [], computedSkipped: 0 });

  // The panels' fields carry the mark to the page.
  const html = renderToStaticMarkup(<FormulaInput aria-label="Factor resultante del terreno (FRe)" data-no-fill="computed" value="" onChange={() => {}} />);
  assert.match(html, /data-no-fill="computed"/);
  const homologation = renderToStaticMarkup(<CommitCell ariaLabel="Sup." value="" noFill="computed" onCommit={() => {}} />);
  assert.match(homologation, /data-no-fill="computed"/);
});

/* ------------------------------------------------------------------ */
/*  V5.7-11: room before and after a table, exactly as set               */
/* ------------------------------------------------------------------ */

const concept = (id: string, label: string): Concept => ({ id, label, value: "Inventado", enabled: true });
const rowsOf = (...items: Array<{ type: "concept" | "table"; id: string }>): ContentLayout => ({
  version: 2,
  rows: items.map((item, index) => ({ id: `row-${index}`, columns: [{ id: `col-${index}`, items: [item] }] })),
});
const tableOf = (id: string): TableV2 => ensureTableV2({
  id, title: "Medidas inventadas", version: 2,
  columns: [{ id: "c1", name: "Concepto" }, { id: "c2", name: "Dato" }],
  rows: [{ id: "r1", cells: { c1: { kind: "value", value: "Frente" }, c2: { kind: "value", value: "12" } } }],
} as unknown as TableContent);
const blockWith = (table: TableV2): Block => ({
  id: "terreno", title: "TERRENO", sectionLabel: "II", enabled: true, required: false,
  concepts: [concept("a", "Antes"), concept("b", "Después")],
  apartados: [], images: [], tables: [table as unknown as TableContent],
  contentLayout: rowsOf({ type: "concept", id: "a" }, { type: "table", id: table.id }, { type: "concept", id: "b" }),
} as Block);
/** Each flow item as printed, in order: the concept before, the table's row and the concept after. */
const printedRows = (block: Block) => documentBlockFlowItems(block, { renderTitleBar: false })
  .map((item) => renderToStaticMarkup(<DocumentThemeProvider variant="standard">{item.node}</DocumentThemeProvider>));
const rowClass = (html: string) => /^<div class="([^"]*)"/.exec(html)?.[1].split(" ") ?? [];

test("V5.7-11: «Espacio antes» and «Espacio después» are the whole room around the table in the preview and the PDF", () => {
  const spaced = setTablePrintLayout(tableOf("t1"), { spacingBefore: 20, spacingAfter: 30 });
  const [, tableRow, after] = printedRows(blockWith(spaced));
  assert.match(tableRow, /padding-top:20px/);
  assert.match(tableRow, /padding-bottom:30px/);
  assert.ok(!rowClass(tableRow).includes("mt-2.5"), "20 px, not 20 plus the 10 px of a row with a table (measured 30)");
  assert.ok(!rowClass(after).includes("mt-[1px]"), "30 px after, not 31");

  // Without room set, a table keeps the room it always had.
  const [, plainRow, plainAfter] = printedRows(blockWith(tableOf("t2")));
  assert.ok(rowClass(plainRow).includes("mt-2.5"));
  assert.ok(rowClass(plainAfter).includes("mt-[1px]"));
});

test("V5.7-11: the editor shows the same room around the table", () => {
  const spaced = setTablePrintLayout(tableOf("t1"), { spacingBefore: 20, spacingAfter: 30 });
  const html = renderToStaticMarkup(createElement(TableEditorItem, {
    table: spaced as unknown as TableContent, onAddColumn: () => {}, onAddRow: () => {}, onRemove: () => {}, onUpdate: () => {}, readOnly: false,
  }));
  assert.match(html, /<section[^>]*style="margin-top:20px;margin-bottom:30px"[^>]*data-table-editor="t1"/);
});

/* ------------------------------------------------------------------ */
/*  V5.5-06: «Zoom», also in the comparables' photos                    */
/* ------------------------------------------------------------------ */

test("V5.5-06: the 50–200 % control is called «Zoom» (alejar / acercar), not «Tamaño»", () => {
  const html = renderToStaticMarkup(createElement(ImageFramingControl, {
    defaultSize: DEFAULT_IMAGE_SIZE, description: "", focus: { x: 50, y: 50 }, idPrefix: "foto", imageUrl: "/foto.jpg",
    onFocusChange: () => {}, onSizeChange: () => {}, readOnly: false, size: { fit: "contain", scale: 150 }, title: "Encuadre",
  }));
  assert.match(html, />Zoom</);
  assert.match(html, />Alejar<[\s\S]*>Acercar</);
  assert.match(html, />Zoom original</);
  assert.doesNotMatch(html, /Tamaño|Más chica|Más grande/);
});

test("V5.5-06: a comparable's photo has the framing control, and its framing is validated before it is kept", () => {
  const html = renderToStaticMarkup(createElement(ComparablePhotoFraming, {
    photo: { id: "foto-1", title: "Fachada", url: "/foto-1.jpg" }, readOnly: false, onSave: async () => {},
  }));
  assert.match(html, /aria-label="Encuadre de la imagen"/);
  const framing = { focus: { x: 30, y: 70 }, size: { fit: "cover", scale: 150 } };
  assert.ok(comparablePhotoFramingSchema.safeParse({ photoId: "foto-1", framing }).success);
  assert.ok(comparablePhotoFramingSchema.safeParse({ photoId: "foto-1", framing: null }).success, "null gives back the default");
  assert.equal(comparablePhotoFramingSchema.safeParse({ photoId: "foto-1", framing: { ...framing, size: { fit: "cover", scale: 500 } } }).success, false);
  assert.equal(comparablePhotoFramingSchema.safeParse({ photoId: "foto-1", framing: { ...framing, size: { fit: "zoom", scale: 100 } } }).success, false);
});

/* ------------------------------------------------------------------ */
/*  V5.4-10: «Vialidad» and its type                                    */
/* ------------------------------------------------------------------ */

test("V5.4-10: the type of road prints before its name with the usual abbreviation, or its whole name", () => {
  const at = (streetType: (typeof STREET_TYPES)[number] | undefined, street = "Inventada") =>
    formatAddress({ streetType, street, number: "488", municipality: "Arandas", state: "Jalisco" });
  assert.equal(at("AVENIDA"), "Av. Inventada 488, Arandas, Jalisco");
  assert.equal(at("BOULEVARD"), "Blvd. Inventada 488, Arandas, Jalisco");
  assert.equal(at("CALZADA"), "Calz. Inventada 488, Arandas, Jalisco");
  assert.equal(at("CERRADA"), "Cda. Inventada 488, Arandas, Jalisco");
  assert.equal(at("PRIVADA"), "Priv. Inventada 488, Arandas, Jalisco");
  assert.equal(at("CARRETERA"), "Carr. Inventada 488, Arandas, Jalisco");
  assert.equal(at("CALLE"), "Calle Inventada 488, Arandas, Jalisco");
  assert.equal(at("TERRACERIA"), "Terracería Inventada 488, Arandas, Jalisco");
  assert.equal(at("PERIFERICO"), "Periférico Inventada 488, Arandas, Jalisco");
  assert.equal(at("OTRO"), "Inventada 488, Arandas, Jalisco");
  // A name that already says it is not given it twice.
  assert.equal(at("AVENIDA", "Avenida Inventada"), "Avenida Inventada 488, Arandas, Jalisco");
  assert.equal(at("AVENIDA", "Av. Inventada"), "Av. Inventada 488, Arandas, Jalisco");
  assert.equal(at("CALLE", "Calle Roble"), "Calle Roble 488, Arandas, Jalisco");
  // An address of before has no type: it prints as it always did, and reads «Calle».
  assert.equal(at(undefined, "Roble"), "Roble 488, Arandas, Jalisco");
  const stored = addressFromRecord({ location: "Roble 12, Arandas", street: "Roble", number: "12" });
  assert.equal(stored?.streetType, undefined);
  assert.equal(streetTypeOf(stored), "CALLE");
  assert.equal(addressFromRecord({ street: "Inventada", streetType: "AVENIDA" })?.streetType, "AVENIDA");
  assert.equal(addressFromRecord({ street: "Inventada", streetType: "AUTOPISTA" })?.streetType, undefined, "an unknown type is not read");
});

test("V5.4-10: the type is kept in the comparable's address (no migration) and filters the search", () => {
  const base = {
    location: "Av. Inventada 488", area: 100, price: 1_000_000, factors: [], landUse: null, shape: null, zone: null, frontage: null, depth: null,
    topography: null, services: null, notes: null, sourceName: null, contactName: null, contactPhone: null, url: null, offerDate: null,
  };
  const saved = comparableInputSchema.safeParse({ ...base, address: { streetType: "AVENIDA", street: "Inventada" } });
  assert.ok(saved.success);
  assert.equal(saved.data.address?.streetType, "AVENIDA");
  assert.equal(comparableInputSchema.safeParse({ ...base, address: { streetType: "AUTOPISTA" } }).success, false);

  const search = (extra: Record<string, string>) => parseComparableSearchQuery(new URLSearchParams({ tipo: "TERRENO_VENTA", ...extra }));
  const filtered = search({ vialidad: "AVENIDA" });
  assert.ok(filtered.ok, "the type alone is a filter: no text needed");
  assert.equal(filtered.query.filters?.streetType, "AVENIDA");
  const unknown = search({ q: "Arandas", vialidad: "AUTOPISTA" });
  assert.ok(!unknown.ok);
  assert.equal(unknown.error, "Tipo de vialidad inválido.");
  const any = search({ q: "Arandas", vialidad: "" });
  assert.ok(any.ok);
  assert.equal(any.query.filters?.streetType, undefined);
});
