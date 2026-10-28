/// <reference types="google.maps" />

/**
 * Loads the Maps JavaScript API once. The script carries the request's CSP
 * nonce; the API reuses it for the scripts and styles it adds afterwards.
 */
const CALLBACK = "__valuaxisDemoMapsReady";

type GoogleWindow = Window & {
  [CALLBACK]?: () => void;
  /** Google calls it when the key is rejected (wrong referrer, API not enabled). */
  gm_authFailure?: () => void;
};

let loading: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string, nonce: string | undefined, onAuthFailure: () => void) {
  const win = window as GoogleWindow;
  win.gm_authFailure = onAuthFailure;
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
