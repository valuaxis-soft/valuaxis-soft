/**
 * The requests that change something on the server (POST, PUT, PATCH,
 * DELETE) still on their way. The calculation panels save on their own (a
 * comparable, a factor, the settings): leaving the editor while one of them
 * travels loses it, so the editor asks first (video 8.12, 10:32: «salí y no
 * me preguntó si quería guardar cambios»).
 */

let pending = 0;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const isMutation = (method: string | undefined) => Boolean(method) && method?.toUpperCase() !== "GET" && method?.toUpperCase() !== "HEAD";

/** Counts the request while it travels, when it changes something. */
export function trackMutation<T>(method: string | undefined, run: () => Promise<T>): Promise<T> {
  if (!isMutation(method)) return run();
  pending += 1;
  notify();
  return run().finally(() => {
    pending -= 1;
    notify();
  });
}

export const pendingMutations = () => pending;

export function subscribePendingMutations(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resolves once nothing is on its way any more (at once when nothing is). */
export function pendingMutationsSettled(): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = subscribePendingMutations(() => {
      if (pending > 0) return;
      unsubscribe();
      resolve();
    });
  });
}
