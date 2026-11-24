import type { ComparableType } from "@/features/valuations/calculation/market-types";

/**
 * The market the appraiser had open, and how far down he was, kept in the
 * browser (V8.2, 24 nov 2026: «cambié de vista y me cambió a terrenos; que me
 * mantenga donde estoy»). Changing the view of the editor (editor, both,
 * preview) mounts the panel again, and a reload does too: both come back to
 * the same market and, as near as the page allows, the same place. Only the
 * browser keeps it (one key per valuation and section); nothing is saved on
 * the server. Pure but for the storage passed in, so it is tested with a map.
 */

type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "setItem">;

/** One key per valuation and per group of markets (sales or rents). */
export const marketMemoryKey = (valuationId: string, types: readonly ComparableType[]) => `valuaxis:mercado:${valuationId}:${types.join(",")}`;

type Memory = { type?: string; scrollTop?: number };

function read(storage: ReadStorage | null, key: string): Memory {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Memory) : {};
  } catch {
    return {};
  }
}

function write(storage: (ReadStorage & WriteStorage) | null, key: string, patch: Memory) {
  try {
    storage?.setItem(key, JSON.stringify({ ...read(storage, key), ...patch }));
  } catch {
    // A private window or a full storage: the market simply starts at the first one.
  }
}

/** The market kept for this panel, when it is one of its markets. */
export function storedMarketType(storage: ReadStorage | null, key: string, types: readonly ComparableType[]): ComparableType | null {
  const type = read(storage, key).type;
  return types.find((item) => item === type) ?? null;
}

export const storeMarketType = (storage: (ReadStorage & WriteStorage) | null, key: string, type: ComparableType) => write(storage, key, { type });

/** How far down the editor was, in pixels; null without one. */
export function storedMarketScroll(storage: ReadStorage | null, key: string): number | null {
  const value = read(storage, key).scrollTop;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export const storeMarketScroll = (storage: (ReadStorage & WriteStorage) | null, key: string, scrollTop: number) =>
  write(storage, key, { scrollTop: Math.max(0, Math.round(scrollTop)) });

/** The browser's storage for the tab, or null where it is not available (server, private window). */
export function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
