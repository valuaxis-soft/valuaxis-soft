# 0001. Correo transaccional con Resend

- **Estado:** aceptada
- **Fecha:** 2026-11-22

## Contexto

La app manda correos transaccionales: verificación de cuenta, restablecer contraseña, invitaciones al equipo, avisos de avalúos y el dictamen al cliente con el PDF adjunto (hasta 25 MB). Hasta ahora el único proveedor real era Amazon SES (`AmazonSesEmailService`).

La cuenta de SES nunca salió del *sandbox*: el acceso a producción se solicitó y no se concedió, así que SES solo entrega a direcciones verificadas a mano. En producción, «olvidé mi contraseña» fallaba (el envío lanzaba un error que tumbaba la solicitud) y ningún usuario podía recuperar su cuenta.

Se compararon tres opciones:

- **Amazon SES:** barato y ya integrado, pero bloqueado sin acceso a producción, sin fecha de resolución.
- **Brevo:** fuerte en campañas de marketing (listas, plantillas, automatizaciones), que la app no usa; para transaccional no aporta sobre las otras.
- **Resend:** API REST simple para transaccional, adjuntos en base64 en el mismo JSON (40 MB por correo), dominio `valuaxissoft.com` ya verificado (región us-east-1) y disponible de inmediato.

## Decisión

- Resend es el proveedor de producción (`EMAIL_PROVIDER=resend`). `ResendEmailService` llama a `POST https://api.resend.com/emails` con el `fetch` de la plataforma, sin agregar dependencias, con 25 s de tiempo máximo, y convierte cualquier falla (rechazo, red, tiempo agotado) en `EmailDeliveryError`, como SES.
- El código de SES se conserva como respaldo (`EMAIL_PROVIDER=ses`), sin cambios de conducta.
- Asunto y cuerpo de cada correo salen de un solo lugar (`email-content.ts`) para que el destinatario reciba lo mismo con cualquier proveedor.
- El remitente se configura con variables neutrales (`EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`), con `SES_FROM_EMAIL`/`SES_FROM_NAME` como respaldo. No se reutiliza `EMAIL_FROM` porque producción ya la tiene con un valor que el código nunca leyó.
- `RESEND_API_KEY` vive solo en el servidor (`production.env`); `pnpm env:check` y el arranque fallan si `EMAIL_PROVIDER=resend` no la trae.

## Consecuencias

- Se desbloquea «olvidé mi contraseña» y el envío del dictamen sin esperar a AWS. Además, si un correo de restablecimiento no sale, la respuesta es la misma que para un correo desconocido (no revela si la cuenta existe) y el error queda en el log.
- Hay un proveedor externo más con su llave: se rota en el panel de Resend y se cambia en `production.env`; la llave se crea con permiso solo de envío.
- Volver a SES es cambiar `EMAIL_PROVIDER` y recrear la app; ambos servicios cumplen la misma interfaz `EmailService` y comparten pruebas de contenido.
- El límite de 25 MB del PDF del dictamen sigue siendo válido para los dos (25 MB en base64 son unos 33 MB, bajo los 40 MB de cada uno).
- Mientras SES siga en *sandbox*, ese respaldo solo sirve para direcciones verificadas.
