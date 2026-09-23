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

## Pendientes, en orden

1. **Archivos privados servidos públicamente en modo local.** El almacenamiento local escribe bajo `public/`. No hay ruta autenticada para servir archivos.
2. **Sin validación de esquema en las rutas de API.** Los cuerpos se usan sin validar tipo ni tamaño.
3. **Errores internos expuestos.** Varias rutas devuelven `details: String(error)` al cliente.
4. **Sin verificación de `Origin`** en rutas de API que modifican datos. Las server actions sí la tienen por Next.
5. **Sin límite de intentos por IP** en login, recuperación de contraseña, OAuth ni subidas. La tabla `IntentoAcceso` se llena pero no se consulta. El bloqueo por cuenta permite que un tercero bloquee la cuenta de otro usuario.
6. **Sin cabeceras de seguridad.** `next.config.ts` no define CSP, HSTS, `X-Frame-Options`, `Referrer-Policy` ni `Permissions-Policy`.
7. **Sesión sin renovación.** Expira a las 8 horas aunque haya actividad. Los campos de rotación existen en el esquema sin uso.
8. **La verificación de correo se ejecuta al renderizar la página.** Un escáner de enlaces puede consumir el token.
9. **El `state` de OAuth no está ligado al navegador** y no se usa PKCE.
10. **`src/lib/env.ts` no falla** si la configuración es inválida: usa valores por defecto.
11. **Auditoría parcial.** Solo el flujo de Google registra en `Auditoria`.

## Proveedores

- **Email:** `DevelopmentEmailService` con `EMAIL_PROVIDER=development`, `AmazonSesEmailService` con `EMAIL_PROVIDER=ses`. El servicio se crea al importar el módulo, así que sin `EMAIL_PROVIDER` el build falla.
- **Storage:** `DevelopmentStorageProvider` en local y `S3StorageProvider` con URLs firmadas de 15 minutos.
- **OAuth:** Google.
- **Mapas, IA y pagos:** no implementados.
