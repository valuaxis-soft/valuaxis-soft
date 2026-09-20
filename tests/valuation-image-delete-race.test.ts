import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function readRemoveImageFn(): string {
  const src = readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );
  const start = src.indexOf("const removeImage = async (");
  assert.ok(start !== -1, "removeImage function must exist");
  // Find the end by locating the next top-level const after removeImage
  const nextConst = src.indexOf("\n  const ", start + 30);
  assert.ok(nextConst !== -1, "next const after removeImage must exist");
  return src.slice(start, nextConst);
}

function readWorkspace(): string {
  return readFileSync(
    join(root, "src/features/valuations/components/workspace/valuation-workspace.tsx"),
    "utf8",
  );
}

/* ================================================================== */
/*  TEST 1 — LOCAL STATE FIRST                                         */
/*  Optimistic removal must happen before the awaited API call.        */
/* ================================================================== */

test("removeImage: optimistic local removal happens before awaited API call", () => {
  const fn = readRemoveImageFn();

  const optimisticIdx = fn.indexOf("// Optimistic: remove from local state immediately");
  assert.ok(optimisticIdx !== -1, "Optimistic removal comment must exist");

  // Find the SECOND datosImages.delete (the one in the DATOS path, not terrain sketch)
  const firstDelete = fn.indexOf("await api.valuations.datosImages.delete(");
  assert.ok(firstDelete !== -1, "await datosImages.delete must exist");
  const secondDelete = fn.indexOf("await api.valuations.datosImages.delete(", firstDelete + 1);
  assert.ok(secondDelete !== -1, "Second await datosImages.delete (DATOS path) must exist");

  assert.ok(
    optimisticIdx < secondDelete,
    `Optimistic removal (pos ${optimisticIdx}) must precede DATOS await delete (pos ${secondDelete})`,
  );
});

/* ================================================================== */
/*  TEST 2 — SAVE DURING DELETE                                        */
/*  After optimistic removal, the image is absent from block.images.   */
/* ================================================================== */

test("removeImage: optimistic removal filters image from block.images immediately", () => {
  const fn = readRemoveImageFn();

  const optimisticIdx = fn.indexOf("// Optimistic: remove from local state immediately");
  const firstDelete = fn.indexOf("await api.valuations.datosImages.delete(");
  const secondDelete = fn.indexOf("await api.valuations.datosImages.delete(", firstDelete + 1);
  const between = fn.slice(optimisticIdx, secondDelete);

  // Must use filter to remove the image from block.images
  assert.match(
    between,
    /images: block\.images\.filter\(\(image\) => image\.id !== imageId\)/,
    "Optimistic block-level removal must filter image from block.images",
  );

  // Must also handle subBlock path
  assert.match(
    between,
    /images: subBlock\.images\.filter\(\(image\) => image\.id !== imageId\)/,
    "Optimistic subBlock-level removal must filter image from subBlock.images",
  );
});

/* ================================================================== */
/*  TEST 3 — SUCCESS                                                   */
/*  On successful delete: no rollback, no duplicate, no error toast.   */
/* ================================================================== */

test("removeImage: on success, no rollback or error toast after await", () => {
  const fn = readRemoveImageFn();

  // Find the DATOS catch block (after the optimistic removal)
  const optimisticIdx = fn.indexOf("// Optimistic: remove from local state immediately");
  const catchIdx = fn.indexOf("} catch (error) {\n        // Surgical rollback:", optimisticIdx);
  assert.ok(catchIdx !== -1, "catch block with surgical rollback must exist");

  // After the catch block closing, the DATOS branch must return
  const afterCatch = fn.slice(catchIdx);
  const catchReturn = afterCatch.indexOf("return;\n      }\n      return;\n    }");
  assert.ok(catchReturn !== -1, "catch must return, then DATOS branch must return (no double removal)");
});

/* ================================================================== */
/*  TEST 4 — FAILURE ROLLBACK                                          */
/*  On API failure: image restored, error toast shown.                 */
/* ================================================================== */

test("removeImage: on backend failure, surgical rollback restores image", () => {
  const fn = readRemoveImageFn();

  // Find the DATOS catch block
  const optimisticIdx = fn.indexOf("// Optimistic: remove from local state immediately");
  const catchIdx = fn.indexOf("} catch (error) {\n        // Surgical rollback:", optimisticIdx);
  assert.ok(catchIdx !== -1, "catch block with surgical rollback must exist");

  const catchBody = fn.slice(catchIdx, catchIdx + 1500);

  // Must re-insert the image at its original position
  assert.match(
    catchBody,
    /reinserted\.splice\(removedImage/,
    "Rollback must splice image back at original index",
  );

  // Must guard against duplicates
  assert.match(
    catchBody,
    /images\.some\(\(img\) => img\.id === imageId\)/,
    "Rollback must check for existing image to prevent duplicates",
  );

  // Must show error toast
  assert.match(
    catchBody,
    /toast\.error\(/,
    "Catch block must show error toast",
  );
});

/* ================================================================== */
/*  TEST 5 — MULTIPLE IMAGES                                           */
/*  Rollback must preserve original index for surgical re-insert.      */
/* ================================================================== */

test("removeImage: rollback preserves original index for surgical re-insert", () => {
  const fn = readRemoveImageFn();

  // Must capture the image and its index before removal
  const captureIdx = fn.indexOf("removedImage = { image: container.images[idx], index: idx");
  assert.ok(captureIdx !== -1, "Must capture image object and original index");

  // Must store inSubBlock flag
  const captureRegion = fn.slice(captureIdx, captureIdx + 100);
  assert.match(
    captureRegion,
    /inSubBlock: Boolean\(subBlockId\)/,
    "Must capture whether image is in a subBlock",
  );

  // Rollback must use the captured index
  const rollbackIdx = fn.indexOf("reinserted.splice(removedImage!.index, 0, removedImage!.image)");
  assert.ok(rollbackIdx !== -1, "Rollback must use captured index for splice");
});

/* ================================================================== */
/*  TEST 6 — TERRAIN SKETCH PRESERVED                                  */
/*  Terrain sketch behavior must not be changed.                       */
/* ================================================================== */

test("removeImage: terrain sketch path unchanged", () => {
  const fn = readRemoveImageFn();

  // Terrain sketch check must still exist
  assert.match(fn, /isTerrainSketch/, "isTerrainSketch check must exist");

  // Terrain sketch branch must clear src to empty string
  assert.match(
    fn,
    /image\.id === imageId \? \{ \.\.\.image, src: "" \}/,
    "Terrain sketch must clear image src to empty string",
  );

  // Terrain sketch must return after processing
  assert.match(
    fn,
    /return;\n    \}/,
    "Terrain sketch must return after processing",
  );
});

/* ================================================================== */
/*  TEST 7 — NON-DATOS PATH UNCHANGED                                  */
/*  Non-DATOS images must still use direct removal.                    */
/* ================================================================== */

test("removeImage: non-DATOS path unchanged", () => {
  const fn = readRemoveImageFn();

  // Non-DATOS path must exist after the DATOS branch
  const nonDatosIdx = fn.indexOf("// Non-DATOS path:");
  assert.ok(nonDatosIdx !== -1, "Non-DATOS comment must exist");

  const nonDatosBody = fn.slice(nonDatosIdx);

  // Must filter image from block.images
  assert.match(
    nonDatosBody,
    /images: block\.images\.filter\(\(image\) => image\.id !== imageId\)/,
    "Non-DATOS must filter image from block.images",
  );

  // Must also handle subBlock
  assert.match(
    nonDatosBody,
    /images: subBlock\.images\.filter\(\(image\) => image\.id !== imageId\)/,
    "Non-DATOS must filter image from subBlock.images",
  );
});

/* ================================================================== */
/*  TEST 8 — NO ORPHAN MERGE CHANGES                                   */
/*  mergeStoredImages must not be modified.                            */
/* ================================================================== */

test("mergeStoredImages unchanged", () => {
  const ws = readWorkspace();

  assert.match(ws, /function mergeStoredImages/, "mergeStoredImages must exist");
  assert.match(
    ws,
    /\[\.\.\.storedById\.values\(\)\]\.map/,
    "Orphan append behavior must be preserved",
  );
});

/* ================================================================== */
/*  TEST 9 — handleSave UNCHANGED                                      */
/*  handleSave must not be redesigned.                                 */
/* ================================================================== */

test("handleSave unchanged", () => {
  const ws = readWorkspace();

  assert.match(ws, /const handleSave = async/, "handleSave must exist");
  assert.match(
    ws,
    /const sectionsForSave = updateCompanyHeaderFields\(sections/,
    "handleSave must read sections from closure",
  );

  assert.match(
    ws,
    /images: \(s\.id === "caratula"[\s\S]*?b\.images\)\.map/,
    "Save payload must map from b.images",
  );
});

/* ================================================================== */
/*  TEST 10 — DND/CONTENTLAYOUT FILES UNTOUCHED                        */
/*  Verify no accidental changes to DnD or layout files.               */
/* ================================================================== */

test("DnD and ContentLayout files untouched", () => {
  const dndFiles = [
    "src/features/valuations/components/editor/content-dnd-ids.ts",
    "src/features/valuations/services/content-transfer.ts",
    "src/features/valuations/services/content-layout-v2-operations.ts",
    "src/features/valuations/services/content-layout-v2.ts",
    "src/features/valuations/components/editor/content-layout-v2-drop-target.tsx",
    "src/features/valuations/components/editor/block-flow-renderer.tsx",
  ];

  for (const file of dndFiles) {
    const content = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(
      content,
      /removeImage|datosImages\.delete/,
      `${file} must not reference removeImage or datosImages.delete`,
    );
  }
});
