import { SESSION_TTL_SECONDS } from "../constants/auth.constants";

export function buildSessionExpiration() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
}
