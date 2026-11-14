"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api, SessionExpiredError } from "@/lib/api-client";
import { NOTIFICATION_POLL_MS, type NotificationListDto } from "../notification-types";

/**
 * One copy of the person's notices for the whole page, so the bell and the
 * «Notificaciones» page always agree. It asks the server every minute while
 * the tab is visible and again when the tab gets focus; nothing else (no
 * websockets). With the session expired it stops asking.
 */
type State = { data: NotificationListDto | null; error: boolean };

let state: State = { data: null, error: false };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let stopped = false;

const emit = (next: Partial<State>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

async function refresh() {
  if (stopped) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      emit({ data: await api.notifications.list(), error: false });
    } catch (error) {
      if (error instanceof SessionExpiredError) stopped = true;
      emit({ error: true });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Marks some notices read at once on screen, then on the server; the server's count wins. */
async function markRead(selector: { ids: string[] } | { all: true }) {
  const current = state.data;
  if (current) {
    const ids = "ids" in selector ? new Set(selector.ids) : null;
    const items = current.items.map((item) => (!item.read && (!ids || ids.has(item.id)) ? { ...item, read: true } : item));
    const changed = current.items.filter((item) => !item.read && (!ids || ids.has(item.id))).length;
    emit({ data: { items, unreadCount: ids ? Math.max(0, current.unreadCount - changed) : 0 } });
  }
  try {
    const { unreadCount } = await api.notifications.markRead(selector);
    if (state.data) emit({ data: { ...state.data, unreadCount } });
  } catch {
    void refresh();
  }
}

let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const onVisible = () => {
  if (document.visibilityState === "visible") void refresh();
};

function startPolling() {
  pollers += 1;
  if (pollers > 1) return;
  void refresh();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, NOTIFICATION_POLL_MS);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
}

function stopPolling() {
  pollers -= 1;
  if (pollers > 0) return;
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", onVisible);
  document.removeEventListener("visibilitychange", onVisible);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
/** The notices and the actions on them; `initial` (from the server) shows at once instead of waiting for the first request. */
export function useNotifications(initial?: NotificationListDto) {
  const fallback = useMemo<State>(() => ({ data: initial ?? null, error: false }), [initial]);
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (state.data ? state : fallback),
    () => fallback,
  );
  useEffect(() => {
    if (initial && !state.data) emit({ data: initial });
    startPolling();
    return stopPolling;
  }, [initial]);
  return { ...snapshot, refresh, markRead };
}
