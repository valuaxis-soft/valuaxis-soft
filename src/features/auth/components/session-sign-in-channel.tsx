"use client";

import { useEffect } from "react";

/**
 * Tabs of the same browser tell each other that a session is open again: a
 * private page announces it when it loads, and a login page left open in
 * another window (the external preview, opened from the editor, lands there
 * when its session expires) goes on to where it was going instead of staying
 * stale (observations of 20 Oct 2026).
 */
const SESSION_CHANNEL = "valuaxis-session";

type SessionMessage = { type: "signed-in" };

function isSignedInMessage(data: unknown): data is SessionMessage {
  return typeof data === "object" && data !== null && (data as { type?: unknown }).type === "signed-in";
}

/** On every private page: a session is open in this browser. */
export function SignedInAnnouncer() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: "signed-in" } satisfies SessionMessage);
    channel.close();
  }, []);
  return null;
}

/** On the login page: once another tab signs in, go to `destination` with that session. */
export function ContinueWhenSignedIn({ destination }: { destination: string }) {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isSignedInMessage(event.data)) window.location.replace(destination);
    };
    return () => channel.close();
  }, [destination]);
  return null;
}
