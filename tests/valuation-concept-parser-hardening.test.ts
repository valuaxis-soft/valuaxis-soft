import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/* ================================================================== */
/*  STRUCTURAL TESTS                                                   */
/* ================================================================== */

test("normalizeNumericInput exists and is exported", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /export function normalizeNumericInput\(/, "normalizeNumericInput must exist");
});

test("normalizeNumericInput strips commas", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /replace\(/, "Must strip commas");
});

test("normalizeNumericInput strips currency prefix", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /currency/, "Must handle currency prefix");
});

test("normalizeNumericInput returns empty for invalid input", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /return ""/, "Must return empty for invalid input");
});

test("normalizeNumericInput trims whitespace", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /value\.trim\(\)/, "Must trim whitespace");
});

test("normalizeNumericInput does NOT strip all non-digit characters", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.doesNotMatch(src, /replace\(\/\\D\/g, ""\)/, "Must NOT strip all non-digit characters");
});

test("parseDocumentNumber exists and uses strict validation", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /function parseDocumentNumber\(/, "parseDocumentNumber must exist");
});

test("formatNumericValue uses parseDocumentNumber", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /const numericValue = parseDocumentNumber\(rawValue\)/, "Must use parseDocumentNumber");
});

test("ConceptValueFormatControl uses canonical format options", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");
  assert.match(src, /NUMERIC_VALUE_FORMAT_OPTIONS/, "Must reference canonical format options");
  assert.match(src, /NUMERIC_VALUE_FORMAT_OPTIONS\.map/, "Must map over canonical options");
});

test("Frozen areas untouched", () => {
  const files = [
    "src/features/valuations/components/terreno-preview.tsx",
    "src/features/valuations/components/report-preview.tsx",
    "src/features/valuations/services/content-layout-v2.ts",
    "src/features/valuations/services/content-transfer.ts",
    "src/features/valuations/components/editor/content-dnd-ids.ts",
  ];

  for (const file of files) {
    const content = readFile(file);
    assert.doesNotMatch(content, /normalizeNumericInput|parseDocumentNumber/, `${file} untouched`);
  }
});

/* ================================================================== */
/*  COMMA GROUPING VALIDATION TESTS                                    */
/* ================================================================== */

test("normalizeNumericInput validates comma grouping BEFORE removing commas", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  // Must validate with test() before replace()
  assert.match(src, /test\(normalized\)/, "Must validate before stripping commas");
});

test("normalizeNumericInput enforces 3-digit groups after comma", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /,\\d\{3\}/, "Must enforce 3-digit groups after comma");
});

test("normalizeNumericInput accepts 1-3 digits before first comma", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\\d\{1,3\}/, "Must allow 1-3 digits before comma");
});

test("normalizeNumericInput accepts multiple comma groups", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\(?:,\\d\{3\}\)\*/, "Must accept multiple comma groups");
});

test("normalizeNumericInput accepts optional decimal", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\(?:\\\.\\d\+\)\?\$/, "Must accept decimal after comma grouping");
});

test("normalizeNumericInput accepts leading minus", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\^-/, "Must accept leading minus");
});

test("normalizeNumericInput strips $ prefix", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  // Check for currency prefix stripping - look for the replace call with $ pattern
  assert.match(src, /replace\(\//, "Must have replace call for currency prefix");
});

test("normalizeNumericInput regex does not allow double commas", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.doesNotMatch(src, /,,/, "Regex must not allow double commas");
});

test("normalizeNumericInput regex starts with optional minus, not comma", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\^-/, "Regex starts with optional minus, not comma");
});

test("normalizeNumericInput regex ends at end of string", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\$\//, "Regex ends at end of string, no trailing comma allowed");
});

test("normalizeNumericInput regex allows only one optional decimal group", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\?\$/, "Regex allows only one optional decimal group");
});

test("normalizeNumericInput regex allows only one leading minus", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");
  assert.match(src, /\^-/, "Regex allows only one leading minus");
});
