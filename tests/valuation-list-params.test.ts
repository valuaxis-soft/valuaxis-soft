import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VALUATION_SEARCH_MAX_LENGTH,
  buildValuationListHref,
  buildValuationSortHref,
  parseArchived,
  parseDirection,
  parseSort,
  parsePage,
  parseSearch,
  parseStatus,
  parseValuationListParams,
  totalPages,
} from "../src/features/dashboard/valuation-list-params";
import { getStatusPresentation } from "../src/features/dashboard/valuation-status";

const statusKeys = ["nuevo", "en_edicion", "en_revision", "terminado", "reabierto", "cancelado"];

test("page defaults to 1 for missing, invalid, zero or negative values", () => {
  for (const value of [undefined, "", "abc", "0", "-3", "1.5", "2e3", " ", "NaN"]) {
    assert.equal(parsePage(value), 1, `page=${String(value)}`);
  }
});

test("page accepts positive integers and caps absurd values", () => {
  assert.equal(parsePage("1"), 1);
  assert.equal(parsePage(" 7 "), 7);
  assert.equal(parsePage(["3", "9"]), 3);
  assert.equal(parsePage("999999999999999999999"), 10_000);
  assert.equal(parsePage("50000"), 10_000);
});

test("search is trimmed, collapses whitespace and is capped", () => {
  assert.equal(parseSearch(undefined), "");
  assert.equal(parseSearch("   "), "");
  assert.equal(parseSearch("  Casa   del \n centro  "), "Casa del centro");
  assert.equal(parseSearch(["folio-1", "otro"]), "folio-1");
  const long = parseSearch("a".repeat(500));
  assert.equal(long.length, VALUATION_SEARCH_MAX_LENGTH);
  assert.equal(parseSearch(`${"b".repeat(VALUATION_SEARCH_MAX_LENGTH - 1)} c`).endsWith(" "), false);
});

test("estado only accepts keys from the catalog, case-insensitive", () => {
  assert.equal(parseStatus("terminado", statusKeys), "terminado");
  assert.equal(parseStatus("EN_REVISION", statusKeys), "en_revision");
  assert.equal(parseStatus(" reabierto ", statusKeys), "reabierto");
  assert.equal(parseStatus("borrador", statusKeys), null);
  assert.equal(parseStatus("'; drop table", statusKeys), null);
  assert.equal(parseStatus("", statusKeys), null);
  assert.equal(parseStatus(undefined, statusKeys), null);
  assert.equal(parseStatus("nuevo", []), null);
});

const noExtraFilters = { trash: false, propertyKind: null, appraisalKind: null, appraiserId: null, dateField: "creacion", from: null, to: null } as const;

test("parseValuationListParams combines the params, with the default order", () => {
  assert.deepEqual(parseValuationListParams({ page: "2", q: " VAL-01 ", estado: "NUEVO" }, statusKeys), {
    page: 2,
    q: "VAL-01",
    status: "nuevo",
    sort: "modificacion",
    direction: "desc",
    archived: false,
    ...noExtraFilters,
  });
  assert.deepEqual(parseValuationListParams({}, statusKeys), { page: 1, q: "", status: null, sort: "modificacion", direction: "desc", archived: false, ...noExtraFilters });
});

test("the type, appraiser and date filters only accept safe values, and a backwards range is turned around", () => {
  const params = parseValuationListParams(
    { tipo: "CASA_HABITACION", tipoAvaluo: "comercial", valuador: "12", fecha: "conclusion", desde: "2026-11-30", hasta: "2026-11-01" },
    statusKeys,
  );
  assert.equal(params.propertyKind, "casa_habitacion");
  assert.equal(params.appraisalKind, "comercial");
  assert.equal(params.appraiserId, 12);
  assert.equal(params.dateField, "conclusion");
  assert.deepEqual([params.from, params.to], ["2026-11-01", "2026-11-30"]);
  assert.equal(
    buildValuationListHref(params),
    "/avaluos?tipo=casa_habitacion&tipoAvaluo=comercial&valuador=12&fecha=conclusion&desde=2026-11-01&hasta=2026-11-30",
  );

  const unsafe = parseValuationListParams({ tipo: "'; drop", valuador: "-3", desde: "2026-02-30", hasta: "ayer", fecha: "otra" }, statusKeys);
  assert.deepEqual([unsafe.propertyKind, unsafe.appraiserId, unsafe.from, unsafe.to, unsafe.dateField], [null, null, null, null, "creacion"]);
});

test("the trash is a list of its own: it wins over the archive and keeps its own default order", () => {
  const params = parseValuationListParams({ papelera: "1", archivados: "1" }, statusKeys);
  assert.deepEqual([params.trash, params.archived], [true, false]);
  assert.equal(buildValuationListHref(params), "/avaluos?papelera=1");
  assert.equal(parseDirection(undefined, "eliminacion"), "desc", "the most recently deleted first");
  assert.equal(parseDirection(undefined, "cliente"), "asc");
});

test("totalPages never returns less than one page", () => {
  assert.equal(totalPages(0), 1);
  assert.equal(totalPages(20), 1);
  assert.equal(totalPages(21), 2);
  assert.equal(totalPages(5, 2), 3);
});

test("buildValuationListHref keeps filters and omits defaults", () => {
  assert.equal(buildValuationListHref({}), "/avaluos");
  assert.equal(buildValuationListHref({ page: 1, q: "", status: null }), "/avaluos");
  assert.equal(
    buildValuationListHref({ page: 3, q: "casa & jardín", status: "terminado" }),
    "/avaluos?q=casa+%26+jard%C3%ADn&estado=terminado&page=3",
  );
});

test("status labels are in Spanish with accents and fall back to the catalog name", () => {
  assert.equal(getStatusPresentation("en_edicion").label, "En edición");
  assert.equal(getStatusPresentation("EN_REVISION").label, "En revisión");
  assert.equal(getStatusPresentation("terminado").pluralLabel, "Terminados");
  assert.equal(getStatusPresentation("pausado", "Pausado").label, "Pausado");
  assert.equal(getStatusPresentation("en_espera").label, "En espera");
});

test("the list sorts by a column in either direction; the default order is left out of the href", () => {
  assert.equal(parseSort(undefined), "modificacion");
  assert.equal(parseSort("FOLIO"), "folio");
  assert.equal(parseSort("otra"), "modificacion");
  assert.equal(parseDirection(undefined, "modificacion"), "desc", "dates newest first");
  assert.equal(parseDirection(undefined, "titulo"), "asc", "texts A–Z");
  assert.equal(parseDirection("desc", "titulo"), "desc");
  assert.equal(parseDirection("sideways", "folio"), "asc");
  assert.equal(parseArchived("1"), true);
  assert.equal(parseArchived(undefined), false);

  const params = parseValuationListParams({ orden: "estado", dir: "desc", archivados: "1", q: "casa" }, statusKeys);
  assert.deepEqual([params.sort, params.direction, params.archived], ["estado", "desc", true]);
  assert.equal(buildValuationListHref(params), "/avaluos?q=casa&archivados=1&orden=estado&dir=desc");
  assert.equal(buildValuationListHref({ sort: "modificacion", direction: "desc" }), "/avaluos", "the default order needs no parameters");
  assert.equal(buildValuationListHref({ sort: "modificacion", direction: "asc" }), "/avaluos?orden=modificacion&dir=asc");

  // Clicking the sorted column turns it around; another column starts in its natural direction, on page 1.
  assert.equal(buildValuationSortHref({ ...params, page: 3 }, "estado"), "/avaluos?q=casa&archivados=1&orden=estado&dir=asc");
  assert.equal(buildValuationSortHref(params, "folio"), "/avaluos?q=casa&archivados=1&orden=folio&dir=asc");
  assert.equal(buildValuationSortHref({ sort: "folio", direction: "asc" }, "modificacion"), "/avaluos");
});
