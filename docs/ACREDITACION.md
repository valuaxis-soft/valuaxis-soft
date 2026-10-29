# Acreditación profesional

Cualquier persona se registra y hace avalúos. Quien no ha acreditado su cédula profesional es **no acreditado**: sus dictámenes y memorias de cálculo imprimen el aviso «DOCUMENTO SIN VALIDEZ OFICIAL». Requisito del cliente acordado con su abogado (28 oct 2026).

## Estados

| Estado | Significa | ¿Imprime el aviso? |
|---|---|---|
| `NO_ACREDITADO` | No ha subido nada (no tiene fila) | Sí |
| `EN_REVISION` | Subió una constancia válida de la SEP y falta que un administrador la coteje | Sí |
| `ACREDITADO` | Cotejada. Es permanente: no se puede volver a subir | No |
| `RECHAZADO` | Un administrador la rechazó o revocó; puede volver a subirla | Sí |

Todo vive en `devpware_acreditaciones_usuarios` (migración 054), una fila por usuario. `devpware_usuarios` no cambia.

## Cómo se acredita

1. En **Mi cuenta** (`/cuenta`, menú del usuario → "Mi cuenta y acreditación") el usuario sube su **Constancia de Situación Profesional** en PDF o una imagen (JPG, PNG o WebP) de su código QR. Hasta 10 MB, 10 intentos por hora.
2. El servidor lee el QR sin servicios externos: una imagen con `sharp` y `jsqr` (Apache-2.0); un PDF no se dibuja, se buscan en su primera página las imágenes que incrusta (ahí va el QR) y los enlaces. Si el PDF trae el QR dibujado con vectores, se le pide la imagen del QR.
3. Solo se acepta `https://cedulaprofesional.sep.gob.mx/cedula-profesional/validar-folio?curp=<CURP>&id=<folio>`: https, ese host exacto (no `cedulaprofesional.sep.gob.mx.evil.com` ni subdominios), sin puerto ni usuario, esa ruta exacta, una CURP con formato válido y un folio numérico. Lo demás se rechaza con un mensaje y no cambia el estado.
4. Validación automática con la SEP: **no disponible** (ver abajo). La solicitud queda `EN_REVISION`.
5. Si algún día se puede leer la SEP: cédula válida + nombre que coincide (sin acentos ni mayúsculas, en cualquier orden, ignorando "de", "la", "del"…, con una palabra de más o de menos) → `ACREDITADO` al instante. Si no coincide → `EN_REVISION`. Además siempre van a revisión: una CURP que ya usa otra cuenta y una cuenta a la que se le revocó la acreditación.

### La página de la SEP

Revisada el 28 oct 2026 solo con datos inventados (CURP `XEXX010101HNEXXXA4`), nunca con el QR real del cliente. `validar-folio` es una aplicación Angular: el servidor devuelve la misma página vacía sea cual sea el folio, y el navegador pide el resultado a una API (`validarConstanciaByFolio/folio/<folio>`) que exige un token de acceso y un token de **reCAPTCHA v3** en cada consulta. Saltar un captcha no es aceptable, así que no se consulta: `src/features/accreditation/sep-verifier.ts` responde "no disponible". Si la SEP publica una vía abierta, se cambia ese verificador y nada más.

## Privacidad

- **El archivo no se guarda.** Se lee en memoria y se descarta: es un documento personal y para cotejar basta el enlace de la SEP.
- **La CURP no se guarda en claro**, solo su hash (`SCurpHash`): HMAC-SHA256 con `ACCREDITATION_HASH_SECRET` (prefijo `hmac:`) o, si falta, SHA-256 con prefijo fijo (`sha256:`, más débil). Sirve para notar dos cuentas con la misma CURP. **No cambiar el secreto una vez puesto.**
- Se guardan: estado, folio, fecha de solicitud y de verificación, número de cédula y nombre tal como los muestre la SEP (si se pudieran leer), resultado automático, motivo y quién resolvió.
- **La URL de verificación** (lleva la CURP) se guarda solo mientras está `EN_REVISION`; aprobar o rechazar la borra.

## Revisión manual

No existe un rol de administrador de plataforma, así que se resuelve con un script, siempre en simulación salvo `--apply`:

```bash
pnpm accreditation:review pendientes                       # correo, nombre, folio y enlace de la SEP de cada solicitud
pnpm accreditation:review estado   <correo>
pnpm accreditation:review aprobar  <correo>             --por "Brandon" --apply
pnpm accreditation:review rechazar <correo> "<motivo>"  --por "Brandon" --apply
pnpm accreditation:review revocar  <correo> "<motivo>"  --por "Brandon" --apply
```

En el contenedor de producción: `node --import tsx scripts/ops/acreditacion.ts <comando> …`.

Para aprobar: abrir el enlace en un navegador (la SEP muestra el resultado tras su captcha) y comparar nombre y cédula con la cuenta. **Revocar** deja la fila en `RECHAZADO` con `DFechaRevocacion` y el motivo "Revocada: …"; cualquier subida posterior va a revisión. Sin el script, por SQL: `update devpware_acreditaciones_usuarios set "SEstado"='RECHAZADO', "DFechaRevocacion"=now(), "SUrlVerificacion"=null, "SMotivo"='Revocada: …' where "IdUsuario"=…`.

## Quién debe estar acreditado

El **emisor** del avalúo: su usuario responsable (`devpware_avaluos.IdUsuarioResponsable`) o, si no tiene, quien lo creó (`IdUsuarioCreador`). Las firmas de la carátula son texto libre, no cuentas, así que no cuentan. Se consulta al dibujar cada documento: si el emisor se acredita después, los documentos que se vuelvan a generar ya salen sin aviso.

## El aviso

Texto exacto, en negritas, negro y enmarcado (`src/features/accreditation/accreditation-notice.ts`):

> **AVISO: DOCUMENTO SIN VALIDEZ OFICIAL**
>
> **El presente documento constituye únicamente una estimación u opinión de valor, debido a que no se ha acreditado una cédula profesional o registro oficial vigente que respalde la facultad de su emisor para realizar avalúos. Por lo tanto, carece de validez oficial y no deberá considerarse como un avalúo certificado ni como una determinación acreditada del valor de mercado del inmueble.**

No es contenido del avalúo: se agrega al dibujar, así que no se edita ni se oculta. Aparece en:

1. **Portada (carátula)**, debajo de la imagen principal.
2. **Consideraciones previas al avalúo**, debajo del título de la sección. Si el valuador ocultó o borró la sección, se imprime solo su título con el aviso (nada de su contenido).
3. **Conclusión de valor**, debajo del título de la sección; igual si faltara.
4. **Memoria de cálculo**, al inicio.

El PDF del dictamen, el de la memoria, el .zip de entregables y el PDF que se envía por correo se generan abriendo esas mismas páginas, así que lo llevan. En el editor, la vista previa lo muestra y un aviso arriba explica por qué, con enlace a `/cuenta#acreditacion`.

## Código

| Qué | Dónde |
|---|---|
| Reglas puras (URL, nombres, decisión) | `src/features/accreditation/accreditation-rules.ts` |
| Texto del aviso y quién emite | `src/features/accreditation/accreditation-notice.ts` |
| Lectura del QR | `src/features/accreditation/qr-reader.ts` |
| Consulta a la SEP (no disponible) | `src/features/accreditation/sep-verifier.ts` |
| Servicio | `src/features/accreditation/accreditation.service.ts` |
| Pantalla y aviso en documentos | `src/features/accreditation/components/` , `src/app/(private)/cuenta/page.tsx` |
| API | `GET, POST /api/cuenta/acreditacion` |
| Revisión manual | `scripts/ops/acreditacion.ts` |
| Pruebas | `tests/accreditation-rules.test.ts`, `tests/accreditation-notice-render.test.tsx`, `tests/integration/accreditation.integration.ts` |
