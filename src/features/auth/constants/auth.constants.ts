export const AUTH_SESSION_COOKIE = "devpware_session";
/** Idle timeout: a session expires 8 hours after the last renewal. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
/** Absolute lifetime: no session is renewed past 7 days from login. */
export const SESSION_MAX_LIFETIME_SECONDS = 60 * 60 * 24 * 7;
export const EMAIL_TOKEN_TTL_MINUTES = 60 * 24;
export const PASSWORD_RESET_TTL_MINUTES = 60;
export const OAUTH_REQUEST_TTL_MINUTES = 10;
/**
 * Global account lock, a backstop against distributed guessing. It is high on
 * purpose: a low global limit lets anyone who knows an email lock that person
 * out. Per-IP failures are limited separately (MAX_LOGIN_FAILURES_PER_IP).
 */
export const MAX_LOGIN_RETRIES = 50;
/** Failed passwords for one account from one IP before that IP is locked out of it. */
export const MAX_LOGIN_FAILURES_PER_IP = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

export const AUTH_PUBLIC_PATHS = [
  "/",
  "/iniciar-sesion",
  "/registro",
  "/verificar-correo",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/oauth",
  "/login",
] as const;
