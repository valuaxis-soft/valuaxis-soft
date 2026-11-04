import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  DESKTOP_WORKSPACE_QUERY,
  focusWorkspacePanels,
  getWorkspaceComposition,
  resolveWorkspaceMode,
  toCompactPane,
  type CompactPane,
  type SplitLayout,
  type WorkspaceMode,
} from "@/features/valuations/components/workspace/valuation-workspace-layout";
import { readStoredExternalPreview } from "./use-external-preview-sync";

const subscribeToNothing = () => () => {};

/** The view mode and the split chosen last time, kept in the browser so they come back after a reload. */
const WORKSPACE_MODE_KEY = "valuoWorkspaceMode";
const SPLIT_LAYOUT_KEY = "valuoSplitLayout";

const isWorkspaceMode = (value: unknown): value is WorkspaceMode => value === "form" || value === "split" || value === "preview";
const isSplitLayout = (value: unknown): value is SplitLayout => value === "horizontal" || value === "vertical" || value === "external";

export function readStoredWorkspaceLayout(): { mode: WorkspaceMode | null; splitLayout: SplitLayout | null } {
  try {
    const mode = localStorage.getItem(WORKSPACE_MODE_KEY);
    const splitLayout = localStorage.getItem(SPLIT_LAYOUT_KEY);
    return { mode: isWorkspaceMode(mode) ? mode : null, splitLayout: isSplitLayout(splitLayout) ? splitLayout : null };
  } catch {
    return { mode: null, splitLayout: null };
  }
}

function storeWorkspaceLayout(mode: WorkspaceMode, splitLayout: SplitLayout) {
  try {
    localStorage.setItem(WORKSPACE_MODE_KEY, mode);
    localStorage.setItem(SPLIT_LAYOUT_KEY, splitLayout);
  } catch {}
}

function subscribeToDesktopQuery(onChange: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_WORKSPACE_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

const getDesktopSnapshot = () => window.matchMedia(DESKTOP_WORKSPACE_QUERY).matches;
// SSR and the hydration render assume the compact layout; CSS hides the
// controls that do not apply, so there is no visible flash on desktop.
const getServerDesktopSnapshot = () => false;

/**
 * Workspace mode (form / preview / split), split layout, desktop breakpoint and
 * panel focus.
 *
 * `workspaceMode` is the mode being rendered. Below the desktop breakpoint it
 * is a single pane ("form" or "preview") picked with the compact toggle; the
 * desktop mode is remembered separately and restored when the viewport grows.
 */
export function useWorkspaceLayout() {
  const isDesktopWorkspace = useSyncExternalStore(
    subscribeToDesktopQuery,
    getDesktopSnapshot,
    getServerDesktopSnapshot,
  );
  // Always initialize with default values for hydration safety.
  // localStorage is read during render below to restore external preview state.
  const [desktopMode, setDesktopMode] = useState<WorkspaceMode>("form");
  const [compactPane, setCompactPane] = useState<CompactPane | null>(null);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("horizontal");
  const previewPanelRef = usePanelRef();
  const editorPanelRef = usePanelRef();

  // Growing back to desktop drops the small-screen pick, so the next time the
  // viewport shrinks the pane follows the desktop mode again.
  const [previousIsDesktop, setPreviousIsDesktop] = useState(isDesktopWorkspace);
  if (previousIsDesktop !== isDesktopWorkspace) {
    setPreviousIsDesktop(isDesktopWorkspace);
    if (isDesktopWorkspace) setCompactPane(null);
  }

  // Hydrate workspace mode from localStorage once on the client (adjusted
  // during render). `isClient` is false for SSR and the hydration render, so
  // server and first client render both use "form"/"horizontal" — no mismatch.
  const isClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [storedModeRestored, setStoredModeRestored] = useState(false);
  if (isClient && !storedModeRestored) {
    setStoredModeRestored(true);
    const stored = readStoredWorkspaceLayout();
    if (stored.mode) setDesktopMode(stored.mode);
    if (stored.splitLayout && stored.splitLayout !== "external") setSplitLayout(stored.splitLayout);
    if (readStoredExternalPreview()) {
      setDesktopMode("split");
      setSplitLayout("external");
    }
  }

  // What was chosen is remembered for the next time the editor opens.
  useEffect(() => {
    if (storedModeRestored) storeWorkspaceLayout(desktopMode, splitLayout);
  }, [desktopMode, splitLayout, storedModeRestored]);

  const workspaceMode = resolveWorkspaceMode({
    compactPane,
    desktopMode,
    isDesktop: isDesktopWorkspace,
  });

  const setWorkspaceMode = useCallback(
    (mode: WorkspaceMode) => {
      if (isDesktopWorkspace) {
        setDesktopMode(mode);
      } else {
        setCompactPane(toCompactPane(mode));
      }
    },
    [isDesktopWorkspace],
  );

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout === "external") return;
    focusWorkspacePanels(previewPanelRef.current, editorPanelRef.current);
  }, [splitLayout, workspaceMode, previewPanelRef, editorPanelRef]);

  const workspaceComposition = getWorkspaceComposition(workspaceMode, splitLayout);

  return {
    editorPanelRef,
    previewPanelRef,
    setSplitLayout,
    setWorkspaceMode,
    splitLayout,
    workspaceComposition,
    workspaceMode,
  };
}
