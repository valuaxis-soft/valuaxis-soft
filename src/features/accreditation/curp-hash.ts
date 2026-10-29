import { createHash, createHmac } from "node:crypto";

/**
 * The CURP is never stored in clear: only this hash, to tell when two accounts
 * upload the same person's constancia. With a server secret it is an HMAC
 * (`hmac:` prefix); without one, a SHA-256 with a fixed domain prefix
 * (`sha256:`), weaker because a CURP has little entropy. The prefix says which,
 * so a secret added later never compares against the wrong kind.
 */
export function hashCurp(curp: string, secret: string | null | undefined): string {
  const normalized = curp.trim().toUpperCase();
  if (secret) return `hmac:${createHmac("sha256", secret).update(normalized).digest("hex")}`;
  return `sha256:${createHash("sha256").update(`valuaxis-acreditacion:${normalized}`).digest("hex")}`;
}
