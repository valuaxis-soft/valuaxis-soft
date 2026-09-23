# Seguridad

Estado real del código al 23 de septiembre de 2026. Este documento describe lo que el código hace hoy, no lo planeado. Los pendientes están ordenados por prioridad.

## Lo que sí está bien

- **Sesiones opacas en base de datos.** Token de 256 bits, en la base solo se guarda su hash SHA-256. Cookie `httpOnly`, `sameSite=lax`, `secure` en producción, 8 horas.
- **Contraseñas con bcrypt** de costo 12. La política pide 10 caracteres, mayúscula, minúscula, número y símbolo.
- **Bloqueo por cuenta e IP:** 5 contraseñas fallidas desde una IP bloquean esa cuenta solo para esa IP durante 15 minutos; el dueño entra desde su conexión. El bloqueo global de la cuenta queda como respaldo a los 50 fallos consecutivos, contra ataques distribuidos.
- **Sesión deslizante:** se renueva a 8 horas cuando le quedan menos de 4, con tope de 7 días desde el inicio de sesión. El editor envía una señal cada 10 minutos; si la sesión expira, conserva los cambios y permite iniciar sesión en otra pestaña y volver a guardar. Cerrar la pestaña con cambios pide confirmación.
- **Verificación de correo con confirmación explícita:** abrir el enlace no consume el token; se consume al pulsar el botón.
- **Google OAuth con PKCE (S256) y estado ligado al navegador** mediante una cookie `httpOnly`; un callback con un `state` de otro navegador se rechaza.
- **Auditoría** de inicios de sesión (éxito y fallo), cierres, recuperación de contraseña, verificación de correo, cambio de organización, permisos denegados y creación, conclusión, reapertura, borrado y exportación de avalúos, con IP. Un fallo de auditoría nunca interrumpe la operación.
- **Verificación de correo y recuperación de contraseña** con tokens de un solo uso, hash en la base y expiración. Restablecer la contraseña revoca todas las sesiones. Pedir la recuperación no revela si el correo existe.
- **Google OAuth.** `state` y `nonce` aleatorios guardados como hash y consumidos una sola vez, intercambio de `code` en el servidor, `id_token` validado con JWKS, issuer, audience y nonce. Exige correo verificado. No guarda tokens de Google.
- **Redirecciones.** `safeRedirectPath` usa lista blanca de prefijos y rechaza `//`, `\` y caracteres de control.
- **Subida de imágenes.** Valida MIME, tamaño y el formato real del archivo con sharp. Normaliza a JPEG. Las claves de almacenamiento rechazan `..`.
- **Aislamiento entre empresas** en la mayoría de las consultas, filtrando por `IdOrganizacion`.
- **Permisos desde la base de datos** aplicados en todas las rutas de API y páginas privadas. Ver [AUTHORIZATION.md](AUTHORIZATION.md).
- **SQL crudo** solo en el folio, parametrizado.
- **Cabeceras de seguridad** en todas las respuestas (`src/security/headers`): `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS en producción. Sin `X-Powered-By`.
- **CSP con nonce por petición:** el proxy genera un nonce y Next.js lo pone en sus scripts; `'strict-dynamic'` permite cargar los chunks. Ningún script en línea sin nonce se ejecuta. Los estilos siguen permitiendo `'unsafe-inline'` por los atributos `style` de la interfaz.
- **Protección CSRF:** el proxy rechaza con 403 toda petición a `/api` que modifica datos y viene de otro origen (`Origin` o `Sec-Fetch-Site`). Las server actions usan la protección propia de Next.
- **Validación de entrada con Zod** y límite de tamaño en las rutas de avalúos (`valuation-api.schemas.ts`, `readJsonBody`): 1 MB por defecto, 5 MB para el guardado completo.
- **Errores sin detalles internos:** las rutas registran el error en el servidor y responden un mensaje genérico. Los errores de negocio (`ValuationWorkflowError`) sí muestran su mensaje.
- **Límite de intentos por IP** en inicio de sesión (10 cada 15 min), recuperación de contraseña (10 por hora por IP y 3 por hora por correo), registro (5 por hora) e inicio con Google (20 cada 10 min), y de subidas por usuario (60 cada 10 min). Vive en memoria del proceso: sirve porque producción corre un solo contenedor.
- **Configuración validada al arrancar:** en producción, variables inválidas impiden iniciar el servidor. `pnpm env:check` hace la misma revisión antes de desplegar.

## Pendientes

- **Estilos en línea permitidos** en la CSP (`style-src 'unsafe-inline'`). Quitarlo exige eliminar los atributos `style` de la interfaz.
- **Límites de intentos en memoria:** sirven con un solo contenedor. Si la app escala a varias instancias, deben moverse a Postgres o Redis.

## Proveedores

- **Email:** `DevelopmentEmailService` con `EMAIL_PROVIDER=development`, `AmazonSesEmailService` con `EMAIL_PROVIDER=ses`. El servicio se crea en el primer envío, no al importar.
- **Storage:** `DevelopmentStorageProvider` en local y `S3StorageProvider` con URLs firmadas de 15 minutos.
- **OAuth:** Google.
- **Mapas, IA y pagos:** no implementados.
