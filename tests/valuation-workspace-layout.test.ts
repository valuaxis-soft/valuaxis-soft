import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node strip-types requires the explicit extension for direct execution.
import { focusWorkspacePanels, getWorkspaceComposition, resolveWorkspaceMode, toCompactPane, DESKTOP_WORKSPACE_QUERY } from "../src/features/valuations/components/workspace/valuation-workspace-layout.ts";

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

test("the desktop query matches Tailwind's lg breakpoint", () => {
  assert.equal(DESKTOP_WORKSPACE_QUERY, "(min-width: 1024px)");
});

test("on desktop the rendered mode is the desktop mode, whatever was picked on a small screen", () => {
  for (const desktopMode of ["form", "split", "preview"] as const) {
    assert.equal(resolveWorkspaceMode({ compactPane: null, desktopMode, isDesktop: true }), desktopMode);
    assert.equal(resolveWorkspaceMode({ compactPane: "preview", desktopMode, isDesktop: true }), desktopMode);
    assert.equal(resolveWorkspaceMode({ compactPane: "form", desktopMode, isDesktop: true }), desktopMode);
  }
});

test("below lg one pane is shown and split never is", () => {
  assert.equal(resolveWorkspaceMode({ compactPane: null, desktopMode: "form", isDesktop: false }), "form");
  assert.equal(resolveWorkspaceMode({ compactPane: null, desktopMode: "split", isDesktop: false }), "form");
  assert.equal(resolveWorkspaceMode({ compactPane: null, desktopMode: "preview", isDesktop: false }), "preview");
  assert.equal(resolveWorkspaceMode({ compactPane: "preview", desktopMode: "split", isDesktop: false }), "preview");
  assert.equal(resolveWorkspaceMode({ compactPane: "form", desktopMode: "preview", isDesktop: false }), "form");

  for (const desktopMode of ["form", "split", "preview"] as const) {
    for (const compactPane of [null, "form", "preview"] as const) {
      const mode = resolveWorkspaceMode({ compactPane, desktopMode, isDesktop: false });
      assert.notEqual(mode, "split");
      assert.equal(getWorkspaceComposition(mode, "external").showSplitter, false);
    }
  }
});

test("modes map to a single pane: split opens on the editor", () => {
  assert.equal(toCompactPane("form"), "form");
  assert.equal(toCompactPane("split"), "form");
  assert.equal(toCompactPane("preview"), "preview");
});
