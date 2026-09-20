import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

/* ================================================================== */
/*  TEST 1 — EMPTY RESOURCE CONTRACT                                   */
/* ================================================================== */

test("ImageEditorItem: empty src does not render <img src=\"\">", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  // Must derive hasResource from image.src
  assert.match(src, /const hasResource = Boolean\(image\.src\)/, "Must derive hasResource");

  // Must use hasResource ternary for thumbnail
  assert.match(src, /\{hasResource \?/, "Must conditionally render based on hasResource");

  // ImageIcon placeholder for empty state
  assert.match(src, /<ImageIcon className="size-6 text-muted-foreground\/50" \/>/, "Must render ImageIcon placeholder");

  // img tag only when resource present
  assert.match(src, /<img className="size-16 rounded-md object-cover" src=\{image\.src\}/, "Must render img with src");
});

/* ================================================================== */
/*  TEST 2 — CAPTION FIELDS IN MODEL                                   */
/* ================================================================== */

test("ImageContent: caption fields are optional", () => {
  const src = readFile("src/features/valuations/model.ts");

  assert.match(src, /captionText\?: string/, "captionText must be optional string");
  assert.match(src, /captionEnabled\?: boolean/, "captionEnabled must be optional boolean");
  assert.match(src, /captionPosition\?: ImageCaptionPosition/, "captionPosition must use type");
  assert.match(src, /captionAlign\?: ImageCaptionAlign/, "captionAlign must use type");
  assert.match(src, /export type ImageCaptionPosition = "top" \| "bottom"/, "ImageCaptionPosition type");
  assert.match(src, /export type ImageCaptionAlign = "left" \| "center" \| "right"/, "ImageCaptionAlign type");
});

/* ================================================================== */
/*  TEST 3 — METADATA SERIALIZATION                                    */
/* ================================================================== */

test("imageMetadataFromContent: serializes caption fields", () => {
  const src = readFile("src/features/valuations/metadata.ts");

  assert.match(src, /captionText: content\.captionText/, "Must serialize captionText");
  assert.match(src, /captionEnabled: content\.captionEnabled/, "Must serialize captionEnabled");
  assert.match(src, /captionPosition: content\.captionPosition/, "Must serialize captionPosition");
  assert.match(src, /captionAlign: content\.captionAlign/, "Must serialize captionAlign");
});

/* ================================================================== */
/*  TEST 4 — METADATA HYDRATION                                        */
/* ================================================================== */

test("hydrateImageMetadata: hydrates caption fields", () => {
  const src = readFile("src/features/valuations/metadata.ts");

  assert.match(src, /captionText: imageCaptionText\(config\)/, "Must hydrate captionText");
  assert.match(src, /captionEnabled: imageCaptionEnabled\(config\)/, "Must hydrate captionEnabled");
  assert.match(src, /captionPosition: imageCaptionPosition\(config\)/, "Must hydrate captionPosition");
  assert.match(src, /captionAlign: imageCaptionAlign\(config\)/, "Must hydrate captionAlign");
});

/* ================================================================== */
/*  TEST 5 — CAPTION HELPERS EXIST                                    */
/* ================================================================== */

test("caption hydration helpers exist", () => {
  const src = readFile("src/features/valuations/metadata.ts");

  assert.match(src, /function imageCaptionText\(/, "imageCaptionText helper must exist");
  assert.match(src, /function imageCaptionEnabled\(/, "imageCaptionEnabled helper must exist");
  assert.match(src, /function imageCaptionPosition\(/, "imageCaptionPosition helper must exist");
  assert.match(src, /function imageCaptionAlign\(/, "imageCaptionAlign helper must exist");
});

/* ================================================================== */
/*  TEST 6 — IMAGE METADATA TYPE INCLUDES CAPTION                      */
/* ================================================================== */

test("ImageMetadata type includes caption fields", () => {
  const src = readFile("src/features/valuations/metadata.ts");

  assert.match(src, /captionText\?: string/, "ImageMetadata must have captionText");
  assert.match(src, /captionEnabled\?: boolean/, "ImageMetadata must have captionEnabled");
  assert.match(src, /captionPosition\?: "top" \| "bottom"/, "ImageMetadata must have captionPosition");
  assert.match(src, /captionAlign\?: "left" \| "center" \| "right"/, "ImageMetadata must have captionAlign");
});

/* ================================================================== */
/*  TEST 7 — CAPTION CONTROLS IN EDITOR                               */
/* ================================================================== */

test("ImageEditorItem renders CaptionControls", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /function CaptionControls\(/, "CaptionControls component must exist");
  assert.match(src, /<CaptionControls/, "ImageEditorItem must render CaptionControls");
});

/* ================================================================== */
/*  TEST 8 — CAPTION CHECKBOX                                          */
/* ================================================================== */

test("CaptionControls: checkbox toggles captionEnabled", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /type="checkbox"/, "Must have checkbox input");
  assert.match(src, /checked=\{captionEnabled\}/, "Checkbox must bind to captionEnabled");
  assert.match(src, /onChange=\{\(e\) => onUpdate\(image\.id, \{ captionEnabled: e\.target\.checked \}\)\}/, "Checkbox must call onUpdate");
});

/* ================================================================== */
/*  TEST 9 — CAPTION TEXT INPUT                                        */
/* ================================================================== */

test("CaptionControls: text input edits captionText", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /placeholder="Texto de leyenda"/, "Must have caption text input");
  assert.match(src, /value=\{image\.captionText \?\? ""\}/, "Must bind to captionText");
  assert.match(src, /onChange=\{\(e\) => onUpdate\(image\.id, \{ captionText: e\.target\.value \}\)\}/, "Must call onUpdate with captionText");
});

/* ================================================================== */
/*  TEST 10 — CAPTION POSITION/ALIGN SELECTS                          */
/* ================================================================== */

test("CaptionControls: position and alignment selects", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /value=\{image\.captionPosition \?\? "bottom"\}/, "Position must default to bottom");
  assert.match(src, /NativeSelectOption value="bottom">Abajo/, "Position must have bottom option");
  assert.match(src, /NativeSelectOption value="top">Arriba/, "Position must have top option");
  assert.match(src, /value=\{image\.captionAlign \?\? "center"\}/, "Alignment must default to center");
  assert.match(src, /NativeSelectOption value="center">Centro/, "Alignment must have center option");
  assert.match(src, /NativeSelectOption value="left">Izq/, "Alignment must have left option");
  assert.match(src, /NativeSelectOption value="right">Der/, "Alignment must have right option");
});

/* ================================================================== */
/*  TEST 11 — BACKWARD COMPATIBILITY                                  */
/* ================================================================== */

test("backward compat: legacy image without caption fields", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /captionEnabled \?\? false/, "Must default captionEnabled to false");
  assert.match(src, /image\.captionText \?\? ""/, "Must default captionText to empty");
  assert.match(src, /image\.captionPosition \?\? "bottom"/, "Must default position to bottom");
  assert.match(src, /image\.captionAlign \?\? "center"/, "Must default align to center");
});

/* ================================================================== */
/*  TEST 12 — TITLE NOT MUTATED BY CAPTION                             */
/* ================================================================== */

test("caption controls do not mutate title", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  // Extract CaptionControls function body
  const captionIdx = src.indexOf("function CaptionControls({");
  assert.ok(captionIdx !== -1, "CaptionControls must exist");
  const captionBody = src.slice(captionIdx, src.indexOf("\n}", captionIdx) + 2);

  assert.doesNotMatch(captionBody, /title:/, "CaptionControls must not include title in patches");
  assert.doesNotMatch(captionBody, /image\.title/, "CaptionControls must not read image.title");
});

/* ================================================================== */
/*  TEST 13 — SIZE SYSTEM UNCHANGED                                    */
/* ================================================================== */

test("size system unchanged", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  assert.match(src, /export function ImageDocumentSizeControl\(/, "ImageDocumentSizeControl must exist");
  assert.match(src, /resolveImageWidthPercent/, "Must use resolveImageWidthPercent");
  assert.match(src, /"Tamaño normal"/, "Must have normal preset");
  assert.match(src, /"Tamaño amplio"/, "Must have wide preset");
  assert.match(src, /"Ancho completo"/, "Must have full preset");
});

/* ================================================================== */
/*  TEST 14 — NO TERRAIN-SPECIFIC CODE IN EDITOR                      */
/* ================================================================== */

test("ImageEditorItem: no terrain-specific code", () => {
  const src = readFile("src/features/valuations/components/editor/image-editor.tsx");

  const editorIdx = src.indexOf("export function ImageEditorItem({");
  const editorEnd = src.indexOf("\n}\n", editorIdx);
  const editorBody = src.slice(editorIdx, editorEnd + 2);

  assert.doesNotMatch(editorBody, /terrain|terreno|macro|micro/i, "ImageEditorItem must not contain terrain-specific code");
});

/* ================================================================== */
/*  TEST 15 — TERRAIN SLOT UNTOUCHED IN MODEL                         */
/* ================================================================== */

test("terrainSlot remains in ImageContent model", () => {
  const src = readFile("src/features/valuations/model.ts");

  assert.match(src, /terrainSlot\?: "macro" \| "micro"/, "terrainSlot must remain in ImageContent");
});

/* ================================================================== */
/*  TEST 16 — PREVIEW/PDF UNTOUCHED                                    */
/* ================================================================== */

test("DocumentImage and terreno-preview untouched", () => {
  const docImg = readFile("src/features/valuations/components/document-image.tsx");
  const terrenoPrev = readFile("src/features/valuations/components/terreno-preview.tsx");

  assert.doesNotMatch(docImg, /captionText|captionEnabled|captionPosition|captionAlign/, "DocumentImage untouched");
  assert.doesNotMatch(terrenoPrev, /captionText|captionEnabled|captionPosition|captionAlign/, "terreno-preview untouched");
});

/* ================================================================== */
/*  TEST 17 — CONTENTLAYOUT/DND UNTOUCHED                              */
/* ================================================================== */

test("ContentLayout and DnD files untouched", () => {
  const files = [
    "src/features/valuations/services/content-layout-v2.ts",
    "src/features/valuations/services/content-layout-v2-operations.ts",
    "src/features/valuations/components/editor/content-dnd-ids.ts",
    "src/features/valuations/services/content-transfer.ts",
  ];

  for (const file of files) {
    const content = readFile(file);
    assert.doesNotMatch(content, /captionText|captionEnabled|captionPosition|captionAlign/, `${file} untouched`);
  }
});

/* ================================================================== */
/*  TEST 18 — EXPORTED TYPES                                           */
/* ================================================================== */

test("caption types are exported", () => {
  const src = readFile("src/features/valuations/model.ts");

  assert.match(src, /export type ImageCaptionPosition/, "ImageCaptionPosition must be exported");
  assert.match(src, /export type ImageCaptionAlign/, "ImageCaptionAlign must be exported");
});
