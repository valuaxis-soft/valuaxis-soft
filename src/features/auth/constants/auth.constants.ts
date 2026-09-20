export const AUTH_SESSION_COOKIE = "devpware_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
export const EMAIL_TOKEN_TTL_MINUTES = 60 * 24;
export const PASSWORD_RESET_TTL_MINUTES = 60;
export const OAUTH_REQUEST_TTL_MINUTES = 10;
export const MAX_LOGIN_RETRIES = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

export const AUTH_PUBLIC_PATHS = [
  "/iniciar-sesion",
  "/registro",
  "/verificar-correo",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/oauth",
  "/login",
] as const;
