# Archivos

## Almacenamiento

`src/infrastructure/storage/storage-provider.ts` define `StorageProvider` con dos implementaciones, elegidas con `STORAGE_DRIVER`:

- **`local`: `DevelopmentStorageProvider`.** Escribe en `public/` con las funciones de `storage.ts`. Los archivos quedan accesibles sin autenticación. Solo sirve para desarrollo.
- **`s3`: `S3StorageProvider`.** Sube con `PutObject` y entrega URLs firmadas de 15 minutos para descargar.

## Subidas

`src/features/files/services/upload.ts` valida el MIME, el tamaño (`MAX_UPLOAD_SIZE_MB`, 10 por defecto) y que el formato real coincida con el declarado. Normaliza las imágenes a JPEG de hasta 1920 px, calcula el checksum SHA-256 y registra `CargaArchivo`.

Servicios con aislamiento por organización y relación formal con el avalúo (`Archivo` y `RelacionArchivo`):

| Servicio | Ruta |
|---|---|
| Imagen principal de la carátula | `/api/avaluos/[id]/caratula/imagen-principal` |
| Imagen de encabezado | `/api/avaluos/[id]/caratula/imagen-encabezado` |
| Imágenes de Datos generales | `/api/avaluos/[id]/datos/imagenes` |
| Croquis de terreno | `/api/avaluos/[id]/info-terreno/croquis` |

## Pendientes

- **Las imágenes de todas las secciones salvo Datos generales se suben por `/api/uploads`** y el avalúo guarda la ruta del archivo. En producción van a S3 privado. Cada subida registra su `Archivo` (tipo `OTRO`), pero no queda relacionada con el avalúo en `RelacionArchivo`, así que no hay limpieza de archivos huérfanos.
- **Hasta el 23 de septiembre de 2026 `/api/uploads` fallaba** en toda base con la restricción `devpware_cargas_archivos_completada_check` (migración 011): registraba la carga como completada sin archivo. `scripts/diagnostico-produccion.sql` (sección 9) dice si producción la tiene.
- **Hasta el 23 de septiembre de 2026 las imágenes de terreno se guardaban con un id en lugar de la ruta** y se perdían al recargar. `scripts/diagnostico-produccion.sql` (sección 8) cuenta las afectadas.
- **La ruta de croquis (`/api/avaluos/[id]/info-terreno/croquis`) no la usa el editor:** era para dos croquis fijos, y la sección de terreno ahora admite imágenes libres.
- **No hay ruta autenticada para servir archivos locales.**
- **Sin escaneo antivirus.**

## Logotipo del despacho

Se sube en `/organizacion/despacho`. Es un `Archivo` de tipo `LOGOTIPO` relacionado con la organización (`SEntidad` `ORGANIZACION_LOGO`), guardado en `organizaciones/<uuid>/perfil/logotipo/`. Como toda imagen, se convierte a JPEG; las zonas transparentes quedan en blanco. El encabezado del dictamen lo usa cuando el avalúo no tiene imagen de encabezado propia.

## Dictamen en PDF

`POST /api/avaluos/[id]/dictamen/pdf` imprime `/avaluos/<id>/dictamen` con un Chromium sin interfaz (`src/infrastructure/pdf/chromium-pdf.ts`), abierto con la sesión de quien lo pide, y espera a que carguen las imágenes y se estabilice la paginación. Cada PDF se guarda en `organizaciones/<uuid>/avaluos/<uuid>/exportaciones/pdf/`, se relaciona con el avalúo (`SEntidad` `AVALUO_DICTAMEN_PDF`) y queda en `ExportacionAvaluo` con el hash de su contenido. Se generan como máximo dos a la vez.

Chromium viene de `CHROMIUM_PATH`: la imagen de producción instala `/usr/bin/chromium`; en desarrollo se apunta a Chrome (ver `.env.example`). Abre la app en `INTERNAL_APP_URL`, que por omisión es `http://127.0.0.1:$PORT`.

## Correos automáticos

- **Dictamen al cliente:** "Enviar por correo" en el dictamen genera un PDF nuevo (se guarda igual que una descarga) y lo manda adjunto. SES solo acepta adjuntos como mensaje MIME completo, que arma `src/infrastructure/email/mime-message.ts`. El remitente muestra el nombre del despacho con la dirección verificada en SES (`SES_FROM_EMAIL`); las respuestas van al correo del despacho. Límite: 25 MB de PDF.
- **Avisos al responsable del avalúo** (`src/features/notifications/valuation-notices.ts`): cuando otra persona se lo asigna al crearlo y cuando otra persona lo concluye. Salen después de responder (`after()`); si el correo falla se registra y la acción no se ve afectada.

