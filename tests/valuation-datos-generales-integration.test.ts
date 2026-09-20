import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readPanelSource(): string {
  return readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-editor-panel.tsx"),
    "utf8",
  );
}

/* ------------------------------------------------------------------ */
/*  No isDatosGenerales in content rendering                          */
/* ------------------------------------------------------------------ */

test("no isDatosGenerales branch selects EditableContentLayout", () => {
  const source = readPanelSource();
  // The old pattern was: isDatosGenerales ? <EditableContentLayout ...>
  // The new pattern is: the generic else branch renders EditableContentLayout
  // Verify no line has both "isDatosGenerales" and "<EditableContentLayout"
  const lines = source.split("\n");
  const badLine = lines.find(
    (l) => l.includes("isDatosGenerales") && l.includes("<EditableContentLayout"),
  );
  assert.equal(badLine, undefined, "no line combines isDatosGenerales with EditableContentLayout");
});

test("no isDatosGenerales guard on ConceptEditorList fallback", () => {
  const source = readPanelSource();
  assert.ok(
    !source.includes(": !isDatosGenerales ?") || !source.includes("<ConceptEditorList"),
    "ConceptEditorList fallback is not guarded by isDatosGenerales",
  );
});

test("no isDatosGenerales guard on TableEditors", () => {
  const source = readPanelSource();
  assert.ok(
    !source.includes("!isDatosGenerales && blockCapabilities.tables"),
    "TableEditors not guarded by isDatosGenerales",
  );
});

test("no isDatosGenerales guard on ImageEditors", () => {
  const source = readPanelSource();
  assert.ok(
    !source.includes("!isDatosGenerales && blockCapabilities.images"),
    "ImageEditors not guarded by isDatosGenerales",
  );
});

/* ------------------------------------------------------------------ */
/*  Specialized branches preserved                                    */
/* ------------------------------------------------------------------ */

test("carátula assumptions branch preserved with LongTextConceptEditor", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes('caratulaBlockKind === "assumptions"') && source.includes("<LongTextConceptEditor"),
    "assumptions branch preserved",
  );
});

test("carátula conclusion branch preserved", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes('caratulaBlockKind === "conclusion"'),
    "conclusion branch preserved",
  );
});

test("TerrenoElementsEditor preserved", () => {
  const source = readPanelSource();
  assert.ok(source.includes("<TerrenoElementsEditor"), "TerrenoElementsEditor preserved");
});

test("CaratulaEditor preserved", () => {
  const source = readPanelSource();
  assert.ok(source.includes("<CaratulaEditor"), "CaratulaEditor preserved");
});

/* ------------------------------------------------------------------ */
/*  Standalone TableEditors/ImageEditors only for carátula            */
/* ------------------------------------------------------------------ */

test("no standalone TableEditors or ImageEditors remain in JSX", () => {
  const source = readPanelSource();
  const lines = source.split("\n");
  const tableEditorsJsx = lines.filter(
    (l) => l.includes("<TableEditors") && !l.includes("import"),
  );
  const imageEditorsJsx = lines.filter(
    (l) => l.includes("<ImageEditors") && !l.includes("import"),
  );
  assert.equal(tableEditorsJsx.length, 0, "TableEditors not used in JSX");
  assert.equal(imageEditorsJsx.length, 0, "ImageEditors not used in JSX");
});

/* ------------------------------------------------------------------ */
/*  Title display isDatosGenerales preserved                          */
/* ------------------------------------------------------------------ */

test("title display uses generic stripLeadingRomanNumeral for all blocks", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes("title={stripLeadingRomanNumeral(block.title)}"),
    "title display applies stripLeadingRomanNumeral unconditionally (generic rule)",
  );
});

/* ------------------------------------------------------------------ */
/*  getBlockEditorCapabilities no longer receives isDatosGenerales    */
/* ------------------------------------------------------------------ */

test("getBlockEditorCapabilities does not receive isDatosGenerales", () => {
  const source = readPanelSource();
  // Find the getBlockEditorCapabilities call
  const callMatch = source.match(/getBlockEditorCapabilities\(\{[\s\S]*?\}\)/);
  if (callMatch) {
    assert.ok(
      !callMatch[0].includes("isDatosGenerales"),
      "isDatosGenerales not passed to getBlockEditorCapabilities",
    );
  }
});

test("clave field uses isIntermediateCaratulaBlock (carátula-only)", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes("{isIntermediateCaratulaBlock ?") && source.includes("Clave"),
    "clave field condition is isIntermediateCaratulaBlock",
  );
  assert.ok(
    !source.includes("caratulaBlockKind === \"intermediate\" && !isFixedTerreno && !isDatosGenerales"),
    "old multi-condition clave guard removed",
  );
});

test("SubBlock conceptCallbacks wire to onRemoveSubConcept/onUpdateSubConcept", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes("onRemoveSubConcept") && source.includes("conceptCallbacks"),
    "conceptCallbacks wired to subblock concept operations",
  );
});

test("SubBlock imageCallbacks wire to onRemoveImage/onUpdateImage with subBlock.id", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes("onRemoveImage(section.id, block.id, imageId, subBlock.id)") &&
    source.includes("imageCallbacks"),
    "imageCallbacks wired to subblock image operations",
  );
});

test("SubBlock tableCallbacks wire to onAddTableColumn with subBlock.id", () => {
  const source = readPanelSource();
  assert.ok(
    source.includes("onAddTableColumn(section.id, block.id, tableId, subBlock.id)") &&
    source.includes("tableCallbacks"),
    "tableCallbacks wired to subblock table operations",
  );
});

test("no old generic ConceptEditorList + TableEditors + ImageEditors in SubBlock content", () => {
  const source = readPanelSource();
  // Verify ConceptEditorList is not used in JSX (only in import for LongTextConceptEditor)
  const lines = source.split("\n");
  const conceptEditorListJsx = lines.filter(
    (l) => l.includes("<ConceptEditorList") && !l.includes("import"),
  );
  assert.equal(conceptEditorListJsx.length, 0, "ConceptEditorList not used in JSX");
});

test("no standalone TableEditors or ImageEditors in entire file", () => {
  const source = readPanelSource();
  const lines = source.split("\n");
  const tableEditorsJsx = lines.filter(
    (l) => l.includes("<TableEditors") && !l.includes("import"),
  );
  const imageEditorsJsx = lines.filter(
    (l) => l.includes("<ImageEditors") && !l.includes("import"),
  );
  assert.equal(tableEditorsJsx.length, 0, "TableEditors not used in JSX anywhere");
  assert.equal(imageEditorsJsx.length, 0, "ImageEditors not used in JSX anywhere");
});
