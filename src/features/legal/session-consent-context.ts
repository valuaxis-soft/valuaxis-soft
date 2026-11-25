import { sessionTokenOf } from "@/lib/auth/session-cookie";
import { clientIp } from "@/security/rate-limit/rate-limiter";
import { hashToken } from "@/security/tokens/token-hashing";
import type { ConsentRequestContext } from "./consent.service";

/**
 * Where a signed-in acceptance or change came from: the IP, the browser and
 * the session cookie's hash, the same one `devpware_sesiones.STokenHash`
 * keeps, so the log entry points at its session.
 */
export function sessionConsentContext(request: Request): ConsentRequestContext {
  const cookies = new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length >= 2)
      .map(([name, ...value]) => [name, { value: value.join("=") }] as const),
  );
  const token = sessionTokenOf({ get: (name) => cookies.get(name) });
  return {
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent")?.slice(0, 1000) ?? null,
    cookieHash: token ? hashToken(token) : null,
  };
}
