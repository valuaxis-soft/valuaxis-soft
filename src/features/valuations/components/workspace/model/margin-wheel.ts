/**
 * The mouse wheel over the workspace's margins (the gray band around the
 * editor, the space beside it on a wide screen, the divider) scrolls the
 * editor too: it used to do nothing there, and the appraiser had to bring the
 * cursor over the form first (video 6.3, 04:46).
 */

/** Lines and pages of a wheel in pixels, as the browser would scroll them. Pure. */
export function wheelPixels(event: Pick<WheelEvent, "deltaY" | "deltaMode">, pageHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * pageHeight;
  return event.deltaY;
}

/**
 * Whether the wheel turned over a margin: not over a pane that scrolls on its
 * own (the editor, the preview) nor over the top bar, whose tab strip scrolls
 * sideways on a narrow screen. Pure.
 */
export function isMarginWheel(target: Node | null, ownScrollers: ReadonlyArray<Pick<Node, "contains"> | null>): boolean {
  if (!target) return false;
  return !ownScrollers.some((scroller) => scroller !== null && scroller.contains(target));
}
