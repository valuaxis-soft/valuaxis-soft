import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/* ================================================================== */
/*  TEST 1 — CANONICAL CONCEPT HAS ONE 3-DOT MENU                     */
/* ================================================================== */

test("Concept has one 3-dot actions menu", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function ConceptOptionsMenu\(/, "ConceptOptionsMenu must exist");
  assert.match(src, /<EllipsisVertical \/>/, "Must have EllipsisVertical icon");
  assert.match(src, /<ConceptOptionsMenu/, "Must be rendered in ConceptEditorRow");
});

/* ================================================================== */
/*  TEST 2 — DELETE ACTION ROUTES THROUGH CANONICAL HANDLER            */
/* ================================================================== */

test("Delete action routes through canonical handler", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /Eliminar concepto/, "Must have delete label");
  assert.match(src, /onClick=\{\(\) => onRemove\(concept\.id\)\}/, "Delete must call onRemove");
});

/* ================================================================== */
/*  TEST 3 — WIDTH/LAYOUT ACTION REMAINS AVAILABLE                     */
/* ================================================================== */

test("Width/layout action remains available", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /Compartir renglón/, "Must have half-width label");
  assert.match(src, /Usar ancho completo/, "Must have full-width label");
  assert.match(src, /layoutSpan: usesFullWidth \? "half" : "full"/, "Must toggle layoutSpan");
});

/* ================================================================== */
/*  TEST 4 — SPACING CONTROL REPRESENTED AS SPACING BELOW              */
/* ================================================================== */

test("Spacing control is spacing below", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function ConceptSpacingInline\(/, "ConceptSpacingInline must exist");
  assert.match(src, /spacingAfter/, "Must use spacingAfter");

  const inlineIdx = src.indexOf("function ConceptSpacingInline({");
  const inlineBody = src.slice(inlineIdx, src.indexOf("\n}\n", inlineIdx) + 2);
  assert.doesNotMatch(inlineBody, /spacingBefore/, "Must not use spacingBefore in control");
});

/* ================================================================== */
/*  TEST 5 — DECREMENT CANNOT PRODUCE NEGATIVE SPACING                 */
/* ================================================================== */

test("Decrement cannot produce negative spacing", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /Math\.max\(0, value\)/, "Must clamp spacing to >= 0");
  assert.match(src, /disabled=\{readOnly \|\| spacingAfter <= 0\}/, "Decrement must be disabled at 0");
});

/* ================================================================== */
/*  TEST 6 — INCREMENT UPDATES ONLY CANONICAL SPACING                  */
/* ================================================================== */

test("Increment updates only canonical spacing", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /spacingAfter: Math\.max\(0, value\)/, "Must update spacingAfter");
});

/* ================================================================== */
/*  TEST 7 — NO NEW DND/LAYOUT ENGINE INTRODUCED                       */
/* ================================================================== */

test("No new DnD/layout engine introduced", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.doesNotMatch(src, /import.*from.*@dnd-kit\/react/, "Must not import new DnD libraries");
  assert.match(src, /groupConceptsIntoRows/, "Must use existing concept-layout");
  assert.match(src, /moveConceptIntoRows/, "Must use existing concept-layout");
});

/* ================================================================== */
/*  TEST 8 — FORMAT/UNIT ACCESS REMAINS AVAILABLE                       */
/* ================================================================== */

test("Format/unit access remains available", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function ConceptValueFormatControl\(/, "ConceptValueFormatControl must exist");
  assert.match(src, /<ConceptValueFormatControl/, "Must be rendered in menu");
});

/* ================================================================== */
/*  TEST 9 — LINKING BEHAVIOR UNTOUCHED                                */
/* ================================================================== */

test("Linking behavior untouched", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function ConceptLinkStatus\(/, "ConceptLinkStatus must exist");
  assert.match(src, /Vincular concepto/, "Must have link action");
  assert.match(src, /Desvincular/, "Must have unlink action");
});

/* ================================================================== */
/*  TEST 10 — PREVIEW UNTOUCHED                                        */
/* ================================================================== */

test("Preview untouched", () => {
  const preview = readFile("src/features/valuations/components/terreno-preview.tsx");
  const reportPreview = readFile("src/features/valuations/components/report-preview.tsx");

  assert.doesNotMatch(preview, /ConceptSpacingInline|ConceptOptionsMenu/, "terreno-preview untouched");
  assert.doesNotMatch(reportPreview, /ConceptSpacingInline|ConceptOptionsMenu/, "report-preview untouched");
});

/* ================================================================== */
/*  TEST 11 — INFO TERRENO UNTOUCHED (concept-editor not modified)     */
/* ================================================================== */

test("INFO TERRENO concept editing untouched", () => {
  // The terreno-editor.tsx uses ConceptEditorList from concept-editor.tsx
  // but the concept-editor.tsx changes are generic, not terreno-specific
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  // ConceptOptionsMenu must not reference terrain concepts
  const menuIdx = src.indexOf("function ConceptOptionsMenu({");
  const menuBody = src.slice(menuIdx, src.indexOf("\n}\n", menuIdx) + 2);
  assert.doesNotMatch(menuBody, /terrain|terreno|macro|micro/i, "ConceptOptionsMenu must not contain terrain-specific code");
});

/* ================================================================== */
/*  TEST 12 — SPACING MODEL BEFORE/AFTER                               */
/* ================================================================== */

test("Concept model has spacingBefore and spacingAfter fields", () => {
  const src = readFile("src/features/valuations/model.ts");

  assert.match(src, /spacingBefore\?: number/, "Concept must have spacingBefore");
  assert.match(src, /spacingAfter\?: number/, "Concept must have spacingAfter");
});

/* ================================================================== */
/*  TEST 13 — SPACING METADATA PRESERVED                               */
/* ================================================================== */

test("ConceptMetadata preserves both spacing fields", () => {
  const src = readFile("src/features/valuations/metadata.ts");

  assert.match(src, /spacingBefore\?: number/, "ConceptMetadata must have spacingBefore");
  assert.match(src, /spacingAfter\?: number/, "ConceptMetadata must have spacingAfter");
});

/* ================================================================== */
/*  TEST 14 — SINGLE-LINE FORM BEHAVIOR                                */
/* ================================================================== */

test("Single-line form behavior uses type field", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function isSingleLineConceptType\(/, "isSingleLineConceptType must exist");
  assert.match(src, /isSingleLineConceptType\(conceptType\)/, "Must check concept type for single-line");
});

/* ================================================================== */
/*  TEST 15 — FORMAT/UNIT PRESERVED                                     */
/* ================================================================== */

test("Format/unit behavior preserved", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  assert.match(src, /function ConceptValueFormatControl\(/, "ConceptValueFormatControl must exist");
  assert.match(src, /NUMERIC_VALUE_FORMAT_OPTIONS/, "Must use format options");
});

/* ================================================================== */
/*  TEST 16 — DRAG HANDLE REMAINS VISIBLE                              */
/* ================================================================== */

test("Drag handle remains visible and separate from menu", () => {
  const src = readFile("src/features/valuations/components/editor/concept-editor.tsx");

  // Must have drag handle with ArrowUpDown
  assert.match(src, /<ArrowUpDown \/>/, "Must have ArrowUpDown drag handle");

  // Must use useDraggable
  assert.match(src, /useDraggable/, "Must use useDraggable");
});
