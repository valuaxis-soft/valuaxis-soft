# 0002. Respaldos fuera del servidor con age y Backblaze B2

- **Estado:** propuesta (pendiente de la firma del dueño de las cuentas; todavía no está instalada)
- **Fecha:** 2026-11-21

## Contexto

La base de producción se respalda todos los días, pero el volcado vive en el mismo disco del VPS. Si se pierde el servidor (falla del proveedor, cuenta tomada, ransomware), la única copia independiente es el respaldo semanal de Hostinger, que es del mismo proveedor y la misma cuenta, no está cifrado en reposo y deja hasta una semana sin cubrir. La base contiene datos personales de los clientes de los despachos, así que la copia debe estar cifrada.

Requisitos que se fijaron para la copia:

1. Fuera del VPS y fuera de Hostinger (regla 3-2-1).
2. Inmutable por un tiempo: ni con la contraseña de la cuenta se borra antes de N días (defensa contra ransomware y contra un atacante con root en el servidor).
3. **Ningún secreto capaz de leer o borrar respaldos vive en el servidor** (pedido del dueño). Esto descartó restic, que necesita su contraseña en el servidor para cifrar.
4. Subida por API con una llave de solo escritura.
5. Costo predecible al crecer, incluida la descarga completa el día de restaurar, y salida sin penalización.
6. Verificación en dos pasos en la cuenta y auditorías de terceros (SOC 2 Type 2).

Se compararon Backblaze B2, Cloudflare R2, Wasabi, Amazon S3 (incluida Glacier Instant Retrieval) y los servicios de sincronización de archivos (Google Drive, Dropbox, OneDrive).

## Decisión

- **Cifrado con `age`** (llave pública X25519). El servidor solo tiene la llave pública: cifra pero no puede descifrar. La llave privada la guarda el dueño de las cuentas en su gestor de contraseñas y en dos hojas impresas en lugares distintos.
- **Almacenamiento en Backblaze B2**, en una cuenta a nombre de la empresa, con un bucket privado con **Object Lock en modo Compliance de 30 días** y un ciclo de vida de ~36 días.
- **Subida con una llave restringida al bucket con solo `writeFiles`**, usando la API nativa de B2 con `curl` (no puede listar, descargar ni borrar).
- Se encadena al respaldo diario existente (`OnSuccess=` del servicio del timer) y avisa con healthchecks.io si falla o deja de correr.
- Las fotos y documentos no se copian: se protegen con el **versionado del bucket S3** de la app, siempre que la llave de la app no pueda borrar versiones ni cambiar el versionado.

Por qué B2 y no las otras:

- **R2:** sus *bucket locks* no tienen modo Compliance; un token con permiso de configuración puede quitarlos.
- **Wasabi:** mínimo de 1 TB y 90 días por objeto; a este volumen es pagar por lo que no se usa.
- **S3 / Glacier IR:** egreso caro al restaurar todo, y Glacier exige 90 días mínimos por objeto (más del triple con una retención de ~36 días). Además sería la misma cuenta de AWS que ya usa la app.
- **Drive, Dropbox, OneDrive:** no tienen bloqueo inmutable, se conectan con tokens OAuth que caducan en silencio y suelen quedar a nombre de una persona.
- **B2:** modo Compliance real, sin mínimos, egreso gratis hasta 3× lo almacenado, llave de solo escritura documentada y SOC 2 Type 2. Con el volumen actual cabe en los 10 GB gratuitos.

Detalle técnico, instalación y script: [RESPALDOS.md](../RESPALDOS.md), sección 3.

## Consecuencias

- Si alguien toma el servidor, no puede abrir, listar ni borrar los respaldos que ya están en B2. Sí puede leer la base viva y los volcados locales: esto protege la copia de recuperación, no sustituye endurecer el servidor.
- **Si se pierden las tres copias de la llave privada, los respaldos de B2 no se pueden leer.** Es el precio de que nadie más pueda. Se mitiga con la prueba mensual de restauración, que descubre pronto una copia mala, y con generar un par nuevo el mismo día si una copia se expone.
- La prueba de restauración se hace en una PC con la llave del dueño, nunca en el servidor; quien opere no puede hacerla solo.
- B2 no documenta llaves físicas ni *passkeys*: la cuenta queda con verificación por app y códigos de respaldo impresos. Object Lock no protege contra cerrar la cuenta, así que la seguridad de la cuenta de B2 y del correo raíz van en par con el bloqueo.
- Un dato borrado en la app sigue en los respaldos de B2 ~36 días (y en las versiones de S3 hasta 90). Si eso es aceptable frente al derecho de cancelación y cómo se informa en el aviso de privacidad lo decide el abogado.
- Se reconsidera si un abogado determina que los datos deben residir en México (S3 en `mx-central-1` con Object Lock) o si el volumen pasa de varios TB (Wasabi).
