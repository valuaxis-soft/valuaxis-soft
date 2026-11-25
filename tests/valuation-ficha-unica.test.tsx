/**
 * Videos 8.2 and 8.3 (24 nov 2026): one card of the comparable, editable in
 * place and with its map; the pin looked up in a map's words; a deleted
 * comparable that comes back with Ctrl+Z or «Deshacer»; the market kept
 * across a change of view or a reload; and the «Estás en» bar filled with
 * its market's pastel. Every name, phone and address here is invented.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ComparableCardDto } from "../src/features/valuations/calculation/comparable-card.service";
import { bestGeocodingResult, geocodingQueryOf } from "../src/features/valuations/calculation/comparable-geocoding";
import { comparableValidity } from "../src/features/valuations/calculation/comparable-validity";
import { defaultCharacteristicFields, type ComparableDto } from "../src/features/valuations/calculation/market-types";
import { ComparableSheetForm, buildingFieldsOf, constructionDetailsOf, type ComparableDialogProps } from "../src/features/valuations/components/calculation/comparable-dialog";
import { MARKET_ACCENT } from "../src/features/valuations/components/calculation/market-accent";
import { changesList, comparableListSteps } from "../src/features/valuations/components/calculation/market-comparable-undo";
import {
  marketMemoryKey,
  storeMarketScroll,
  storeMarketType,
  storedMarketScroll,
  storedMarketType,
} from "../src/features/valuations/components/calculation/market-tab-memory";

/* ------------------------------------------------------------------ */
/*  V8.3: a deleted comparable comes back                              */
/* ------------------------------------------------------------------ */

test("V8.3: undoing a deletion brings the comparable back at the place it had", () => {
  // Five comparables; the third was deleted in the panel.
  const steps = comparableListSteps(["c1", "c2", "c4", "c5"], ["c1", "c2", "c3", "c4", "c5"], new Set(["c3"]));
  assert.deepEqual(steps.restore, ["c3"]);
  assert.deepEqual(steps.remove, []);
  assert.deepEqual(steps.order, ["c1", "c2", "c3", "c4", "c5"], "in its place, not at the end");
  assert.ok(changesList(steps));
});

test("V8.3: redoing the deletion takes it out again, and the rest keep their order", () => {
  const steps = comparableListSteps(["c1", "c2", "c3", "c4"], ["c1", "c2", "c4"], new Set(["c3"]));
  assert.deepEqual(steps.remove, ["c3"]);
  assert.deepEqual(steps.restore, []);
  assert.deepEqual(steps.order, ["c1", "c2", "c4"]);
});

test("V8.3: several deleted one after the other come back each in its place; one added since stays, after them", () => {
  const steps = comparableListSteps(["c1", "c4", "nuevo"], ["c1", "c2", "c3", "c4"], new Set(["c2", "c3"]));
  assert.deepEqual(steps.restore, ["c2", "c3"]);
  assert.deepEqual(steps.order, ["c1", "c2", "c3", "c4", "nuevo"], "the comparable added since is not taken out by the undo");
  assert.deepEqual(steps.remove, []);
});

test("V8.3: an undo of another change never deletes a comparable that was not deleted in the panel", () => {
  // The step was recorded before «nuevo» was added; undoing a cell must not take it out.
  const steps = comparableListSteps(["c1", "c2", "nuevo"], ["c1", "c2"], new Set());
  assert.equal(changesList(steps), false);
  assert.deepEqual(steps.order, ["c1", "c2", "nuevo"]);
});

test("V8.3: the panel records the deletion in its undo, keeps the focus in the panel and asks with the app's dialog", () => {
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  const remove = panel.slice(panel.indexOf("const removeComparable = async"), panel.indexOf("const confirmDeleteComparable"));
  assert.match(remove, /history\.record\(before, null\)/, "Ctrl+Z and «Deshacer» of the calculation undo it");
  assert.match(remove, /deletedInPanel\.current\.add\(comparable\.id\)/);
  assert.match(remove, /panel\.focus\(\{ preventScroll: true \}\)/, "the next Ctrl+Z reaches the panel, not the document");
  assert.match(remove, /label: "Deshacer", onClick: \(\) => void applyComparableList\(before\)/);
  assert.match(panel, /void applyComparableList\(snapshot\)/, "an undo of the panel puts the list back too");
  assert.doesNotMatch(panel, /window\.confirm/);
});

/* ------------------------------------------------------------------ */
/*  V8.2: the market and the place are kept                            */
/* ------------------------------------------------------------------ */

const memoryStorage = () => {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
};

test("V8.2: after a change of view or a reload the panel opens on the market that was open", () => {
  const storage = memoryStorage();
  const sales = marketMemoryKey("avaluo-1", ["TERRENO_VENTA", "INMUEBLE_VENTA"]);
  const rents = marketMemoryKey("avaluo-1", ["INMUEBLE_RENTA", "TERRENO_RENTA"]);
  assert.equal(storedMarketType(storage, sales, ["TERRENO_VENTA", "INMUEBLE_VENTA"]), null, "nothing kept: the first market");
  storeMarketType(storage, sales, "INMUEBLE_VENTA");
  assert.equal(storedMarketType(storage, sales, ["TERRENO_VENTA", "INMUEBLE_VENTA"]), "INMUEBLE_VENTA");
  assert.equal(storedMarketType(storage, rents, ["INMUEBLE_RENTA", "TERRENO_RENTA"]), null, "each section keeps its own");
  assert.equal(storedMarketType(storage, marketMemoryKey("avaluo-2", ["TERRENO_VENTA", "INMUEBLE_VENTA"]), ["TERRENO_VENTA"]), null, "each valuation its own");
  // A market the section does not have is not taken.
  storeMarketType(storage, rents, "TERRENO_VENTA");
  assert.equal(storedMarketType(storage, rents, ["INMUEBLE_RENTA", "TERRENO_RENTA"]), null);
});

test("V8.2: the place in the editor is kept with the market, and a broken or missing storage is no problem", () => {
  const storage = memoryStorage();
  const key = marketMemoryKey("avaluo-1", ["TERRENO_VENTA", "INMUEBLE_VENTA"]);
  storeMarketType(storage, key, "INMUEBLE_VENTA");
  storeMarketScroll(storage, key, 1234.6);
  assert.equal(storedMarketScroll(storage, key), 1235);
  assert.equal(storedMarketType(storage, key, ["TERRENO_VENTA", "INMUEBLE_VENTA"]), "INMUEBLE_VENTA", "the scroll does not lose the market");
  assert.equal(storedMarketScroll(null, key), null);
  assert.equal(storedMarketType({ getItem: () => "{no es json" }, key, ["TERRENO_VENTA"]), null);
  assert.doesNotThrow(() => storeMarketType({ getItem: () => null, setItem: () => { throw new Error("lleno"); } }, key, "TERRENO_VENTA"));
});

test("V8.2: the panel starts from the kept market and writes it on every change", () => {
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  assert.match(panel, /storedMarketType\(sessionStore\(\), memoryKey, types\) : null\) \?\? types\[0\]/);
  assert.match(panel, /storeMarketType\(sessionStore\(\), memoryKey, type\)/);
  assert.match(panel, /useKeptEditorScroll\(rootRef, memoryKey\)/);
});

/* ------------------------------------------------------------------ */
/*  V8.3: the «Estás en» bar is filled with its market's pastel         */
/* ------------------------------------------------------------------ */

test("V8.3: «Estás en» is filled with the market's pastel token, the ink on it", () => {
  assert.match(MARKET_ACCENT.TERRENO_VENTA.here, /\bbg-market-land\b/);
  assert.match(MARKET_ACCENT.INMUEBLE_VENTA.here, /\bbg-market-building\b/);
  assert.match(MARKET_ACCENT.INMUEBLE_RENTA.here, /\bbg-market-rent\b/);
  assert.match(MARKET_ACCENT.TERRENO_RENTA.here, /\bbg-market-land-rent\b/);
  for (const accent of Object.values(MARKET_ACCENT)) assert.match(accent.here, /text-foreground/);
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const token of ["market-land", "market-building", "market-rent", "market-land-rent"]) {
    assert.match(css, new RegExp(`--${token}: oklch\\(0\\.9\\d+ `), `${token} is a light pastel`);
    assert.match(css, new RegExp(`--color-${token}: var\\(--${token}\\)`));
  }
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  const bar = panel.slice(panel.indexOf("data-market-here") - 400, panel.indexOf("data-market-here"));
  assert.match(bar, /MARKET_ACCENT\[type\]\.here/);
  assert.doesNotMatch(bar, /#[0-9a-f]{3,6}\b/i, "no loose colors");
});

/* ------------------------------------------------------------------ */
/*  V8.2: one card, editable in place, with its map                     */
/* ------------------------------------------------------------------ */

const comparable = (extra: Partial<ComparableDto> = {}): ComparableDto => ({
  id: "comparable-prueba", reference: 3, folio: 117, location: "Calle Inventada 12, col. Centro, Arandas, Jalisco", area: 180, price: 2_000_000,
  landUse: "Habitacional", landUseKey: null, shape: "Regular", zone: null, frontCount: null, frontage: 10, depth: 18, topography: "Plana",
  services: null, conservation: "Bueno", quality: "Media", notes: "Casa de prueba", extra: {}, characteristicsText: null, attributes: [],
  sourceName: "Portal de prueba", contactName: "Agente Inventado", contactPhone: "3300000000", url: "https://portal.example/anuncio-1",
  offerDate: "2026-11-20", consultedOn: "2026-11-20", validityMonths: 6, bedrooms: 3, bathrooms: 2.5, landArea: 160,
  propertyDetails: { age: 12, levels: 2, parking: 2, paving: "Concreto", blockPosition: "Intermedio", unitBasis: "CONSTRUCCION_M2" },
  listingDetails: { publicationId: "EB-0001", currency: "MXN", dataOrigin: "Pegar anuncio" },
  address: { street: "Inventada", number: "12", neighborhood: "Centro", municipality: "Arandas", state: "Jalisco", postalCode: "47180" },
  latitude: 20.7092, longitude: -102.3467, photos: [], factors: [], ...extra,
});

const props = (extra: Partial<ComparableDialogProps> = {}): ComparableDialogProps => ({
  open: true, onOpenChange: () => undefined, comparable: comparable(), card: null, characteristicFields: defaultCharacteristicFields("INMUEBLE_VENTA"),
  comparableType: "INMUEBLE_VENTA", unitLabel: "Precio de oferta ($)", readOnly: false, onSubmit: async () => true,
  onUploadPhoto: async () => undefined, onRemovePhoto: async () => undefined, onUploadScreenshot: async () => undefined, onRemoveScreenshot: async () => undefined,
  onCheckDuplicates: async () => [], onReuse: async () => true, ...extra,
});

const valueOf = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*value="([^"]*)"`))?.[1]
  ?? html.match(new RegExp(`<input[^>]*value="([^"]*)"[^>]*id="${id}"`))?.[1];

test("V8.2: the card of an existing comparable has the bands of the ficha, and every datum is a field holding its value", () => {
  const html = renderToStaticMarkup(<ComparableSheetForm {...props()} />);
  // The bands of the ficha, in its order, photos and screenshot first.
  const bands = ["Fotografías del inmueble", "Pantalla de referencia", "Oferta", "Ubicación", "Fuente de información", "Terreno", "Construcción", "Características y observaciones"];
  let at = -1;
  for (const band of bands) {
    const next = html.indexOf(`aria-label="${band}"`);
    assert.ok(next > at, `«${band}» comes after the one before it`);
    at = next;
  }
  assert.match(html, /data-card-header=""/, "the blue band with its number");
  assert.match(html, /C-00117/);
  // Editable fields with their values, each with its label in the gray cell.
  assert.equal(valueOf(html, "cmp-fuente"), "Portal de prueba");
  assert.equal(valueOf(html, "cmp-contacto-1"), "Agente Inventado");
  assert.equal(valueOf(html, "cmp-ubic-6"), "Inventada");
  assert.equal(valueOf(html, "cmp-ubic-3"), "47180");
  assert.equal(valueOf(html, "cmp-coord-1"), "20.7092");
  assert.equal(valueOf(html, "comparable-shape"), "Regular");
  // What the card showed and the old form did not ask for is editable now.
  assert.equal(valueOf(html, "cmp-edad"), "12");
  assert.equal(valueOf(html, "cmp-niveles"), "2");
  assert.equal(valueOf(html, "cmp-estac"), "2");
  assert.equal(valueOf(html, "cmp-pavimento"), "Concreto");
  assert.equal(valueOf(html, "cmp-pos-manzana"), "Intermedio");
  assert.equal(valueOf(html, "cmp-anuncio-id"), "EB-0001");
  for (const label of ["Fuente o portal", "Anunciante", "ID de publicación", "Pavimento / acceso", "Posición en manzana", "Edad (años)", "Estacionamientos"]) {
    assert.match(html, new RegExp(`<label for="cmp-[a-z0-9-]+">${label.replace(/[()/]/g, "\\$&")}</label>`), `«${label}» labels its field`);
  }
  assert.match(html, /data-sheet-fields=""/);
  // The map with its pin, and the way out to its own page.
  assert.match(html, /data-comparable-location-picker=""/);
  assert.match(html, /Arrastra el pin/);
  assert.match(html, /Abrir en otra pestaña/);
  assert.match(html, /href="\/comparables\/comparable-prueba"/);
  assert.match(html, /Guardar comparable/);
  assert.doesNotMatch(html, /<fieldset[^>]*disabled/, "editable in place");
});

test("V8.2: a new comparable opens the same card, empty, and says where it is saved", () => {
  const html = renderToStaticMarkup(<ComparableSheetForm {...props({ comparable: null })} />);
  assert.match(html, /data-comparable-sheet="nuevo"/);
  assert.match(html, /Se guarda en este avalúo y en la base del despacho/);
  assert.equal(valueOf(html, "cmp-fuente"), "");
  assert.match(html, /aria-label="Oferta"/);
  assert.match(html, /data-comparable-location-picker=""/);
  assert.doesNotMatch(html, /Abrir en otra pestaña/, "nothing to open before it is saved");
  // A land has no «Construcción».
  const land = renderToStaticMarkup(<ComparableSheetForm {...props({ comparable: null, comparableType: "TERRENO_VENTA", characteristicFields: defaultCharacteristicFields("TERRENO_VENTA") })} />);
  assert.doesNotMatch(land, /aria-label="Construcción"/);
  assert.match(land, /Superficie de terreno \(m²\)/);
});

test("V8.2: a reader sees the same card with its fields locked", () => {
  const html = renderToStaticMarkup(<ComparableSheetForm {...props({ readOnly: true })} />);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.doesNotMatch(html, /Guardar comparable<\/button>/);
});

test("V8.2: with the card of the base, the sheet shows its warnings, its uses and the listing's other facts", () => {
  const card: ComparableCardDto = {
    comparable: comparable(), type: "INMUEBLE_VENTA", valuation: { id: "v1", folio: "PRUEBA-0001" } as ComparableCardDto["valuation"],
    validity: comparableValidity("2026-11-20", "2026-11-24"), warnings: [{ key: "PORTAL_CONTACT", message: "El contacto es solo por el portal." } as ComparableCardDto["warnings"][number]],
    uses: [], history: [],
  };
  const html = renderToStaticMarkup(<ComparableSheetForm {...props({ card })} />);
  assert.match(html, /Capturado en el avalúo PRUEBA-0001/);
  assert.match(html, /El contacto es solo por el portal\./);
  assert.match(html, /aria-label="Más datos del anuncio"/);
  assert.match(html, /aria-label="Avalúos en que se usó"/);
});

test("V8.2: the comparables table keeps only «Ver ficha» and «Eliminar» per row; «Ver ficha» opens the editable card", () => {
  const panel = readFileSync("src/features/valuations/components/calculation/market-calculation-panel.tsx", "utf8");
  const actions = panel.slice(panel.indexOf("data-comparable-actions"), panel.indexOf("</SortableComparableRow>"));
  assert.match(actions, /<IdCard data-icon="inline-start" \/> Ver ficha/);
  assert.match(actions, /onClick=\{\(\) => setEditing\(comparable\)\}/);
  assert.match(actions, /<Trash2 data-icon="inline-start" \/> Eliminar/);
  assert.doesNotMatch(actions, /Editar comparable|<Pencil|ComparableCardButton/);
});

test("V8.2: the read-only card of the base also shows its map", () => {
  const dialog = readFileSync("src/features/valuations/components/calculation/comparable-card-dialog.tsx", "utf8");
  assert.match(dialog, /map=\{<div className="border-t p-1\.5"><ComparableLocationMap/);
});

test("V8.2: age, levels and parking are checked like bedrooms and bathrooms", () => {
  assert.deepEqual(constructionDetailsOf({ age: "12", levels: "2", parking: "" }), { age: 12, levels: 2, parking: null });
  const levels = constructionDetailsOf({ age: "", levels: "1.5", parking: "" });
  assert.ok("error" in levels && levels.field === "levels" && /Niveles dice «1\.5»/.test(levels.error));
  const parking = constructionDetailsOf({ age: "", levels: "", parking: "México" });
  assert.ok("error" in parking && parking.field === "parking");
  assert.deepEqual(buildingFieldsOf({ landArea: "160", bedrooms: "3", bathrooms: "2.5" }), { landArea: 160, bedrooms: 3, bathrooms: 2.5 });
});

/* ------------------------------------------------------------------ */
/*  V8.2: the pin is looked up in a map's words                         */
/* ------------------------------------------------------------------ */

test("V8.2: the address goes to the geocoder without the reader's abbreviations, with the postal code and «México»", () => {
  assert.equal(
    geocodingQueryOf(
      { street: "Remanso de los Conejos Pte.", number: "3110", neighborhood: "Col. Bugambilias", postalCode: "45238", municipality: "Zapopan", state: "Jalisco" },
      "Remanso de los Conejos Pte. 3110, col. Bugambilias, C.P. 45238, Zapopan, Jalisco",
    ),
    "Remanso de los Conejos Poniente 3110, Bugambilias, 45238 Zapopan, Jalisco, México",
  );
  // The type of road in words; «S/N» is no number; the subdivision when there is no colonia.
  assert.equal(
    geocodingQueryOf({ streetType: "AVENIDA", street: "del Reno", number: "S/N", subdivision: "Fracc. Ciudad Inventada", municipality: "Zapopan", state: "Jalisco" }, ""),
    "Avenida del Reno, Ciudad Inventada, Zapopan, Jalisco, México",
  );
  // A name that already says its type does not get it twice.
  assert.equal(geocodingQueryOf({ streetType: "AVENIDA", street: "Av. Inventada", number: "4", municipality: "Arandas" }, ""), "Avenida Inventada 4, Arandas, México");
  // Without parts, the printed line without «col.», «C.P.» or the corner.
  assert.equal(
    geocodingQueryOf(null, "Calle Inventada 12 esquina con Calle Otra, col. Centro, C.P. 47180, Arandas, Jalisco"),
    "Calle Inventada 12, Centro, 47180, Arandas, Jalisco, México",
  );
});

test("V8.2: among the geocoder's answers, the one in the captured postal code and municipality wins over the first", () => {
  const results = [
    { address: "Remanso de los Conejos, 45010 Guadalajara, Jal., México", precision: "GEOMETRIC_CENTER", point: [20.6, -103.4] as const },
    { address: "Remanso de los Conejos Pte. 3110, Bugambilias, 45238 Zapopan, Jal., México", precision: "ROOFTOP", point: [20.62, -103.45] as const },
  ];
  const best = bestGeocodingResult(results, { postalCode: "45238", municipality: "Zapopan", state: "Jalisco" });
  assert.equal(best, results[1]);
  // Without captured parts the most precise one; without answers, none.
  assert.equal(bestGeocodingResult([{ address: "A", precision: "APPROXIMATE" }, { address: "B", precision: "ROOFTOP" }], null)?.address, "B");
  assert.equal(bestGeocodingResult([], null), null);
  const picker = readFileSync("src/features/valuations/comparable-base/components/comparable-location-picker.tsx", "utf8");
  assert.match(picker, /bestGeocodingResult\(await api\.maps\.geocode\(text\.trim\(\)\), parts\)/);
});

test("24 Nov 2026: a machine's card by its class, one «Año» (its data's), and its age to the valuation's day", () => {
  const machine = { ...comparable(), constructionType: null, propertyDetails: { kind: "MAQUINARIA_CONSTRUCCION", kindLabel: "Maquinaria de construcción", assetClass: "MAQUINARIA" as const }, machinery: { year: 2018 } };
  const html = renderToStaticMarkup(<ComparableSheetForm {...props({ comparable: machine, valuationDate: "2026-11-24" })} />);
  assert.match(html, /Datos de la máquina/, "the machine's data instead of the land");
  assert.doesNotMatch(html, /aria-label="Construcción"/);
  assert.doesNotMatch(html, /id="cmp-anio"/, "no second «Año»");
  assert.match(html, /id="cmp-edad"[^>]*placeholder="8"|placeholder="8"[^>]*id="cmp-edad"/, "2018 to the valuation's day is 8");
  // In a market of the valuation (real estate) a comparable without the machine's data is a property's card.
  const property = renderToStaticMarkup(<ComparableSheetForm {...props({ comparableClass: "INMUEBLE" })} />);
  assert.match(property, /id="cmp-anio"/);
  assert.doesNotMatch(property, /Datos de la máquina/);
});
