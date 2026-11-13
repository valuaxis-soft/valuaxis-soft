"use client";

import { useEffect } from "react";

/**
 * A press that starts inside an open popover and ends outside it (selecting
 * the text typed in its search box and letting go past its edge) does not
 * close it: only a press that starts outside does (Álvaro, video 5.6,
 * 11 nov 2026: «se me cierra el recuadro»). The popovers that keep it also
 * have an X to close them.
 */

const POPOVER_POPUP = '[data-slot="popover-content"]';

let pressStartedInPopover = false;
let listening = false;

function listen() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      pressStartedInPopover = event.target instanceof Element && event.target.closest(POPOVER_POPUP) !== null;
    },
    true,
  );
}

/** Whether a popover asked to close stays open: a press outside that started inside a popover. */
export function staysOpenAfterPress(reason: string, startedInside: boolean) {
  return reason === "outside-press" && startedInside;
}

/** The `onOpenChange` guard of a popover that stays open when a press started inside it ends outside. */
export function usePopoverDragGuard() {
  useEffect(listen, []);
  return (open: boolean, details: { reason: string; cancel: () => void }) => {
    if (open || !staysOpenAfterPress(details.reason, pressStartedInPopover)) return false;
    details.cancel();
    return true;
  };
}
