import type { PanelImperativeHandle } from "react-resizable-panels";

export type WorkspaceMode = "form" | "split" | "preview";
export type SplitLayout = "horizontal" | "vertical" | "external";

export function getWorkspaceComposition(mode: WorkspaceMode, splitLayout: SplitLayout = "horizontal") {
  const isExternalSplit = mode === "split" && splitLayout === "external";

  return {
    showEditor: mode !== "preview",
    showPreview: mode !== "form" && !isExternalSplit,
    showSplitter: mode === "split" && !isExternalSplit,
  };
}

export function focusWorkspacePanels(
  previewPanel: PanelImperativeHandle | null,
  editorPanel: PanelImperativeHandle | null,
  splitLayout: SplitLayout = "horizontal",
) {
  const previewSize = splitLayout === "vertical" ? "50%" : "42%";
  const editorSize = splitLayout === "vertical" ? "50%" : "58%";
  previewPanel?.resize(previewSize);
  editorPanel?.resize(editorSize);
  return { previewSize, editorSize };
}
