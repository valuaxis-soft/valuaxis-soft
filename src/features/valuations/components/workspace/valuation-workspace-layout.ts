import type { PanelImperativeHandle } from "react-resizable-panels";

export type WorkspaceMode = "form" | "split" | "preview";
export type SplitLayout = "horizontal" | "vertical" | "external";
/** Below the desktop breakpoint only one pane is shown at a time. */
export type CompactPane = Exclude<WorkspaceMode, "split">;

/** Same width as Tailwind's `lg` breakpoint (64rem). */
export const DESKTOP_WORKSPACE_QUERY = "(min-width: 1024px)";

export function getWorkspaceComposition(mode: WorkspaceMode, splitLayout: SplitLayout = "horizontal") {
  const isExternalSplit = mode === "split" && splitLayout === "external";

  return {
    showEditor: mode !== "preview",
    showPreview: mode !== "form" && !isExternalSplit,
    showSplitter: mode === "split" && !isExternalSplit,
  };
}

/** Single pane equivalent of a mode: the split modes open on the editor. */
export function toCompactPane(mode: WorkspaceMode): CompactPane {
  return mode === "preview" ? "preview" : "form";
}

/**
 * Mode actually rendered. On desktop it is the user's desktop mode; on small
 * screens it is the pane picked there (or the one derived from the desktop
 * mode), never split. The desktop mode is left untouched so it comes back when
 * the viewport grows again.
 */
export function resolveWorkspaceMode({
  compactPane,
  desktopMode,
  isDesktop,
}: {
  compactPane: CompactPane | null;
  desktopMode: WorkspaceMode;
  isDesktop: boolean;
}): WorkspaceMode {
  if (isDesktop) return desktopMode;
  return compactPane ?? toCompactPane(desktopMode);
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
