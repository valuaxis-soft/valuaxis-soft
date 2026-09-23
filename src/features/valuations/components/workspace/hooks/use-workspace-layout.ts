import { useEffect, useState, useSyncExternalStore } from "react";
import { usePanelRef } from "react-resizable-panels";

import {
  focusWorkspacePanels,
  getWorkspaceComposition,
  type SplitLayout,
  type WorkspaceMode,
} from "@/features/valuations/components/workspace/valuation-workspace-layout";
import { readStoredExternalPreview } from "./use-external-preview-sync";

const subscribeToNothing = () => () => {};

/** Workspace mode (form / preview / split), split layout, desktop breakpoint and panel focus. */
export function useWorkspaceLayout() {
  const [isDesktopWorkspace, setIsDesktopWorkspace] = useState(false);
  // Always initialize with default values for hydration safety.
  // localStorage is read during render below to restore external preview state.
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("form");
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("horizontal");
  const previewPanelRef = usePanelRef();
  const editorPanelRef = usePanelRef();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateLayout = () => setIsDesktopWorkspace(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  // Hydrate workspace mode from localStorage once on the client (adjusted
  // during render). `isClient` is false for SSR and the hydration render, so
  // server and first client render both use "form"/"horizontal" — no mismatch.
  const isClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [storedModeRestored, setStoredModeRestored] = useState(false);
  if (isClient && !storedModeRestored) {
    setStoredModeRestored(true);
    if (readStoredExternalPreview()) {
      setWorkspaceMode("split");
      setSplitLayout("external");
    }
  }

  useEffect(() => {
    if (workspaceMode !== "split" || splitLayout === "external") return;
    if (isDesktopWorkspace) {
      focusWorkspacePanels(previewPanelRef.current, editorPanelRef.current, splitLayout);
      return;
    }
    document.getElementById("valuation-preview")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [isDesktopWorkspace, splitLayout, workspaceMode, previewPanelRef, editorPanelRef]);

  const workspaceComposition = getWorkspaceComposition(workspaceMode, splitLayout);

  return {
    editorPanelRef,
    isDesktopWorkspace,
    previewPanelRef,
    setSplitLayout,
    setWorkspaceMode,
    splitLayout,
    workspaceComposition,
    workspaceMode,
  };
}
