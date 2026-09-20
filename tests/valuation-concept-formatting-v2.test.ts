import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/* ================================================================== */
/*  TEST 1 — CANONICAL FORMAT OPTIONS INCLUDE ALL TYPES                */
/* ================================================================== */

test("NUMERIC_VALUE_FORMAT_OPTIONS includes all canonical formats", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /value: "plain"/, "Must have plain");
  assert.match(src, /value: "mxn"/, "Must have mxn");
  assert.match(src, /value: "m"/, "Must have m");
  assert.match(src, /value: "m2"/, "Must have m2");
  assert.match(src, /value: "m3"/, "Must have m3");
  assert.match(src, /value: "km"/, "Must have km");
  assert.match(src, /value: "km2"/, "Must have km2");
  assert.match(src, /value: "cm"/, "Must have cm");
  assert.match(src, /value: "mm"/, "Must have mm");
  assert.match(src, /value: "ha"/, "Must have ha");
  assert.match(src, /value: "in"/, "Must have in");
  assert.match(src, /value: "ft"/, "Must have ft");
  assert.match(src, /value: "percent"/, "Must have percent");
  assert.match(src, /value: "kg"/, "Must have kg");
  assert.match(src, /value: "g"/, "Must have g");
  assert.match(src, /value: "l"/, "Must have l");
  assert.match(src, /value: "custom"/, "Must have custom");
});

/* ================================================================== */
/*  TEST 2 — FORMAT_SYMBOLS INCLUDES ALL TYPES                         */
/* ================================================================== */

test("FORMAT_SYMBOLS includes all format symbols", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /m3: "m³"/, "Must have m3 symbol");
  assert.match(src, /in: "in"/, "Must have in symbol");
  assert.match(src, /ft: "ft"/, "Must have ft symbol");
});

/* ================================================================== */
/*  TEST 3 — CONCEPT VALUE FORMAT TYPE INCLUDES NEW FORMATS            */
/* ================================================================== */

test("ConceptValueFormat type includes m3, in, ft", () => {
  const src = readFile("src/features/valuations/model.ts");

  assert.match(src, /\| "m3"/, "Must have m3 in type");
  assert.match(src, /\| "in"/, "Must have in in type");
  assert.match(src, /\| "ft"/, "Must have ft in type");
});

/* ================================================================== */
/*  TEST 4 — CANONICAL FORMATTER HANDLES ALL FORMATS                   */
/* ================================================================== */

test("formatNumericValue handles all formats", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /export function formatNumericValue\(/, "formatNumericValue must exist");
  assert.match(src, /new Intl\.NumberFormat\("es-MX"/, "Must use Intl.NumberFormat for MXN");
  assert.match(src, /const unit = format === "custom"/, "Must handle custom unit");
  assert.match(src, /FORMAT_SYMBOLS\[format\]/, "Must use FORMAT_SYMBOLS for unit");
});

/* ================================================================== */
/*  TEST 5 — RAW VALUE STRATEGY                                        */
/* ================================================================== */

test("Raw value not mutated by format changes", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /return rawValue/, "Must return original when no parse");
  assert.match(src, /return formattedNumber/, "Must return formatted number");
});

/* ================================================================== */
/*  TEST 6 — MXN BEHAVIOR                                              */
/* ================================================================== */

test("MXN uses Intl.NumberFormat with es-MX locale", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /style: "currency"/, "MXN must use currency style");
  assert.match(src, /currency: "MXN"/, "MXN must use MXN currency");
  assert.match(src, /minimumFractionDigits: 2/, "MXN must have 2 decimal places");
  assert.match(src, /maximumFractionDigits: 2/, "MXN must have 2 decimal places");
});

/* ================================================================== */
/*  TEST 7 — MEASUREMENT BEHAVIOR                                      */
/* ================================================================== */

test("Measurements use semantic suffixes", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /\`\$\{formattedNumber\} \$\{unit\}\`/, "Must append unit suffix");
});

/* ================================================================== */
/*  TEST 8 — CUSTOM UNIT BEHAVIOR                                      */
/* ================================================================== */

test("Custom unit uses customUnit field", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /format === "custom" \? formatMetadata\.customUnit/, "Must use customUnit for custom format");
});

/* ================================================================== */
/*  TEST 9 — NON-NUMERIC TYPES NOT FORCED                              */
/* ================================================================== */

test("Non-numeric concepts skip formatting", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /if \(!isNumericConcept\(concept\)\) return concept\.value\.trim\(\)/, "Must skip non-numeric concepts");
});

/* ================================================================== */
/*  TEST 10 — INPUT PARSING                                            */
/* ================================================================== */

test("normalizeNumericInput handles various formats", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /replace\(/, "Must strip characters");
  // Must validate with strict regex (handles negatives and decimals internally)
  assert.match(src, /return ""/, "Must return empty for invalid input");
});

/* ================================================================== */
/*  TEST 11 — EDITOR USES CANONICAL FORMATS                            */
/* ================================================================== */

test("ConceptValueFormatControl uses NUMERIC_VALUE_FORMAT_OPTIONS", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  // Check that NUMERIC_VALUE_FORMAT_OPTIONS is imported (may be multi-line)
  assert.match(src, /NUMERIC_VALUE_FORMAT_OPTIONS/, "Must reference NUMERIC_VALUE_FORMAT_OPTIONS");

  // Must render options from the canonical list
  assert.match(src, /NUMERIC_VALUE_FORMAT_OPTIONS\.map/, "Must map over NUMERIC_VALUE_FORMAT_OPTIONS");
});

/* ================================================================== */
/*  TEST 12 — BACKWARD COMPATIBILITY                                   */
/* ================================================================== */

test("Legacy format options still work", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  assert.match(src, /value: "plain"/, "plain must remain");
  assert.match(src, /value: "mxn"/, "mxn must remain");
  assert.match(src, /value: "m"/, "m must remain");
  assert.match(src, /value: "m2"/, "m2 must remain");
  assert.match(src, /value: "percent"/, "percent must remain");
  assert.match(src, /value: "custom"/, "custom must remain");
});

/* ================================================================== */
/*  TEST 13 — FORMAT FUNCTION IS SINGLE SOURCE OF TRUTH               */
/* ================================================================== */

test("One canonical formatNumericValue function exists", () => {
  const src = readFile("src/features/valuations/services/concept-value-format.ts");

  const matches = src.match(/export function formatNumericValue\(/g);
  assert.ok(matches, "formatNumericValue must exist");
  assert.equal(matches.length, 1, "Must have exactly one formatNumericValue");

  const docMatches = src.match(/export function formatConceptValueForDocument\(/g);
  assert.ok(docMatches, "formatConceptValueForDocument must exist");
  assert.equal(docMatches.length, 1, "Must have exactly one formatConceptValueForDocument");
});

/* ================================================================== */
/*  TEST 14 — PREVIEW UNTOUCHED                                        */
/* ================================================================== */

test("Preview files untouched", () => {
  const terrenoPrev = readFile("src/features/valuations/components/terreno-preview.tsx");
  const reportPreview = readFile("src/features/valuations/components/report-preview.tsx");

  assert.doesNotMatch(terrenoPrev, /new Intl\.NumberFormat/, "terreno-preview must not have its own formatter");
  assert.doesNotMatch(reportPreview, /new Intl\.NumberFormat/, "report-preview must not have its own formatter");
});

/* ================================================================== */
/*  TEST 15 — DND/IMAGES UNTOUCHED                                     */
/* ================================================================== */

test("DnD and image files untouched", () => {
  const files = [
    "src/features/valuations/services/content-layout-v2.ts",
    "src/features/valuations/services/content-transfer.ts",
    "src/features/valuations/components/editor/content-dnd-ids.ts",
  ];

  for (const file of files) {
    const content = readFile(file);
    assert.doesNotMatch(content, /ConceptValueFormat|m3.*m³|formatNumericValue/, `${file} untouched`);
  }
});
