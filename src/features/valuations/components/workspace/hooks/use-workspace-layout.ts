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
    if (readStoredExternalPreview()) {
      setDesktopMode("split");
      setSplitLayout("external");
    }
  }

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
    focusWorkspacePanels(previewPanelRef.current, editorPanelRef.current, splitLayout);
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
