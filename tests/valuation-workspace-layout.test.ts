import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit extension for direct execution.
import { focusWorkspacePanels, getWorkspaceComposition } from "../src/features/valuations/components/workspace/valuation-workspace-layout.ts";

const workspaceSource = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-workspace.tsx", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-editor-panel.tsx", import.meta.url),
  "utf8",
);
const topBarSource = readFileSync(
  new URL("../src/features/valuations/components/workspace/valuation-top-bar.tsx", import.meta.url),
  "utf8",
);

test("desktop form plus preview mode reuses the existing vertical resize group", () => {
  assert.match(workspaceSource, /ResizablePanelGroup orientation="vertical"/);
  assert.ok(
    workspaceSource.indexOf('id="valuation-preview"') <
      workspaceSource.indexOf('id="valuation-editor"'),
  );
});

test("desktop preview-only mode renders preview directly without a split panel size", () => {
  assert.match(workspaceSource, /workspaceComposition\.showPreview && !workspaceComposition\.showEditor/);
});

test("workspace exposes exactly three top-bar view modes and removes the editor toggle", () => {
  assert.match(workspaceSource, /workspaceMode/);
  assert.match(workspaceSource, /handleWorkspaceModeChange/);
  assert.match(topBarSource, /Solo formulario/);
  assert.match(topBarSource, /Formulario y vista/);
  assert.match(topBarSource, /Solo vista/);
  assert.match(topBarSource, /left-1\/2/);
  assert.doesNotMatch(editorSource, /onWorkspaceModeChange/);
  assert.doesNotMatch(editorSource, /workspaceComposition\.toggleLabel/);
});

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
