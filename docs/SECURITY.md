# Seguridad

Estado real del código al 23 de septiembre de 2026. Este documento describe lo que el código hace hoy, no lo planeado. Los pendientes están ordenados por prioridad.

## Lo que sí está bien

- **Sesiones opacas en base de datos.** Token de 256 bits, en la base solo se guarda su hash SHA-256. Cookie `httpOnly`, `sameSite=lax`, `secure` en producción, 8 horas.
- **Contraseñas con bcrypt** de costo 12. La política pide 10 caracteres, mayúscula, minúscula, número y símbolo.
- **Bloqueo por cuenta** tras 5 intentos fallidos durante 15 minutos.
- **Verificación de correo y recuperación de contraseña** con tokens de un solo uso, hash en la base y expiración. Restablecer la contraseña revoca todas las sesiones. Pedir la recuperación no revela si el correo existe.
- **Google OAuth.** `state` y `nonce` aleatorios guardados como hash y consumidos una sola vez, intercambio de `code` en el servidor, `id_token` validado con JWKS, issuer, audience y nonce. Exige correo verificado. No guarda tokens de Google.
- **Redirecciones.** `safeRedirectPath` usa lista blanca de prefijos y rechaza `//`, `\` y caracteres de control.
- **Subida de imágenes.** Valida MIME, tamaño y el formato real del archivo con sharp. Normaliza a JPEG. Las claves de almacenamiento rechazan `..`.
- **Aislamiento entre empresas** en la mayoría de las consultas, filtrando por `IdOrganizacion`.
- **Permisos desde la base de datos** aplicados en todas las rutas de API y páginas privadas. Ver [AUTHORIZATION.md](AUTHORIZATION.md).
- **SQL crudo** solo en el folio, parametrizado.
- **Cabeceras de seguridad** en todas las respuestas (`src/security/headers`): CSP restringida al propio sitio más imágenes de S3, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS en producción. Sin `X-Powered-By`.
- **Protección CSRF:** el proxy rechaza con 403 toda petición a `/api` que modifica datos y viene de otro origen (`Origin` o `Sec-Fetch-Site`). Las server actions usan la protección propia de Next.
- **Validación de entrada con Zod** y límite de tamaño en las rutas de avalúos (`valuation-api.schemas.ts`, `readJsonBody`): 1 MB por defecto, 5 MB para el guardado completo.
- **Errores sin detalles internos:** las rutas registran el error en el servidor y responden un mensaje genérico. Los errores de negocio (`ValuationWorkflowError`) sí muestran su mensaje.
- **Límite de intentos por IP** en inicio de sesión (10 cada 15 min), recuperación de contraseña (10 por hora por IP y 3 por hora por correo), registro (5 por hora) e inicio con Google (20 cada 10 min), y de subidas por usuario (60 cada 10 min). Vive en memoria del proceso: sirve porque producción corre un solo contenedor.
- **Configuración validada al arrancar:** en producción, variables inválidas impiden iniciar el servidor. `pnpm env:check` hace la misma revisión antes de desplegar.

## Pendientes, en orden

1. **Sesión sin renovación.** Expira a las 8 horas aunque haya actividad y el editor pierde los cambios no guardados.
2. **La verificación de correo se ejecuta al renderizar la página.** Un escáner de enlaces puede consumir el token.
3. **El `state` de OAuth no está ligado al navegador** y no se usa PKCE.
4. **Auditoría parcial.** Solo el flujo de Google registra en `Auditoria`.
5. **El bloqueo por cuenta permite bloquear a otro usuario** conociendo su correo. El límite por IP lo dificulta, no lo impide.
6. **CSP con `'unsafe-inline'` en scripts.** Quitarlo requiere nonces por petición.
7. **Archivos locales en `public/`** solo en desarrollo; producción usa S3 privado.

## Proveedores

- **Email:** `DevelopmentEmailService` con `EMAIL_PROVIDER=development`, `AmazonSesEmailService` con `EMAIL_PROVIDER=ses`. El servicio se crea en el primer envío, no al importar.
- **Storage:** `DevelopmentStorageProvider` en local y `S3StorageProvider` con URLs firmadas de 15 minutos.
- **OAuth:** Google.
- **Mapas, IA y pagos:** no implementados.
