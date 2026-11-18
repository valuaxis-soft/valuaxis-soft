/**
 * Video 7.1, 7.2 and 7.4 (16 Nov 2026) on the market panel: what was
 * captured is never lost with quick changes in a row, each tab shows only its
 * market, the characteristics are shared by the market's cards and the table
 * 2.1, the subject's column starts from what the valuation has, and the
 * comparables and characteristics reorder.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { addedCharacteristicText, marketDocumentBlocks, withGeneratedBlocks } from "../src/features/valuations/calculation/market-document";
import { characteristicKindOf, mirroredAttributes, sharedCharacteristics, unsharedAttributes } from "../src/features/valuations/calculation/market-characteristic-sharing";
import { applyTableLayout, layoutOf, withExtraColumn, withExtraColumnChange } from "../src/features/valuations/calculation/generated-table-layout";
import { ensureTableV2 } from "../src/features/valuations/services/table";
import { reorderComparablesSchema, marketSettingsSchema } from "../src/features/valuations/calculation/market-schemas";
import { findSubjectFacts } from "../src/features/valuations/calculation/market-subject-facts";
import {
  characteristicFieldsOf,
  defaultMarketSettings,
  type CharacteristicField,
  type ComparableDto,
  type MarketCalculationDto,
  type MarketSettingsDto,
} from "../src/features/valuations/calculation/market-types";
import { MarketCharacteristicsTable } from "../src/features/valuations/components/calculation/market-characteristics-table";
import { MarketEditSession, rebaseDraft, withPendingChanges } from "../src/features/valuations/components/calculation/market-edit-session";
import { movedIds } from "../src/features/valuations/components/calculation/sortable-rows";
import { DraftHistory } from "../src/features/valuations/components/calculation/use-draft-history";
import { generatedMarketOf, hiddenMarketBlocks, shownForActiveMarket, withMarketBlocksShown } from "../src/features/valuations/components/workspace/model/active-market";
import type { AppSection, Block, Concept, TableContent } from "../src/features/valuations/model";

function comparable(reference: number, area: number, price: number): ComparableDto {
  return {
    id: `c-${reference}`, reference, location: `Calle Inventada ${reference}`, area, price,
    landUse: null, shape: null, zone: null, frontage: null, depth: null, topography: null, services: null, notes: null,
    sourceName: "Portal inventado", contactName: null, contactPhone: null, url: null, offerDate: null, photos: [],
    factors: [],
  };
}

const market = (): MarketCalculationDto => ({
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 360 },
  comparables: [comparable(1, 300, 1_500_000), comparable(2, 320, 1_700_000)],
  locked: false,
});

/** A server that answers only when told: the panel's changes arrive one after another before any answer, as with a slow connection. */
function slowServer(initial: MarketCalculationDto) {
  let stored = initial;
  const waiting: Array<() => void> = [];
  const sentSettings: MarketSettingsDto[] = [];
  const answer = (work: () => MarketCalculationDto, reject?: boolean) => new Promise<MarketCalculationDto>((resolve, fail) => {
    waiting.push(() => {
      if (reject) {
        fail(new Error("Rechazado"));
        return;
      }
      stored = work();
      resolve(structuredClone(stored));
    });
  });
  const rejected = new Set<string>();
  return {
    sentSettings,
    rejected,
    get stored() {
      return stored;
    },
    transport: {
      saveSettings: (settings: MarketSettingsDto) => {
        sentSettings.push(settings);
        return answer(() => ({ ...stored, settings: structuredClone(settings) }));
      },
      saveComparable: (next: ComparableDto) => answer(
        () => ({ ...stored, comparables: stored.comparables.map((item) => (item.id === next.id ? structuredClone(next) : item)) }),
        rejected.has(next.id),
      ),
    },
    /** Answers everything on its way, as the server would, in order. */
    async flush() {
      for (let turn = 0; turn < 50; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        const next = waiting.shift();
        if (!next) {
          await new Promise((resolve) => setImmediate(resolve));
          if (!waiting.length) return;
          continue;
        }
        next();
      }
    },
  };
}

const fieldsOf = (calculation: MarketCalculationDto) => characteristicFieldsOf(calculation.settings);
const labels = (calculation: MarketCalculationDto) => fieldsOf(calculation).map((field) => field.label);
/** A change of the list as the table sends it, applied to the panel's settings as they are now. */
const changeFields = (session: MarketEditSession, update: (fields: CharacteristicField[]) => CharacteristicField[]) =>
  session.setSettings({ ...session.view.settings, characteristicFields: update(characteristicFieldsOf(session.view.settings)) });

test("V7.2-11: a name typed and left with a click on «Agregar característica» before the server answers is kept", async () => {
  const server = slowServer(market());
  const session = new MarketEditSession(market(), server.transport, () => assert.fail("nothing fails"));
  void changeFields(session, (fields) => [...fields, { key: "custom:a", label: "Nueva característica" }]);
  await server.flush();
  // The click outside: the rename leaves with the blur, the add with the click, before any answer.
  void changeFields(session, (fields) => fields.map((field) => (field.key === "custom:a" ? { ...field, label: "PROYECTO" } : field)));
  void changeFields(session, (fields) => [...fields, { key: "custom:b", label: "Nueva característica 2" }]);
  assert.deepEqual(labels(session.view).slice(-2), ["PROYECTO", "Nueva característica 2"], "both show at once");
  await server.flush();
  assert.deepEqual(labels(server.stored).slice(-2), ["PROYECTO", "Nueva característica 2"], "and both are stored");
  assert.deepEqual(labels(session.view).slice(-2), ["PROYECTO", "Nueva característica 2"]);
  assert.equal(session.busy, false);
});

test("V7.2-13: clicking ↑ several times quickly moves the same characteristic, never another", async () => {
  const server = slowServer(market());
  const session = new MarketEditSession(market(), server.transport, () => undefined);
  const up = (key: string) => changeFields(session, (fields) => {
    const index = fields.findIndex((field) => field.key === key);
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(index - 1, 0, field);
    return next;
  });
  const start = fieldsOf(session.view).map((field) => field.key);
  const last = start.at(-1)!;
  void up(last);
  void up(last);
  void up(last);
  await server.flush();
  const stored = fieldsOf(server.stored).map((field) => field.key);
  assert.equal(stored.indexOf(last), start.length - 4, "three places up");
  assert.deepEqual(stored.filter((key) => key !== last), start.filter((key) => key !== last), "the others keep their order");
});

test("V7.2-15: two characteristics added quickly are two steps; Ctrl+Z takes out the last, Ctrl+Y brings it back", async () => {
  const server = slowServer(market());
  const session = new MarketEditSession(market(), server.transport, () => undefined);
  const history = new DraftHistory<MarketSettingsDto>();
  const add = (key: string, label: string) => {
    history.record(session.view.settings, null, 0);
    void changeFields(session, (fields) => [...fields, { key, label }]);
  };
  const count = fieldsOf(session.view).length;
  add("custom:a", "PROYECTO");
  add("custom:b", "UBICACIÓN");
  await server.flush();
  const undone = history.undo(session.view.settings);
  assert.ok(undone);
  void session.setSettings(undone.draft);
  await server.flush();
  assert.deepEqual(labels(server.stored).slice(count), ["PROYECTO"], "one Ctrl+Z takes out only the last one");
  const redone = history.redo(session.view.settings);
  assert.ok(redone);
  void session.setSettings(redone.draft);
  await server.flush();
  assert.deepEqual(labels(server.stored).slice(count), ["PROYECTO", "UBICACIÓN"], "Ctrl+Y brings it back");
  // As it was: both steps kept what the server had answered last, the same «before».
  const old = new DraftHistory<MarketSettingsDto>();
  const answered = market().settings;
  old.record(answered, null, 0);
  old.record(answered, null, 0);
  assert.equal(old.undo(answered)?.draft, answered);
});

test("V7.2-15: typing in one cell is one step only within a moment; a change of another comparable is its own step", () => {
  const history = new DraftHistory<number>();
  history.record(0, "a", 1000);
  history.record(1, "a", 1100);
  history.record(2, "b", 1150);
  assert.equal(history.undo(3)?.draft, 2);
  assert.equal(history.undo(2)?.draft, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.redo(0)?.draft, 2);
});

test("V7.2-11: a comparable's cell and a setting changed together both stay; a rejected change goes back alone", async () => {
  const server = slowServer(market());
  const errors: unknown[] = [];
  const session = new MarketEditSession(market(), server.transport, (error) => errors.push(error));
  void session.changeComparable("c-1", (current) => ({ ...current, zone: "Habitacional" }));
  void session.setSettings({ ...session.view.settings, justification: "Texto" });
  server.rejected.add("c-2");
  void session.changeComparable("c-2", (current) => ({ ...current, zone: "Comercial" }));
  assert.equal(session.view.comparables[0].zone, "Habitacional");
  assert.equal(session.view.settings.justification, "Texto");
  await server.flush();
  assert.equal(server.stored.comparables[0].zone, "Habitacional");
  assert.equal(server.stored.settings.justification, "Texto");
  assert.equal(session.view.comparables[1].zone, null, "the rejected one shows what is stored");
  assert.equal(errors.length, 1);
});

test("V7.2-11: settings asked while one is on its way travel once, the last, which carries the others", async () => {
  const server = slowServer(market());
  const session = new MarketEditSession(market(), server.transport, () => undefined);
  void session.setSettings({ ...session.view.settings, justification: "1" });
  void session.setSettings({ ...session.view.settings, adoptedUnitValue: 5000 });
  void session.setSettings({ ...session.view.settings, surfacePower: 6 });
  await server.flush();
  assert.equal(server.sentSettings.length, 1, "only the last one travels: it carries the others");
  assert.deepEqual([server.stored.settings.justification, server.stored.settings.adoptedUnitValue, server.stored.settings.surfacePower], ["1", 5000, 6]);
});

test("V7.2-11: the pending changes stay on top of an answer of the server", () => {
  const stored = market();
  const view = withPendingChanges(stored, { ...stored.settings, justification: "x" }, [{ comparableId: "c-2", change: (current) => ({ ...current, notes: "nota" }) }]);
  assert.equal(view.settings.justification, "x");
  assert.equal(view.comparables[1].notes, "nota");
  assert.equal(withPendingChanges(stored, null, []), stored);
});

test("V7.2-15: a field being typed keeps its text when the settings change under it; the others follow", () => {
  const from = { subjectArea: "360", justification: "" };
  const to = { subjectArea: "400", justification: "nuevo" };
  assert.deepEqual(rebaseDraft({ subjectArea: "36", justification: "" }, from, to), { subjectArea: "36", justification: "nuevo" });
});

const block = (id: string, enabled = true): Block => ({ id, title: id.toUpperCase(), sectionLabel: "", enabled, required: false, concepts: [], apartados: [], tables: [], images: [] });

test("V7.2-01 / V7.4-06: the tab of a market shows only its pages, in the market and in the alternative methods; the appraiser's blocks always", () => {
  const blocks = [
    block("motor-mercado-terreno_venta-enfoque"), block("motor-estadistico-terreno_venta"),
    block("motor-mercado-inmueble_venta-enfoque"), block("motor-estadistico-inmueble_venta"), block("plantilla"),
  ];
  const shown = (tab: "mercado" | "metodos", type: "TERRENO_VENTA" | "INMUEBLE_VENTA") =>
    blocks.filter((item) => shownForActiveMarket(item, { tab, type })).map((item) => item.id);
  assert.deepEqual(shown("mercado", "INMUEBLE_VENTA"), ["motor-mercado-inmueble_venta-enfoque", "plantilla"]);
  assert.deepEqual(shown("mercado", "TERRENO_VENTA"), ["motor-mercado-terreno_venta-enfoque", "plantilla"]);
  assert.deepEqual(shown("metodos", "TERRENO_VENTA"), ["motor-estadistico-terreno_venta", "plantilla"], "the alternative methods' section: the market of its tab");
  assert.equal(blocks.every((item) => shownForActiveMarket(item, null)), true, "outside a market section everything shows");
  assert.deepEqual(generatedMarketOf({ id: "motor-mercado-inmueble_renta-enfoque" }), { kind: "mercado", type: "INMUEBLE_RENTA" });
  assert.equal(generatedMarketOf({ id: "motor-anexo-factores" }), null);
});

test("V7.2-01: the market's own pages of the dictamen are the ones the filter recognizes", () => {
  const blocks = marketDocumentBlocks(market(), null);
  assert.ok(blocks.length > 0);
  for (const item of blocks) assert.deepEqual(generatedMarketOf(item), { kind: "mercado", type: "TERRENO_VENTA" });
});

test("V7.4-07: the hidden pages of a market are listed for its panel and come back with «Mostrar en el dictamen»", () => {
  const section = { blocks: [block("motor-mercado-terreno_venta-enfoque", false), block("motor-mercado-inmueble_venta-enfoque"), block("plantilla", false)] };
  assert.deepEqual(hiddenMarketBlocks(section), { TERRENO_VENTA: ["MOTOR-MERCADO-TERRENO_VENTA-ENFOQUE"] });
  const shown = withMarketBlocksShown(section, "TERRENO_VENTA");
  assert.deepEqual(shown.map((item) => item.enabled), [true, true, false], "only the market's pages, not the appraiser's hidden block");
});

test("V7.2-10 / -18: what a card adds becomes a characteristic of the market, figures with their kind", () => {
  const fields = characteristicFieldsOf(defaultMarketSettings("INMUEBLE_VENTA"));
  const card = {
    ...comparable(1, 120, 2_000_000),
    attributes: [
      { name: "Proyecto", value: "Antiguo" },
      { name: "Sup. común", value: "12 m2" },
      { name: "Cajones", value: "2" },
      { name: "topografía", value: "Plana" },
    ],
  };
  let key = 0;
  const shared = sharedCharacteristics(fields, card, () => `custom:t${(key += 1)}`);
  assert.deepEqual(shared.added.map((field) => [field.label, field.kind]), [["Proyecto", undefined], ["Sup. común", "area"], ["Cajones", "number"]]);
  assert.equal(shared.comparable.topography, "Plana", "a name the list has takes the value");
  assert.deepEqual(shared.comparable.extra, { "custom:t1": "Antiguo", "custom:t2": "12", "custom:t3": "2" });
  assert.deepEqual(shared.comparable.attributes, [], "nothing stays only in the card");
  // The next card finds them in the list: they are the market's.
  const second = sharedCharacteristics(shared.fields, { ...comparable(2, 100, 1), attributes: [{ name: "PROYECTO", value: "Nuevo" }] }, () => "custom:never");
  assert.equal(second.added.length, 0);
  assert.equal(second.comparable.extra?.["custom:t1"], "Nuevo");
  // And they print, the area in m².
  assert.equal(addedCharacteristicText("12", "area"), "12.00 m²");
  assert.equal(addedCharacteristicText("2", "number"), "2");
  assert.equal(addedCharacteristicText("Antiguo", undefined), "Antiguo");
  assert.deepEqual(characteristicKindOf("Amenidades", "Alberca"), { kind: undefined, value: "Alberca" });
  assert.equal(marketSettingsSchema.safeParse({ ...defaultMarketSettings("INMUEBLE_VENTA"), characteristicFields: shared.fields }).success, true);
});

test("V7.2-18: an added area prints in the characteristics line of the dictamen", () => {
  const calculation = market();
  calculation.settings.characteristicFields = [{ key: "custom:sup", label: "SUP. COMÚN", kind: "area" }];
  calculation.comparables[0].extra = { "custom:sup": "12" };
  const text = JSON.stringify(marketDocumentBlocks(calculation, null));
  assert.match(text, /SUP\. COMÚN: 12\.00 m²/);
});

const concept = (label: string, value: string): Concept => ({ id: label, label, value } as Concept);
const sectionWith = (id: string, title: string, concepts: Concept[]): AppSection =>
  ({ id, label: "", title, sourceFile: "", enabled: true, required: false, blocks: [{ ...block(`${id}-b`), concepts }] } as AppSection);

test("V7.1-13: the subject's column starts from what the valuation captured: front, depth, topography, land use", () => {
  const facts = findSubjectFacts([
    sectionWith("datos", "DATOS", [concept("Uso de suelo", "H4-U")]),
    sectionWith("terreno", "INFO TERRENO", [concept("Frente", "12.00 m"), concept("Fondo", "30 m"), concept("Topografía y configuración", "Plana"), concept("Uso de suelo", "Habitacional")]),
  ]);
  assert.deepEqual(facts.frontage, { value: "12", source: "INFO TERRENO › Frente" });
  assert.equal(facts.depth?.value, "30");
  assert.equal(facts.topography?.value, "Plana");
  assert.equal(facts.landUseKey?.value, "Habitacional", "the terreno section first");
});

test("V7.1-12 / -13: the subject's cell shows what the valuation has, linked, until something is typed", () => {
  const html = renderToStaticMarkup(
    <MarketCharacteristicsTable
      fields={[{ key: "frontage", label: "FRENTE" }, { key: "topography", label: "TOPOGRAFÍA" }]}
      defaults
      subject={{ topography: "Accidentada" }}
      subjectDefaults={{ frontage: { value: "12", source: "INFO TERRENO › Frente" }, topography: { value: "Plana", source: "INFO TERRENO › Topografía" } }}
      formulaScope="TERRENO_VENTA"
      comparables={[comparable(1, 300, 1)]}
      readOnly={false}
      onFields={() => {}}
      onSubject={() => {}}
      onComparable={() => {}}
    />,
  );
  assert.match(html, /<input[^>]*aria-label="FRENTE del sujeto"[^>]*title="Tomado del avalúo: INFO TERRENO › Frente[^"]*"[^>]*value="12"/);
  assert.match(html, /<input[^>]*aria-label="TOPOGRAFÍA del sujeto"[^>]*value="Accidentada"/, "what the appraiser typed wins");
  assert.match(html, /data-subject-linked-note/);
  assert.match(html, /aria-label="Arrastrar FRENTE"/, "each characteristic drags by its handle");
});

test("V7.2-12 / -14: dragging moves one row to the place of another; the order sent lists every comparable once", () => {
  assert.deepEqual(movedIds(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(movedIds(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(movedIds(["a", "b"], "a", "x"), ["a", "b"]);
  assert.equal(reorderComparablesSchema.safeParse({ comparableType: "TERRENO_VENTA", comparableIds: ["c-2", "c-1"] }).success, true);
  assert.equal(reorderComparablesSchema.safeParse({ comparableType: "TERRENO_VENTA", comparableIds: [] }).success, false);
  assert.equal(reorderComparablesSchema.safeParse({ comparableType: "OTRO", comparableIds: ["c-1"] }).success, false);
});

const tableIn = (section: Pick<AppSection, "blocks">, suffix: string) => {
  const table = section.blocks.flatMap((item) => [...item.tables, ...item.apartados.flatMap((apartado) => apartado.tables)]).find((item) => item.id.endsWith(suffix));
  assert.ok(table, suffix);
  return ensureTableV2(table);
};
/** Each printed row's location and what the appraiser wrote in his own column. */
const ownColumn = (section: Pick<AppSection, "blocks">) => tableIn(section, "tabla-caracteristicas").rows.map((row) => {
  const cell = (id: string) => { const value = row.cells[id]; return value && "value" in value ? String(value.value) : ""; };
  return [cell("col-2"), cell("extra-1")];
});
const withOwnValue = (section: AppSection, rowId: (table: ReturnType<typeof ensureTableV2>) => string, text: string): AppSection => {
  const table = tableIn(section, "tabla-caracteristicas");
  const layout = withExtraColumnChange(withExtraColumn(layoutOf(table), "SUP. COMÚN", null), "extra-1", { value: { rowId: rowId(table), text } });
  const laid = applyTableLayout(table as unknown as TableContent, layout);
  return { ...section, blocks: section.blocks.map((item) => ({ ...item, apartados: item.apartados.map((apartado) => ({ ...apartado, tables: apartado.tables.map((own) => (own.id === laid.id ? laid : own)) })) })) };
};
const threeComparables = (): MarketCalculationDto => ({ ...market(), comparables: [...market().comparables, comparable(3, 280, 1_000_000)] });
const sortedByUnitValue = (calculation: MarketCalculationDto): MarketCalculationDto => ({
  ...calculation,
  comparables: [...calculation.comparables].sort((a, b) => a.price! / a.area! - b.price! / b.area!).map((item, index) => ({ ...item, reference: index + 1 })),
});
const emptySection = (): AppSection => ({ id: "mercadoVenta", label: "IX", title: "MERCADO", sourceFile: "", enabled: true, required: false, blocks: [] } as AppSection);

test("V7.2-14: what the appraiser wrote in his own column of a dictamen table follows its comparable when they are sorted by $/m²", () => {
  const calculation = threeComparables();
  const first = withGeneratedBlocks(emptySection(), "TERRENO_VENTA", marketDocumentBlocks(calculation, null), { comparables: calculation.comparables });
  // «Sup. común» 12 written for comparable 3 (Calle Inventada 3), the cheapest per m².
  const written = withOwnValue(first, (table) => table.rows[2].id, "12");
  assert.deepEqual(ownColumn(written).map(([, own]) => own), ["", "", "12"]);
  const sorted = sortedByUnitValue(calculation);
  assert.deepEqual(sorted.comparables.map((item) => item.location), ["Calle Inventada 3", "Calle Inventada 1", "Calle Inventada 2"]);
  const after = withGeneratedBlocks(written, "TERRENO_VENTA", marketDocumentBlocks(sorted, null), { comparables: sorted.comparables });
  assert.deepEqual(ownColumn(after), [["Calle Inventada 3", "12"], ["Calle Inventada 1", ""], ["Calle Inventada 2", ""]], "the 12 moved with Calle Inventada 3");
  // Deleted, its row leaves the dictamen; brought back with «Deshacer», its value is there again.
  const without = { ...sorted, comparables: sorted.comparables.slice(1).map((item, index) => ({ ...item, reference: index + 1 })) };
  const deleted = withGeneratedBlocks(after, "TERRENO_VENTA", marketDocumentBlocks(without, null), { comparables: without.comparables });
  assert.deepEqual(ownColumn(deleted), [["Calle Inventada 1", ""], ["Calle Inventada 2", ""]]);
  const restored = withGeneratedBlocks(deleted, "TERRENO_VENTA", marketDocumentBlocks(sorted, null), { comparables: sorted.comparables });
  assert.deepEqual(ownColumn(restored)[0], ["Calle Inventada 3", "12"]);
});

test("V7.2-14: a table written before, keyed by the reference, takes the comparable in each row, then follows it", () => {
  const calculation = threeComparables();
  const first = withGeneratedBlocks(emptySection(), "TERRENO_VENTA", marketDocumentBlocks(calculation, null), { comparables: calculation.comparables });
  // As the tables were keyed until now: "…-k-3" is the row of reference 3.
  const old = withOwnValue(first, (table) => `r-${table.id}-k-3`, "12");
  const opened = withGeneratedBlocks(old, "TERRENO_VENTA", marketDocumentBlocks(calculation, null), { comparables: calculation.comparables });
  assert.deepEqual(ownColumn(opened)[2], ["Calle Inventada 3", "12"], "read by the comparable now in row 3");
  assert.doesNotMatch(JSON.stringify(tableIn(opened, "tabla-caracteristicas").schema?.generated?.layout), /-k-3"/);
  const sorted = sortedByUnitValue(calculation);
  const after = withGeneratedBlocks(opened, "TERRENO_VENTA", marketDocumentBlocks(sorted, null), { comparables: sorted.comparables });
  assert.deepEqual(ownColumn(after)[0], ["Calle Inventada 3", "12"]);
  // Nothing keyed by reference: the same section, the document is not touched.
  assert.equal(withGeneratedBlocks(after, "TERRENO_VENTA", marketDocumentBlocks(sorted, null), { comparables: sorted.comparables }), after);
});

test("V7.2-10: the market's added characteristics stay attributes of the comparable in the firm's base, to filter by them", () => {
  const fields: CharacteristicField[] = [{ key: "zone", label: "ZONA" }, { key: "custom:sup", label: "Sup. común", kind: "area" }, { key: "custom:p", label: "Proyecto" }];
  const attributes = mirroredAttributes(fields, { extra: { "custom:sup": "12", "custom:p": "" }, attributes: [{ name: "Alberca", value: "Sí" }, { name: "sup. común", value: "10" }] });
  assert.deepEqual(attributes, [{ name: "Alberca", value: "Sí" }, { name: "Sup. común", value: "12" }], "the market's value wins; an empty one is not an attribute");
  assert.deepEqual(unsharedAttributes(fields, [{ name: "Alberca", value: "Sí" }, { name: "SUP. COMÚN", value: "12" }]), [{ name: "Alberca", value: "Sí" }], "the card lists only what the market lacks");
});
