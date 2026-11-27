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

type FieldLike = {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
  closest: (selector: string) => unknown;
};

/** The fields of the calculation panels (their own and those they write into the tables of the document), out of their dialogs, menus and lists. */
const CALCULATION_SCOPE = "[data-calculation-panel], [data-capture-slot]";
const OUT_OF_SCOPE = "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-slot=popover-content], [data-leave-ignore]";
const NOT_TYPED = new Set(["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image", "hidden", "search"]);

/**
 * A field of a calculation panel that holds what the appraiser typed until it is left:
 * the fields of the calculation panels send it when they lose the focus
 * (a CommitCell, the settings of a market). Typed and still focused, it is
 * work that leaving loses (27 Nov 2026: «Texto del nivel de oferta» and the
 * back arrow left without asking, and the text was lost). Pure: it reads
 * only the element's kind and where it is.
 */
export function isCalculationTypingField(target: unknown): boolean {
  if (!target || typeof target !== "object" || !("tagName" in target) || typeof (target as FieldLike).closest !== "function") return false;
  const field = target as FieldLike;
  const tag = field.tagName.toUpperCase();
  const typed = tag === "TEXTAREA" || (tag === "INPUT" && !NOT_TYPED.has((field.type ?? "text").toLowerCase())) || field.isContentEditable === true;
  return typed && Boolean(field.closest(CALCULATION_SCOPE)) && !field.closest(OUT_OF_SCOPE);
}

/**
 * Sends what the focused field of a calculation panel holds, as leaving it does (its
 * blur sends it), and waits for the next task, so what it sends is already
 * on its way (pending-mutations.ts). True when there was such a field.
 */
export async function sendFocusedCalculationField(doc: Pick<Document, "activeElement"> = document): Promise<boolean> {
  const active = doc.activeElement;
  if (!isCalculationTypingField(active)) return false;
  (active as HTMLElement).blur();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return true;
}

/** The open editor's question before leaving; null when no editor is open. */
let leaveGuard: ((href: string) => boolean) | null = null;

/** The editor registers its question while it is open; the returned function takes it away. */
export function setLeaveGuard(guard: (href: string) => boolean) {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}

/**
 * For a page of the app that navigates from code (the command palette): true
 * when the open editor has work to save and asked instead; then the caller
 * does not navigate, the editor's dialog goes on from there.
 */
export const leaveIntercepted = (href: string) => leaveGuard?.(href) ?? false;

/** The question of the exit dialog, in the appraiser's words (video 8.12, 11:05). */
export const EXIT_DIALOG_TITLE = "¿Deseas guardar antes de salir?";

/** What the exit dialog says it does with the changes, by where the appraiser was going. */
export function exitDialogDescription(exit: PendingExit | null): string {
  const destination = exit?.kind === "push" && exit.href.startsWith("/dashboard") ? "volver al dashboard" : "salir del avalúo";
  return `Si sales ahora se pierden los cambios que no se han guardado. Puedes guardarlos y ${destination}, salir sin guardar o seguir editando.`;
}
