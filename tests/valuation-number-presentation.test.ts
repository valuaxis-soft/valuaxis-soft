import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentConceptValue } from "../src/features/valuations/components/document-concept-value";
import { DocumentTable } from "../src/features/valuations/components/document-table";
import { NumberPresentationProvider } from "../src/features/valuations/components/number-presentation-context";
import { hydrateSectionMetadata, sectionMetadataFromContent } from "../src/features/valuations/metadata";
import type { AppSection, TableContent } from "../src/features/valuations/model";
import { formatConceptValueForDocument, formatNumericValue } from "../src/features/valuations/services/concept-value-format";
import {
  DEFAULT_NUMBER_PRESENTATION,
  documentNumberPresentation,
  withoutThousandsSeparator,
} from "../src/features/valuations/services/number-presentation";
import type { TableV2 } from "../src/features/valuations/services/table";
import { evaluateTableFormulas, formatFormulaNumber, getCellDisplayValue } from "../src/features/valuations/services/table-formula-engine";
import { compileFormula, EMPTY_FORMULA_INDEX } from "../src/features/valuations/services/formula-references";
import { setCellFormula } from "../src/features/valuations/services/table";

const OFF = { thousandsSeparator: false };

const section = (id: string, extra: Partial<AppSection> = {}): AppSection =>
  ({ id, label: id, title: id, sourceFile: "", enabled: true, required: false, blocks: [], ...extra });

test("the document's choice lives on its carátula section and is on until it says otherwise", () => {
  assert.deepEqual(documentNumberPresentation([]), DEFAULT_NUMBER_PRESENTATION);
  assert.deepEqual(documentNumberPresentation([section("caratula"), section("terreno")]), { thousandsSeparator: true });
  assert.deepEqual(documentNumberPresentation([section("caratula", { thousandsSeparator: false }), section("terreno")]), { thousandsSeparator: false });
  assert.deepEqual(documentNumberPresentation([section("terreno", { thousandsSeparator: false }), section("caratula")]), { thousandsSeparator: true }, "only the cover's choice counts");
});

test("the choice travels in the section's configuration and reads back; a document saved before it is unchanged", () => {
  const saved = sectionMetadataFromContent({ enabled: true, thousandsSeparator: false });
  assert.equal(saved.thousandsSeparator, false);
  assert.equal(hydrateSectionMetadata(saved).thousandsSeparator, false);
  assert.equal(hydrateSectionMetadata({ payload: { thousandsSeparator: true } }).thousandsSeparator, true);
  assert.equal(hydrateSectionMetadata({ startOnNewPage: true }).thousandsSeparator, undefined);
  assert.equal(hydrateSectionMetadata({ thousandsSeparator: "no" }).thousandsSeparator, undefined);
});

test("a written number loses its separator; money and anything else stay as written", () => {
  assert.equal(withoutThousandsSeparator("40,000"), "40000");
  assert.equal(withoutThousandsSeparator("1,250,000.50 m²"), "1250000.50 m²");
  assert.equal(withoutThousandsSeparator(" -12,345 "), " -12345 ");
  assert.equal(withoutThousandsSeparator("$ 40,000.00"), "$ 40,000.00");
  assert.equal(withoutThousandsSeparator("40,000 MXN"), "40,000 MXN");
  assert.equal(withoutThousandsSeparator("40000"), "40000");
  assert.equal(withoutThousandsSeparator("Lote 1, manzana 2"), "Lote 1, manzana 2");
  assert.equal(withoutThousandsSeparator("1,2,3"), "1,2,3");
});

test("numeric concepts follow the document's choice; pesos keep their format", () => {
  assert.equal(formatNumericValue("40000", { valueFormat: "plain" }), "40,000");
  assert.equal(formatNumericValue("40000", { valueFormat: "plain" }, OFF), "40000");
  assert.equal(formatNumericValue("1234.50", { valueFormat: "m2" }, OFF), "1234.50 m²");
  assert.equal(formatNumericValue("1234.50", { valueFormat: "m2" }), "1,234.50 m²");
  assert.equal(formatNumericValue("40000", { valueFormat: "mxn" }, OFF), "$40,000.00");
  assert.equal(formatConceptValueForDocument({ type: "number", value: "169780" }, OFF), "169780");
  assert.equal(formatConceptValueForDocument({ type: "currency", value: "169780" }, OFF), "$169,780.00");
});

const table = (): TableV2 => ({
  id: "t",
  title: "Superficies",
  version: 2,
  columns: [{ id: "c1", name: "Superficie" }, { id: "c2", name: "Precio" }, { id: "c3", name: "Importe" }],
  rows: [{ id: "r1", cells: { c1: { kind: "value", value: "1,200" }, c2: { kind: "value", value: "$ 9,000.00" }, c3: { kind: "value", value: "" } } }],
});

test("table cells follow the document's choice: typed values, results and amounts", () => {
  let t = table();
  const compiled = compileFormula("=A1*2", { index: EMPTY_FORMULA_INDEX, table: t });
  assert.ok(compiled.ok);
  t = setCellFormula(t, "r1", "c3", compiled.ok ? compiled.formula : null);
  const results = evaluateTableFormulas(t);
  assert.equal(getCellDisplayValue(t, "r1", "c1", results), "1,200");
  assert.equal(getCellDisplayValue(t, "r1", "c1", results, OFF), "1200");
  assert.equal(getCellDisplayValue(t, "r1", "c2", results, OFF), "$ 9,000.00");
  assert.equal(getCellDisplayValue(t, "r1", "c3", results), "2,400");
  assert.equal(getCellDisplayValue(t, "r1", "c3", results, OFF), "2400");

  assert.equal(formatFormulaNumber(1234567.891, undefined, false, OFF), "1234567.891");
  assert.equal(formatFormulaNumber(1234567.891, undefined, true, OFF), "$1,234,567.89");
  assert.equal(formatFormulaNumber(1234.5, { type: "number", precision: 2 }, false, OFF), "1234.50");
  assert.equal(formatFormulaNumber(1234.5, { type: "measurement", unit: "m2", customUnit: "m²" }, false, OFF), "1234.50 m²");
  assert.equal(formatFormulaNumber(1234.5, { type: "currency" }, false, OFF), "$1,234.50");
});

test("the printed document reads the choice from its provider", () => {
  const concept = { id: "c", label: "Superficie", value: "169780", type: "number" as const };
  const printed = (thousandsSeparator: boolean) => renderToStaticMarkup(
    createElement(NumberPresentationProvider, { presentation: { thousandsSeparator } },
      createElement(DocumentConceptValue, { concept }),
      createElement(DocumentTable, { variant: "report", table: table() as unknown as TableContent })),
  );
  assert.match(printed(true), /169,780/);
  assert.match(printed(true), /1,200/);
  assert.doesNotMatch(printed(false), /169,780|>1,200</);
  assert.match(printed(false), /169780/);
  assert.match(printed(false), />1200</);
  assert.match(printed(false), /\$ 9,000\.00/, "pesos keep their format");
  // Outside a document the separator is shown, as it always was.
  assert.match(renderToStaticMarkup(createElement(DocumentConceptValue, { concept })), /169,780/);
});
