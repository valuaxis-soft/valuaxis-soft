import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";

import { api, SessionExpiredError } from "@/lib/api-client";

/** Heartbeat interval. The server renews once less than half of the 8-hour idle timeout remains. */
const SESSION_HEARTBEAT_MS = 10 * 60 * 1000;

/** Keeps the session alive while the editor is open, and warns early if it is gone. */
export function useSessionHeartbeat({
  hasUnsavedChanges,
  onSessionExpired,
}: {
  hasUnsavedChanges: boolean;
  onSessionExpired: () => void;
}) {
  const onHeartbeatFailed = useEffectEvent((error: unknown) => {
    if (!(error instanceof SessionExpiredError)) return;
    if (hasUnsavedChanges) onSessionExpired();
    else toast.warning("Tu sesión expiró. Inicia sesión de nuevo para seguir editando.");
  });
  useEffect(() => {
    const beat = () => {
      api.session.heartbeat().catch(onHeartbeatFailed);
    };
    const interval = window.setInterval(beat, SESSION_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
