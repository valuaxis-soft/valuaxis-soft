import { useEffect, type RefObject } from "react";

import { isMarginWheel, wheelPixels } from "../model/margin-wheel";

/** Sends the wheel turned over the workspace's margins to the editor, or to the preview's pages when the editor is not shown. */
export function useMarginWheel(workspaceRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const onWheel = (event: WheelEvent) => {
      // Ctrl + wheel is the browser's zoom.
      if (event.ctrlKey || event.deltaY === 0) return;
      const editor = document.getElementById("valuation-form");
      const preview = document.getElementById("valuation-preview");
      const topBar = workspace.querySelector("[data-workspace-top-bar]");
      if (!isMarginWheel(event.target instanceof Node ? event.target : null, [editor, preview, topBar])) return;
      const scroller = editor ?? preview?.querySelector<HTMLElement>("[data-preview-scroller]") ?? null;
      if (!scroller) return;
      scroller.scrollBy({ top: wheelPixels(event, scroller.clientHeight) });
    };
    workspace.addEventListener("wheel", onWheel, { passive: true });
    return () => workspace.removeEventListener("wheel", onWheel);
  }, [workspaceRef]);
}
