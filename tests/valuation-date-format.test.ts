import assert from "node:assert/strict";
import test from "node:test";

/* ================================================================== */
/*  Import the functions under test                                    */
/* ================================================================== */

// We import directly from the source to test the actual logic
import { formatDateValue, formatConceptValueForDocument } from "../src/features/valuations/services/concept-value-format";
import { hydrateConceptMetadata, conceptMetadataFromContent } from "../src/features/valuations/metadata";

/* ================================================================== */
/*  TEST GROUP 1 — formatDateValue                                     */
/* ================================================================== */

test("formatDateValue: short format produces DD/MM/YYYY", () => {
  const result = formatDateValue("2024-02-12", "short");
  // es-MX short format: 12/02/2024
  assert.ok(result.includes("12"), `Expected day 12 in result: ${result}`);
  assert.ok(result.includes("02"), `Expected month 02 in result: ${result}`);
  assert.ok(result.includes("2024"), `Expected year 2024 in result: ${result}`);
});

test("formatDateValue: long format produces '12 de febrero de 2024'", () => {
  const result = formatDateValue("2024-02-12", "long");
  assert.ok(result.includes("12"), `Expected day 12 in result: ${result}`);
  assert.ok(result.includes("febrero"), `Expected lowercase 'febrero' in long format: ${result}`);
  assert.ok(result.includes("2024"), `Expected year 2024 in result: ${result}`);
});

test("formatDateValue: normal format produces '12 de Febrero de 2024' (capitalized)", () => {
  const result = formatDateValue("2024-02-12", "normal");
  assert.ok(result.includes("12"), `Expected day 12 in result: ${result}`);
  assert.ok(result.includes("Febrero"), `Expected capitalized 'Febrero' in normal format: ${result}`);
  assert.ok(result.includes("2024"), `Expected year 2024 in result: ${result}`);
  // Ensure it's NOT lowercase
  assert.ok(!result.includes("febrero"), `Should NOT have lowercase 'febrero' in normal format: ${result}`);
});

test("formatDateValue: defaults to normal when format is omitted", () => {
  const result = formatDateValue("2024-02-12");
  assert.ok(result.includes("Febrero"), `Default should be normal format (capitalized): ${result}`);
});

test("formatDateValue: empty string returns em dash", () => {
  assert.equal(formatDateValue(""), "—");
  assert.equal(formatDateValue("   "), "—");
});

test("formatDateValue: invalid date string returns raw value", () => {
  assert.equal(formatDateValue("not-a-date"), "not-a-date");
  assert.equal(formatDateValue("2024/02/12"), "2024/02/12");
});

test("formatDateValue: handles various months correctly", () => {
  // January
  const jan = formatDateValue("2024-01-15", "normal");
  assert.ok(jan.includes("Enero"), `Expected 'Enero' for January: ${jan}`);

  // December
  const dec = formatDateValue("2024-12-25", "normal");
  assert.ok(dec.includes("Diciembre"), `Expected 'Diciembre' for December: ${dec}`);

  // July
  const jul = formatDateValue("2024-07-04", "normal");
  assert.ok(jul.includes("Julio"), `Expected 'Julio' for July: ${jul}`);
});

test("formatDateValue: handles ISO timestamps from DB (2024-02-12T00:00:00.000Z)", () => {
  const result = formatDateValue("2024-02-12T00:00:00.000Z", "short");
  assert.ok(result.includes("12"), `Expected day 12 in ISO result: ${result}`);
  assert.ok(result.includes("02"), `Expected month 02 in ISO result: ${result}`);
});

test("formatDateValue: handles ISO timestamps with long format", () => {
  const result = formatDateValue("2024-02-12T00:00:00.000Z", "long");
  assert.ok(result.includes("12"), `Expected day 12: ${result}`);
  assert.ok(result.includes("febrero"), `Expected 'febrero': ${result}`);
  assert.ok(result.includes("2024"), `Expected year 2024: ${result}`);
});

/* ================================================================== */
/*  TEST GROUP 2 — formatConceptValueForDocument with date type         */
/* ================================================================== */

test("formatConceptValueForDocument: date type uses formatDateValue", () => {
  const concept = {
    type: "date" as const,
    value: "2024-02-12",
    dateFormat: "short" as const,
  };
  const result = formatConceptValueForDocument(concept);
  assert.ok(result.includes("12"), `Expected day 12: ${result}`);
  assert.ok(result.includes("02"), `Expected month 02: ${result}`);
});

test("formatConceptValueForDocument: date type without dateFormat defaults to normal", () => {
  const concept = {
    type: "date" as const,
    value: "2024-02-12",
  };
  const result = formatConceptValueForDocument(concept);
  assert.ok(result.includes("Febrero"), `Expected capitalized 'Febrero' (normal default): ${result}`);
});

test("formatConceptValueForDocument: non-date type passes through unchanged", () => {
  const concept = {
    type: "text" as const,
    value: "hello world",
  };
  const result = formatConceptValueForDocument(concept);
  assert.equal(result, "hello world");
});

test("formatConceptValueForDocument: date type with empty value returns em dash", () => {
  const concept = {
    type: "date" as const,
    value: "",
    dateFormat: "long" as const,
  };
  const result = formatConceptValueForDocument(concept);
  assert.equal(result, "—");
});

/* ================================================================== */
/*  TEST GROUP 3 — Metadata hydration                                   */
/* ================================================================== */

test("hydrateConceptMetadata: preserves dateFormat from config", () => {
  const config = {
    payload: {
      dateFormat: "long",
    },
  };
  const metadata = hydrateConceptMetadata(config);
  assert.equal(metadata.dateFormat, "long");
});

test("hydrateConceptMetadata: returns undefined for missing dateFormat", () => {
  const config = { payload: {} };
  const metadata = hydrateConceptMetadata(config);
  assert.equal(metadata.dateFormat, undefined);
});

test("hydrateConceptMetadata: ignores invalid dateFormat values", () => {
  const config = {
    payload: {
      dateFormat: "invalid",
    },
  };
  const metadata = hydrateConceptMetadata(config);
  assert.equal(metadata.dateFormat, undefined);
});

test("hydrateConceptMetadata: accepts all three valid formats", () => {
  assert.equal(hydrateConceptMetadata({ payload: { dateFormat: "short" } }).dateFormat, "short");
  assert.equal(hydrateConceptMetadata({ payload: { dateFormat: "normal" } }).dateFormat, "normal");
  assert.equal(hydrateConceptMetadata({ payload: { dateFormat: "long" } }).dateFormat, "long");
});

test("conceptMetadataFromContent: preserves dateFormat", () => {
  const content = {
    enabled: true,
    dateFormat: "short" as const,
  };
  const metadata = conceptMetadataFromContent(content);
  assert.equal(metadata.dateFormat, "short");
});

test("conceptMetadataFromContent: undefined dateFormat stays undefined", () => {
  const content = { enabled: true };
  const metadata = conceptMetadataFromContent(content);
  assert.equal(metadata.dateFormat, undefined);
});

/* ================================================================== */
/*  TEST GROUP 4 — Source code structure checks                         */
/* ================================================================== */
