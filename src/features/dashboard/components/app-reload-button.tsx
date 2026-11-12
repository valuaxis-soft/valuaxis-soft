"use client";

import { RotateCw } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True in the installed app (the PWA window), which has no address bar or reload button of its own. */
function useInstalledApp() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(STANDALONE_QUERY).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );
}

/**
 * «Recargar» for the installed app (V6.3-02): a small button in the bottom
 * left corner of every private page. The browser has its own, so the button
 * shows only in the app window. With unsaved changes the editor asks before
 * leaving, as it does for the browser's.
 */
export function AppReloadButton() {
  const installed = useInstalledApp();
  if (!installed) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.location.reload()}
      title="Recargar la página"
      className="fixed bottom-3 left-3 z-50 gap-1.5 rounded-full bg-background/90 shadow-md backdrop-blur print:hidden"
    >
      <RotateCw aria-hidden="true" />
      Recargar
    </Button>
  );
}
