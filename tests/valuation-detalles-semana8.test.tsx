/**
 * Leftovers of the market like the Excel (#175, 26-27 Nov 2026): the fixed
 * data of the comparable's card renamed from the card, with the name in the
 * column of its tables too; an italic «1.00» that lost its last digit in a
 * narrow factor column; «Actualizar formato» highlighted on a valuation just
 * created; and leaving the editor from a field of a panel still holding what
 * was typed, without asking. The comparables are invented.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { cardFieldLabel, linkableCardFields, renamedCardField, withLinkedColumn } from "../src/features/valuations/calculation/market-table-columns";
import { marketDocumentBlocks, marketTableId } from "../src/features/valuations/calculation/market-document";
import { defaultCharacteristicFields, defaultMarketSettings, type ComparableDto, type MarketCalculationDto } from "../src/features/valuations/calculation/market-types";
import { ComparableSheetForm, type ComparableDialogProps } from "../src/features/valuations/components/calculation/comparable-dialog";
import { ComparableCardView } from "../src/features/valuations/components/calculation/comparable-card-view";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { isCalculationTypingField, sendFocusedCalculationField } from "../src/features/valuations/components/workspace/model/navigation-guard";
import { createInitialSections } from "../src/features/valuations/sections";
import type { AppSection } from "../src/features/valuations/model";
import {
  LAYOUT_VERSION,
  hasPendingLayoutSteps,
  layoutVersionOf,
  refreshDocumentLayout,
  revertLayoutRefresh,
  withCurrentLayout,
} from "../src/features/valuations/services/layout-refresh";
import { ensureTableV2 } from "../src/features/valuations/services/table";

const source = (path: string) => readFileSync(path, "utf8");

/* ------------------------------------------------------------------ */
/*  1. The card's fixed data renamed from the card                      */
/* ------------------------------------------------------------------ */

const comparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-prueba", reference: 1, folio: 201, location: "Calle Inventada 7", area: 400, price: 1_200_000,
  landUse: "Habitacional", landUseKey: null, shape: "Regular", zone: null, frontCount: null, frontage: 10, depth: 40, topography: null,
  services: null, conservation: null, quality: null, notes: null, extra: { "custom:vista": "Al parque" }, characteristicsText: null, attributes: [],
  sourceName: "Portal de prueba", contactName: "Agente Inventado", contactPhone: "3300000000", url: null,
  offerDate: "2026-11-20", consultedOn: "2026-11-20", validityMonths: 6,
  propertyDetails: { blockPosition: "Esquina", paving: "Concreto" }, photos: [], factors: [], ...extra,
});

const fields = [...defaultCharacteristicFields("TERRENO_VENTA"), { key: "custom:vista", label: "Vista" }];

const props = (extra: Partial<ComparableDialogProps> = {}): ComparableDialogProps => ({
  open: true, onOpenChange: () => undefined, comparable: comparable(), card: null, characteristicFields: fields,
  comparableType: "TERRENO_VENTA", unitLabel: "Precio de oferta ($)", readOnly: false, onSubmit: async () => true,
  onUploadPhoto: async () => undefined, onRemovePhoto: async () => undefined, onUploadScreenshot: async () => undefined, onRemoveScreenshot: async () => undefined,
  onCheckDuplicates: async () => [], onReuse: async () => true, ...extra,
});

test("the card of a market renames its fixed data in place, with the market's names, and keeps each label on its field", () => {
  const html = renderToStaticMarkup(<ComparableSheetForm {...props({ fieldLabels: { blockPosition: "Posición" }, onRenameField: () => undefined })} />);
  for (const key of ["blockPosition", "contactName", "sourceName", "contactPhone", "paving", "landUse", "offerDate", "url"]) {
    assert.match(html, new RegExp(`data-field-rename="${key}"`), `«${key}» has «Cambiar nombre»`);
  }
  // The name the market gave it (a header renamed) is the card's, and it still labels its field.
  assert.match(html, /<label for="cmp-pos-manzana">Posición<\/label>/);
  assert.match(html, /aria-label="Cambiar el nombre de «Posición»"/);
  assert.match(html, /<label for="cmp-fuente">Fuente o portal<\/label>/);
  // A characteristic added to the market is renamed here too; those of the format keep the list's names.
  assert.match(html, /data-field-rename="custom:vista"/);
  assert.doesNotMatch(html, /data-field-rename="frontage"/);
  assert.doesNotMatch(html, /data-field-rename="kind"/);
});

test("without a market (the firm's base) or for a reader, the card does not rename", () => {
  assert.doesNotMatch(renderToStaticMarkup(<ComparableSheetForm {...props()} />), /data-field-rename=/);
  assert.doesNotMatch(renderToStaticMarkup(<ComparableSheetForm {...props({ readOnly: true, onRenameField: () => undefined })} />), /data-field-rename=/);
});

const market = (patch: Partial<MarketCalculationDto["settings"]> = {}): MarketCalculationDto => ({
  settings: { ...defaultMarketSettings("TERRENO_VENTA"), subjectArea: 360, ...patch },
  comparables: [comparable()],
  locked: false,
});
const headersOf = (calculation: MarketCalculationDto, table: string) =>
  ensureTableV2(marketDocumentBlocks(calculation, null, { capture: true }).flatMap((block) => block.apartados.flatMap((apartado) => apartado.tables)).find((item) => item.id === table)!)
    .columns.map((column) => column.name);

test("a fixed datum renamed in the card is the header of its column in that market, and back", () => {
  const offers = marketTableId("TERRENO_VENTA", "ofertas");
  const settings = market({ linkedColumns: withLinkedColumn(null, "ofertas", "blockPosition", true) }).settings;
  assert.equal(headersOf(market(settings), offers).at(-1), "UBICACIÓN EN MANZANA");

  // «Ubicación en manzana» renamed «Posición» in the card.
  const renamed = { ...settings, ...renamedCardField(settings, "blockPosition", "Posición") };
  assert.deepEqual(renamed.fieldLabels, { blockPosition: "Posición" });
  assert.equal(headersOf(market(renamed), offers).at(-1), "POSICIÓN", "the column of the offers reads it");
  assert.equal(cardFieldLabel(renamed, "blockPosition"), "Posición");
  assert.ok(linkableCardFields(renamed).some((field) => field.key === "blockPosition" && field.label === "Posición"), "«Columna con un dato de la ficha» offers it by that name");
  // «Contacto» and «Fuente o portal», printed by the offers' own columns, too.
  const contact = { ...renamed, ...renamedCardField(renamed, "contactName", "Asesor") };
  assert.ok(headersOf(market(contact), offers).includes("ASESOR"));
  // The card's own name (or an empty one) gives it back, in the card and in the column.
  const back = { ...contact, ...renamedCardField(contact, "blockPosition", "  ") };
  assert.equal(headersOf(market(back), offers).at(-1), "UBICACIÓN EN MANZANA");
  // A characteristic added to the market keeps its name in the list; empty, it keeps the one it had.
  const custom = market({ characteristicFields: fields }).settings;
  assert.equal(renamedCardField(custom, "custom:vista", "Vista al parque").characteristicFields?.at(-1)?.label, "Vista al parque");
  assert.deepEqual(renamedCardField(custom, "custom:vista", " "), {});
});

test("each market has its names: renaming in one leaves the others' cards and columns as they were", () => {
  const land = market({ linkedColumns: withLinkedColumn(null, "ofertas", "blockPosition", true) }).settings;
  const renamed = { ...land, ...renamedCardField(land, "blockPosition", "Posición") };
  const building = { ...defaultMarketSettings("INMUEBLE_VENTA"), fieldLabels: land.fieldLabels };
  assert.equal(cardFieldLabel(renamed, "blockPosition"), "Posición");
  assert.equal(cardFieldLabel(building, "blockPosition"), "Ubicación en manzana");
});

test("the card shown with «Ver ficha» and printed in the memoria reads the market's names", () => {
  const card = {
    comparable: comparable(), type: "TERRENO_VENTA" as const, valuation: null, validity: comparableValidity("2026-11-20", "2026-11-26"),
    warnings: [], uses: [], history: [], fieldLabels: { blockPosition: "Posición", contactName: "Asesor" },
  };
  const html = renderToStaticMarkup(<ComparableCardView card={card} />);
  assert.match(html, />Posición</);
  assert.match(html, />Asesor</);
  assert.doesNotMatch(html, />Ubicación en manzana</);
  assert.match(source("src/features/valuations/memory/calculation-memory.ts"), /fieldLabels: cardFieldLabels\(market\.settings\)/);
  assert.match(source("src/features/valuations/calculation/comparable-card.service.ts"), /fieldLabels = Object\.fromEntries/);
  // The panel hands the card the same rename as its headers.
  assert.match(source("src/features/valuations/components/calculation/market-calculation-panel.tsx"), /onRenameField=\{readOnly \? undefined : renameField\}/);
});

/* ------------------------------------------------------------------ */
/*  2. The italic figures keep their last digit                         */
/* ------------------------------------------------------------------ */

test("the interface loads the italic of its font: a figure the calculation gives is not slanted by the browser and clipped", () => {
  // Chromium slants a font without italic past its advance, and a field clips that at its content box: «1.0(».
  const layout = source("src/app/layout.tsx");
  const plex = layout.slice(layout.indexOf("IBM_Plex_Sans({"), layout.indexOf("});", layout.indexOf("IBM_Plex_Sans({")));
  assert.match(plex, /style: \["normal", "italic"\]/);
  // The cells stay as narrow as their figures: the width of the columns is not touched.
  assert.match(source("src/features/valuations/components/editor/table-editor.tsx"), /const EDITOR_MIN_COLUMN_CHARS = 5;/);
});

/* ------------------------------------------------------------------ */
/*  3. «Actualizar formato» on a new valuation                         */
/* ------------------------------------------------------------------ */

const conclusionWithoutValue = (sections: AppSection[]) => sections.map((section) => (section.id !== "conclusiones" ? section : {
  ...section,
  blocks: section.blocks.map((block, index) => (index ? block : {
    ...block,
    concepts: block.concepts.filter((concept) => !concept.calculationKey).map(({ calculationKey: _key, ...concept }) => concept),
  })),
}));

test("a valuation created now has the current format and version: nothing is pending, so the button is not highlighted", () => {
  const created = withCurrentLayout(createInitialSections());
  assert.equal(layoutVersionOf(created), LAYOUT_VERSION);
  assert.equal(hasPendingLayoutSteps(created), false);
  // Even what the button would still find (a step that always has something to say) does not highlight it.
  const touched = conclusionWithoutValue(created);
  assert.equal(refreshDocumentLayout(touched).changes.length > 0, true, "«Actualizar formato» still can");
  assert.equal(hasPendingLayoutSteps(touched), false, "but a change made before it existed is not offered");
});

test("a template of the firm saved before a change of format starts the valuation in the current one", () => {
  const created = withCurrentLayout(conclusionWithoutValue(createInitialSections()));
  assert.equal(refreshDocumentLayout(created).changes.length, 0, "the template's conclusion took the concluded value");
  assert.equal(layoutVersionOf(created), LAYOUT_VERSION);
});

test("an old valuation is still offered the refresh, and not after it took it or took it back", () => {
  const old = conclusionWithoutValue(createInitialSections());
  assert.equal(layoutVersionOf(old), 0);
  assert.equal(hasPendingLayoutSteps(old), true, "highlighted");
  const refreshed = refreshDocumentLayout(old);
  assert.equal(hasPendingLayoutSteps(refreshed.sections), false);
  assert.equal(hasPendingLayoutSteps(revertLayoutRefresh(refreshed.sections, refreshed.changes)), false, "declined: the button stays, not highlighted");
});

test("valuation creation stamps the current version; the hook highlights only the steps after the valuation's", () => {
  const action = source("src/features/valuations/actions/save-valuation.action.ts");
  assert.match(action, /await stampCurrentLayoutVersion\(tx, versionId\);/);
  assert.match(action, /withCurrentLayout\(stripClientDataFromSections\(sections/);
  const hook = source("src/features/valuations/components/workspace/hooks/use-layout-refresh.ts");
  assert.match(hook, /const pending = useMemo\(\(\) => canEdit && hasPendingLayoutSteps\(sections\), \[canEdit, sections\]\);/);
});

/* ------------------------------------------------------------------ */
/*  4. Leaving from a field of a panel still holding what was typed     */
/* ------------------------------------------------------------------ */

/** An element as the guard reads it: its kind and the places it is in. */
const element = (tagName: string, places: string[], extra: { type?: string; isContentEditable?: boolean } = {}) => ({
  tagName,
  ...extra,
  closest: (selector: string) => (selector.split(",").map((item) => item.trim()).some((item) => places.includes(item)) ? {} : null),
});

test("a field of a calculation panel typed in counts as work to save: in the panel or in the tables of the dictamen", () => {
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-calculation-panel]"])), true, "«Texto del nivel de oferta»");
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-capture-slot]"], { type: "text" })), true, "a cell of a capture table");
  assert.equal(isCalculationTypingField(element("TEXTAREA", ["[data-calculation-panel]"])), true);
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-capture-slot]"], { type: "number" })), true);
});

test("what is not typed in a panel does not hold the editor", () => {
  assert.equal(isCalculationTypingField(element("INPUT", [])), false, "a field of the document saves with the document");
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-calculation-panel]"], { type: "checkbox" })), false);
  assert.equal(isCalculationTypingField(element("BUTTON", ["[data-calculation-panel]"])), false);
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-calculation-panel]", "[role=dialog]"])), false, "a dialog saves on its own button");
  assert.equal(isCalculationTypingField(element("INPUT", ["[data-calculation-panel]", "[role=listbox]"])), false);
  assert.equal(isCalculationTypingField(null), false);
});

test("«Guardar y salir» sends the focused field first, as leaving it does, and waits for it", async () => {
  const events: string[] = [];
  const focused = { ...element("INPUT", ["[data-calculation-panel]"]), blur: () => events.push("blur") };
  assert.equal(await sendFocusedCalculationField({ activeElement: focused as unknown as Element }), true);
  assert.deepEqual(events, ["blur"]);
  assert.equal(await sendFocusedCalculationField({ activeElement: null }), false);
});

test("the editor asks before leaving while a field of a panel holds what was typed: back arrow, links, palette and Atrás", () => {
  const hook = source("src/features/valuations/components/workspace/hooks/use-valuation-save.ts");
  assert.match(hook, /const mustAskBeforeLeaving = hasUnsavedChanges \|\| panelSaving \|\| unsentField;/);
  assert.match(hook, /document\.addEventListener\("input", onInput, true\);/);
  assert.match(hook, /document\.addEventListener\("focusout", onFocusOut, true\);/);
  // Every way out reads the same question: handleExit, the links, the palette (setLeaveGuard) and Atrás (the history copy).
  for (const guard of [/if \(mustAskBeforeLeaving\) \{\n\s+setPendingExit/, /if \(!mustAskBeforeLeaving \|\| leavingRef\.current\) return false;/, /if \(!mustAskBeforeLeaving \|\| historyGuardRef\.current\) return;/]) {
    assert.match(hook, guard);
  }
  const save = hook.slice(hook.indexOf("const handleSaveAndExit"), hook.indexOf("const exitWithoutSaving"));
  assert.ok(save.indexOf("sendFocusedCalculationField") < save.indexOf("pendingMutationsSettled"), "sent, then waited for");
  assert.match(source("src/features/valuations/components/workspace/valuation-editor-panel.tsx"), /data-calculation-panel=""/);
});
