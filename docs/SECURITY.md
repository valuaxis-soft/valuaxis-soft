# Seguridad

## Estado aplicado

- Las consultas nuevas de avalúos usan `IdOrganizacion`, `BActivo` y `DFechaEliminacion`.
- La eliminacion de avalúos y bloques se hizo logica, no fisica.
- Las APIs principales exigen sesion mediante `getCurrentUser()`.
- El dashboard summary se carga por usuario y organizacion activos.
- Uploads validan MIME, tamano, extension y checksum antes de registrarse como `CargaArchivo`.
- Exportacion PDF exige permiso `projects.export`.
- Concluir exige `projects.complete`.
- Reabrir exige `projects.reopen`.
- `/login` conserva compatibilidad y redirige a la ruta oficial `/iniciar-sesion`.
- Los tokens se movieron a `src/security/tokens`.
- Los guards se movieron a `src/security/guards`.
- La validacion de redirecciones se movio a `src/security/validation`.

## Proveedores externos

Proveedores configurados o preparados:

- Email: `DevelopmentEmailService` solo con `EMAIL_PROVIDER=development`; `AmazonSesEmailService` con `EMAIL_PROVIDER=ses`.
- Storage: local para desarrollo, S3 pendiente.
- OAuth: Google usa `GoogleOAuthProvider` y sesiones propias.
- Mapas, IA y pagos quedan pendientes de configuracion real.

El proveedor SES usa credenciales solo en servidor y no expone secretos al navegador. Los errores de SES se envuelven como error de dominio y solo se registra metadata segura del fallo.

Google OAuth:

- Genera `state` y `nonce` criptograficos.
- Guarda solo hashes en `SolicitudOAuth`.
- Consume el `state` una sola vez.
- Intercambia `code` por tokens solo en servidor.
- No guarda access tokens ni refresh tokens de Google.
- Valida firma JWK, issuer, audience, expiracion y nonce del `id_token`.
- Usa solo scopes `openid`, `email`, `profile`.
- No expone `GOOGLE_CLIENT_SECRET` al navegador.
- Crea sesion propia con la misma cookie del login manual.
- Redirige errores a `/oauth/resultado` con codigos seguros.

## Pendientes

- Validacion Zod uniforme en todos los route handlers.
- CSRF/origin checks para acciones mutativas.
- Rate limiting persistente por flujo critico.
- Politicas de autorizacion por permiso granular en todos los recursos.
- Auditoria uniforme en todos los flujos nuevos.
- URLs privadas/presignadas para archivos de produccion.
