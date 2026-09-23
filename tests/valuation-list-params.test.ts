import assert from "node:assert/strict";
import { test } from "node:test";
import {
  VALUATION_SEARCH_MAX_LENGTH,
  buildValuationListHref,
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

test("parseValuationListParams combines the three params", () => {
  assert.deepEqual(parseValuationListParams({ page: "2", q: " VAL-01 ", estado: "NUEVO" }, statusKeys), {
    page: 2,
    q: "VAL-01",
    status: "nuevo",
  });
  assert.deepEqual(parseValuationListParams({}, statusKeys), { page: 1, q: "", status: null });
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
