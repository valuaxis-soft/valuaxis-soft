import { LOGIN_LOCK_MINUTES, MAX_LOGIN_RETRIES } from "../constants/auth.constants";

export function isTemporarilyLocked(date: Date | null) {
  return Boolean(date && date.getTime() > Date.now());
}

export function nextLockDate(currentRetries: number) {
  if (currentRetries + 1 < MAX_LOGIN_RETRIES) return null;
  return new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
}
