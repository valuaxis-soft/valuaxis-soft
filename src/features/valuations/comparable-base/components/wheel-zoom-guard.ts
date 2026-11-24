/** What the map says when the wheel passes over it without zooming. */
export const WHEEL_ZOOM_HINT = "Usa Ctrl + rueda (⌘ en Mac) o haz clic en el mapa para acercar";

type WheelLike = Event & { ctrlKey?: boolean; metaKey?: boolean };

/**
 * A map inside a card or a dialog lets the wheel scroll the page past it
 * (24 Nov 2026: scrolling the «Ficha del comparable», the map zoomed when the
 * pointer crossed it). The wheel zooms the map only with Ctrl or ⌘ held (a
 * trackpad's pinch counts) or after a click on the map, until the pointer
 * leaves it; otherwise the map's own wheel handler never sees the event and
 * `onBlockedWheel` is told, to show the hint. The +/− buttons always zoom.
 *
 * The listener runs in the capture phase on the map's container, so it acts
 * before Leaflet's, which listens there too. Returns the cleanup.
 */
export function guardWheelZoom(container: EventTarget, onBlockedWheel: () => void): () => void {
  let active = false;
  const wheel = (event: Event) => {
    const { ctrlKey, metaKey } = event as WheelLike;
    if (active || ctrlKey || metaKey) return;
    // Not prevented: the page (or the dialog) scrolls as if the map were not there.
    event.stopImmediatePropagation();
    onBlockedWheel();
  };
  const activate = () => { active = true; };
  const deactivate = () => { active = false; };
  container.addEventListener("wheel", wheel, { capture: true });
  container.addEventListener("pointerdown", activate);
  container.addEventListener("pointerleave", deactivate);
  return () => {
    container.removeEventListener("wheel", wheel, { capture: true });
    container.removeEventListener("pointerdown", activate);
    container.removeEventListener("pointerleave", deactivate);
  };
}
