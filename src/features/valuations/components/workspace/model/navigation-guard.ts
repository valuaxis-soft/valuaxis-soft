/**
 * Leaving the editor with changes not saved (video 6.2, 05:44: «atrás y
 * adelante me borró el trabajo»). The browser's or the app's Atrás, a link of
 * the app and closing the tab all ask first; this file holds the pure parts.
 */

/** Where the appraiser was going when the editor asked: a page of the app, or back in the history. */
export type PendingExit = { kind: "push"; href: string } | { kind: "back" };

type ClickLike = Pick<MouseEvent, "button" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "defaultPrevented">;
type AnchorLike = { href: string; target: string; hasAttribute: (name: string) => boolean };
type LocationLike = Pick<Location, "origin" | "pathname" | "search">;

/**
 * The page a click on a link would open in this tab, leaving the editor;
 * null when it does not leave (another tab, a download, the same page, a
 * jump within it, another site). Pure.
 */
export function leavingLinkHref(event: ClickLike, anchor: AnchorLike | null, location: LocationLike): string | null {
  if (!anchor || event.defaultPrevented || event.button !== 0) return null;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, location.origin);
  } catch {
    return null;
  }
  // Another site opens as the browser does it, and the tab's beforeunload asks.
  if (url.origin !== location.origin) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** What the exit dialog says it does with the changes, by where the appraiser was going. */
export function exitDialogDescription(exit: PendingExit | null): string {
  const destination = exit?.kind === "push" && exit.href.startsWith("/dashboard") ? "volver al dashboard" : "salir del avalúo";
  return `Si sales ahora se pierden los cambios que no se han guardado. Puedes guardarlos y ${destination}, salir sin guardar o seguir editando.`;
}
