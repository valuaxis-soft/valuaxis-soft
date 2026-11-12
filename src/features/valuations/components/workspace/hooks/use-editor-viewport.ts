import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { captureEditorPlace, restoreEditorPlace, type EditorPlace } from "../model/editor-place";

const EDITOR_ID = "valuation-form";
/** How long the editor rests before its place is taken down. */
const SAVE_DELAY_MS = 120;

/**
 * What the editor's viewport keeps:
 *  - The top bar stays on screen, as frozen panes in Excel (video 5.6, 3:15):
 *    only the editor and the preview scroll; if anything moves the workspace
 *    around them (a field brought into view, the browser following the
 *    cursor), it goes straight back.
 *  - Coming back to the editor from the preview or the dictamen, or after
 *    changing the layout, lands where it was (video 5.6, 12:14): each view
 *    mounts its own editor, which used to open at the top.
 */
export function useEditorViewport(workspaceRef: RefObject<HTMLElement | null>, sectionId: string) {
  const place = useRef<EditorPlace | null>(null);
  const editor = useRef<HTMLElement | null>(null);
  const section = useRef(sectionId);

  useEffect(() => {
    let timer: number | undefined;
    const save = () => {
      const form = document.getElementById(EDITOR_ID);
      if (form && form === editor.current) place.current = captureEditorPlace(form, section.current);
    };
    const saveSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, SAVE_DELAY_MS);
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      const workspace = workspaceRef.current;
      if (target instanceof HTMLElement && target.id === EDITOR_ID) {
        saveSoon();
        return;
      }
      // The workspace and the page around it never scroll.
      if (workspace && target instanceof Element && target !== workspace && target.contains(workspace) && target.scrollTop !== 0) {
        target.scrollTop = 0;
      } else if (workspace && target === workspace && workspace.scrollTop !== 0) {
        workspace.scrollTop = 0;
      } else if (target === document && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest(`#${EDITOR_ID}`)) saveSoon();
    };
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("focusin", onFocus);
    };
  }, [workspaceRef]);

  // Another section starts at its own top: the place belonged to the one left.
  useEffect(() => {
    if (section.current === sectionId) return;
    section.current = sectionId;
    place.current = null;
  }, [sectionId]);

  // After every render: a new editor element is a view coming back.
  useLayoutEffect(() => {
    const form = document.getElementById(EDITOR_ID);
    if (form === editor.current) return;
    editor.current = form;
    const saved = place.current;
    if (!form || !saved || saved.sectionId !== section.current) return;
    // The panels size themselves on the next frames.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (editor.current === form) restoreEditorPlace(form, saved);
    }));
  });
}
