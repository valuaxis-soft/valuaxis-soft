/// <reference types="google.maps" />

/**
 * Loads the Maps JavaScript API once. The script and the styles Google adds
 * afterwards carry the CSP nonce of the document (see documentNonce).
 */
const CALLBACK = "__valuaxisMapsReady";

type GoogleWindow = Window & {
  [CALLBACK]?: () => void;
  /** Google calls it when the key is rejected (wrong referrer, API not enabled). */
  gm_authFailure?: () => void;
};

/** What the nonce helpers read and write of the document; a fake one in the tests. */
export type NonceDocument = Pick<Document, "querySelector" | "createElement" | "head">;

/** Marks the `<style>` the loader adds so Google finds the document's nonce. */
export const MAPS_STYLE_NONCE_ATTRIBUTE = "data-maps-style-nonce";

const nonceOf = (element: Element | null) =>
  ((element as HTMLElement | null)?.nonce || element?.getAttribute("nonce") || undefined);

/**
 * The nonce of the CSP that applies: the one the document was served with.
 * The scripts of the first server render carry it. A nonce rendered by a
 * page is the one of the request that rendered it, and after the app moves
 * between pages without loading a new document (Inicio → avalúo, Lista →
 * Mapa) that request is not the document's: its nonce is not in the policy
 * (V7.3-08, 17 nov 2026).
 */
export function documentNonce(doc: Pick<Document, "querySelector"> = document) {
  return nonceOf(doc.querySelector("script[nonce]"));
}

/**
 * Google copies the nonce of the first `<style nonce>` of the document onto
 * the styles it injects (its controls, the card of a pin); with any other
 * nonce the CSP blocks them and the card shows transparent, without its
 * close button. The first one in the document is this one, in the head,
 * with the document's nonce.
 */
export function ensureMapsStyleNonce(doc: NonceDocument = document, nonce = documentNonce(doc)) {
  if (!nonce) return null;
  const current = doc.querySelector(`style[${MAPS_STYLE_NONCE_ATTRIBUTE}]`) as HTMLStyleElement | null;
  if (current && nonceOf(current) === nonce && doc.head.firstChild === current) return current;
  current?.remove();
  const style = doc.createElement("style");
  style.setAttribute(MAPS_STYLE_NONCE_ATTRIBUTE, "");
  style.nonce = nonce;
  style.setAttribute("nonce", nonce);
  doc.head.insertBefore(style, doc.head.firstChild);
  return style;
}

let loading: Promise<void> | null = null;

/**
 * `fallbackNonce`, the page's, is used only when the document has no nonce
 * of its own (it always has one where the proxy sets the CSP).
 */
export function loadGoogleMaps(apiKey: string, fallbackNonce: string | undefined, onAuthFailure: () => void) {
  const win = window as GoogleWindow;
  win.gm_authFailure = onAuthFailure;
  const nonce = documentNonce() ?? fallbackNonce;
  ensureMapsStyleNonce(document, nonce);
  if (typeof google !== "undefined" && google.maps?.Map) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    win[CALLBACK] = () => resolve();
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      language: "es",
      region: "MX",
      loading: "async",
      callback: CALLBACK,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    if (nonce) script.nonce = nonce;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("No se pudo cargar Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
