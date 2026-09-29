/**
 * Marks the requests of the server's own PDF renderer, so the page it prints
 * can tell them apart from a person opening it (and not audit the view twice).
 * The token lives only in this process's memory.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export const INTERNAL_RENDER_HEADER = "x-valuaxis-internal-render";
// Next bundles route handlers and pages separately, so this module can load
// more than once in the same process: the token lives on globalThis to be one.
const holder = globalThis as typeof globalThis & { __valuaxisInternalRenderToken?: string };
holder.__valuaxisInternalRenderToken ??= randomBytes(32).toString("hex");
export const INTERNAL_RENDER_TOKEN = holder.__valuaxisInternalRenderToken;

export function isInternalRender(headers: Pick<Headers, "get">) {
  const value = headers.get(INTERNAL_RENDER_HEADER);
  if (!value || value.length !== INTERNAL_RENDER_TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(INTERNAL_RENDER_TOKEN));
}
