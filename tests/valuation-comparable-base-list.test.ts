import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CONSTRUCTION_TYPE_SUGGESTIONS } from "../src/features/valuations/calculation/comparable-card";
import { propertyTypeKeyOf } from "../src/features/valuations/calculation/comparable-master";
import {
  COMPARABLE_COLUMNS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  columnLayoutStorageKey,
  columnSortDirection,
  defaultColumnLayout,
  moveColumn,
  nextColumnSort,
  parseColumnLayout,
  resizeColumn,
  serializeColumnLayout,
  toggleColumn,
  visibleColumns,
} from "../src/features/valuations/comparable-base/column-layout";
import {
  COMPARABLE_SORTS,
  buildComparableListHref,
  hasAdvancedFilters,
  parseComparableListParams,
} from "../src/features/valuations/comparable-base/comparable-list-params";
import { BASE_ACTION_LABELS, ComparableBaseLinks } from "../src/features/valuations/comparable-base/components/comparable-base-actions";

test("the column layout round-trips through storage, per user, and a stale or broken value gives the default", () => {
  const layout = defaultColumnLayout();
  assert.deepEqual(layout.map((column) => column.key), [...COMPARABLE_COLUMNS]);
  assert.equal(layout.find((column) => column.key === "fuente")?.visible, false, "the source column starts hidden");
  assert.deepEqual(parseColumnLayout(serializeColumnLayout(layout)), layout);
  assert.deepEqual(parseColumnLayout(null), layout);
  assert.deepEqual(parseColumnLayout("{not json"), layout);
  assert.deepEqual(parseColumnLayout(JSON.stringify({ version: 99, columns: [] })), layout, "another version is ignored");
  assert.notEqual(columnLayoutStorageKey(1), columnLayoutStorageKey(2));

  // A stored layout keeps its order, drops unknown columns, appends the missing ones and clamps widths.
  const stored = JSON.stringify({ version: 1, columns: [
    { key: "precio", visible: true, width: 5 }, { key: "inventada", visible: true, width: 100 }, { key: "numero", visible: false, width: 10_000 },
    { key: "precio", visible: false, width: 200 },
  ] });
  const parsed = parseColumnLayout(stored);
  assert.deepEqual(parsed.slice(0, 2), [{ key: "precio", visible: true, width: MIN_COLUMN_WIDTH }, { key: "numero", visible: false, width: MAX_COLUMN_WIDTH }]);
  assert.deepEqual(parsed.slice(2).map((column) => column.key), COMPARABLE_COLUMNS.filter((key) => key !== "precio" && key !== "numero"));
});

test("columns are shown, hidden (never the last one), moved to another's place and resized within limits", () => {
  let layout = defaultColumnLayout();
  layout = toggleColumn(layout, "fuente");
  assert.equal(layout.find((column) => column.key === "fuente")?.visible, true);
  layout = moveColumn(layout, "precio", "numero");
  assert.deepEqual(layout.slice(0, 3).map((column) => column.key), ["precio", "numero", "ubicacion"]);
  layout = moveColumn(layout, "numero", "usado");
  assert.equal(layout.at(-1)?.key, "numero");
  assert.equal(moveColumn(layout, "numero", "numero"), layout, "a drop on itself changes nothing");
  layout = resizeColumn(layout, "ubicacion", 20);
  assert.equal(layout.find((column) => column.key === "ubicacion")?.width, MIN_COLUMN_WIDTH);
  layout = resizeColumn(layout, "ubicacion", 250.6);
  assert.equal(layout.find((column) => column.key === "ubicacion")?.width, 251);
  for (const key of COMPARABLE_COLUMNS) layout = toggleColumn(layout, key);
  assert.equal(visibleColumns(layout).length, 1, "the last visible column stays");
});

test("a header click sorts ascending, then descending, and the indicator follows the list's order", () => {
  assert.equal(nextColumnSort("precio", "reciente"), "precio_asc");
  assert.equal(nextColumnSort("precio", "precio_asc"), "precio_desc");
  assert.equal(nextColumnSort("precio", "precio_desc"), "precio_asc");
  assert.equal(columnSortDirection("precio", "precio_desc"), "desc");
  assert.equal(columnSortDirection("numero", "precio_desc"), null);
  // The default order (most recent first) is the descending order of the date column.
  assert.equal(columnSortDirection("fecha", "reciente"), "desc");
  assert.equal(nextColumnSort("fecha", "reciente"), "antiguo");
  assert.equal(nextColumnSort("usado", "reciente"), null, "the valuations column is not sortable");
  for (const key of ["numero", "ubicacion", "tipo", "superficies", "precio", "fecha", "vigencia"] as const) {
    const sort = nextColumnSort(key, "reciente");
    assert.ok(sort && (COMPARABLE_SORTS as readonly string[]).includes(sort), key);
    assert.equal(parseComparableListParams({ orden: sort }).sort, sort, "the order survives the URL");
  }
});

test("the source filter is a filter of its own, in the URL and in 'Más filtros'", () => {
  const params = parseComparableListParams({ fuente: "  Inmuebles24 " });
  assert.equal(params.source, "Inmuebles24");
  assert.equal(hasAdvancedFilters(params), true);
  assert.equal(buildComparableListHref(params), "/comparables?fuente=Inmuebles24");
  assert.equal(parseComparableListParams({}).source, "");
});

test("the buttons of the Comparables page are named as the client decided", () => {
  assert.deepEqual(BASE_ACTION_LABELS, { new: "Nuevo comparable", import: "Importar Excel", export: "Exportar Excel", template: "Descargar plantilla" });
  const html = renderToStaticMarkup(createElement(ComparableBaseLinks, { exportHref: "/api/comparables/exportar?q=centro" }));
  assert.match(html, /Exportar Excel/);
  assert.match(html, /Descargar plantilla/);
  assert.doesNotMatch(html, /plantilla maestra/);
  assert.match(html, /href="\/api\/comparables\/exportar\?q=centro"/);
});

test("the new kinds of good are offered in the form and filed under the inmuebles catalog without a new enum", () => {
  for (const kind of ["Edificio", "Nave industrial", "Local comercial", "Bodega", "Equipo y maquinaria"]) assert.ok(CONSTRUCTION_TYPE_SUGGESTIONS.includes(kind), kind);
  assert.equal(propertyTypeKeyOf("INMUEBLE_VENTA", "Equipo y maquinaria"), "MAQUINARIA_EQUIPO");
  assert.equal(propertyTypeKeyOf("INMUEBLE_VENTA", "Nave industrial"), "INDUSTRIAL");
  assert.equal(propertyTypeKeyOf("INMUEBLE_RENTA", "Local comercial"), "LOCAL_COMERCIAL");
  assert.equal(propertyTypeKeyOf("TERRENO_VENTA", "Edificio"), "TERRENO");
});
