# Authentication Flow

Flujos existentes:

- registro manual;
- login manual;
- verificacion de correo;
- recuperacion y restablecimiento de contrasena;
- logout;
- sesiones propias con cookie;
- proveedor de email seleccionable por `EMAIL_PROVIDER`.

Separacion actual:

- `features/auth/services/authentication.service.ts`
- `features/auth/services/authorization-context.service.ts`
- `features/auth/services/organization-access.service.ts`
- `features/auth/services/session.service.ts`
- `features/auth/rules`
- `features/auth/repositories`

## Google OAuth

Google OAuth esta integrado mediante proveedor encapsulado y sesiones propias.

Rutas:

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `/oauth/resultado`

Variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `APP_URL`

Callback local:

- `http://localhost:3000/api/auth/google/callback`

Callback futuro de produccion:

- `https://devpware.network/api/auth/google/callback`

Scopes usados:

- `openid`
- `email`
- `profile`

Flujo:

1. El boton "Continuar con Google" navega a `/api/auth/google`.
2. El backend genera `state` y `nonce` seguros.
3. Solo guarda hashes en `SolicitudOAuth`.
4. Google devuelve `code` y `state` al callback.
5. El backend consume el `state` una sola vez.
6. El backend intercambia `code` por tokens en servidor.
7. El `id_token` se valida con firma JWK, issuer, audience, expiracion y nonce.
8. Se vincula identidad existente, se vincula por correo verificado o se crea usuario con onboarding manual.
9. Se crea `Sesion` propia y cookie local.
10. Se redirige al dashboard.

Politica de vinculacion:

- Si existe identidad `GOOGLE + sub`, se usa ese usuario si puede acceder.
- Si no existe identidad y el correo verificado ya existe, se vincula al usuario existente.
- Si el correo no esta verificado, se rechaza.
- Si hay conflicto de identidad Google, se rechaza.

Politica de onboarding:

- Usuarios nuevos por Google reutilizan la politica del registro manual: usuario activo, organizacion personal, membresia y rol `ADMINISTRADOR`.
- Si un usuario existente no tiene membresia activa, se crea una organizacion personal siguiendo la misma regla.

Errores publicos:

- `oauth_cancelled`
- `oauth_invalid_state`
- `oauth_expired`
- `oauth_provider_error`
- `oauth_email_unverified`
- `oauth_account_blocked`
- `oauth_account_conflict`
- `oauth_session_error`
- `oauth_unknown_error`

## Email

El contrato activo es `EmailService` y se resuelve desde una unica factoria:

- `EMAIL_PROVIDER=development`: usa `DevelopmentEmailService` y no envia correos reales.
- `EMAIL_PROVIDER=ses`: usa `AmazonSesEmailService` con `@aws-sdk/client-sesv2`.

Variables requeridas para SES:

- `EMAIL_PROVIDER=ses`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `SES_FROM_EMAIL`
- `SES_FROM_NAME`
- `APP_URL`

Los enlaces se construyen con `APP_URL`:

- `/verificar-correo?token=...`
- `/restablecer-contrasena?token=...`

El envio de correo no consume tokens, no verifica cuentas automaticamente y no cambia la expiracion existente.
