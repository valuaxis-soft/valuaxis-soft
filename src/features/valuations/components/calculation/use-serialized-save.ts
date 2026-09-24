import { useRef } from "react";

/**
 * Runs saves one at a time. A value that arrives while a save is in flight
 * replaces any other waiting one and is sent when it finishes, so the last
 * value the user left is the one stored, whatever order requests would commit in.
 */
export function useSerializedSave<T>(send: (value: T) => Promise<void>) {
  const inFlight = useRef(false);
  const waiting = useRef<{ value: T } | null>(null);

  return async (value: T) => {
    waiting.current = { value };
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (waiting.current) {
        const next = waiting.current.value;
        waiting.current = null;
        await send(next);
      }
    } finally {
      inFlight.current = false;
    }
  };
}
