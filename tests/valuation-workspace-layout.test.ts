import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit extension for direct execution.
import { focusWorkspacePanels, getWorkspaceComposition } from "../src/features/valuations/components/workspace/valuation-workspace-layout.ts";

test("workspace modes map to form-only, split, and preview-only compositions", () => {
  assert.deepEqual(getWorkspaceComposition("form"), {
    showEditor: true,
    showPreview: false,
    showSplitter: false,
  });
  assert.deepEqual(getWorkspaceComposition("split"), {
    showEditor: true,
    showPreview: true,
    showSplitter: true,
  });
  assert.deepEqual(getWorkspaceComposition("preview"), {
    showEditor: false,
    showPreview: true,
    showSplitter: false,
  });
});

test("workspace focus applies the visualization split to existing panels", () => {
  const previewCalls: Array<number | string> = [];
  const editorCalls: Array<number | string> = [];
  const previewPanel = { resize: (size: number | string) => previewCalls.push(size) };
  const editorPanel = { resize: (size: number | string) => editorCalls.push(size) };

  assert.deepEqual(
    focusWorkspacePanels(previewPanel as never, editorPanel as never),
    { previewSize: "42%", editorSize: "58%" },
  );
  assert.deepEqual(previewCalls, ["42%"]);
  assert.deepEqual(editorCalls, ["58%"]);
});
