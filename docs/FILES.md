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

- **Las imágenes de todas las secciones salvo Datos generales se suben por `/api/uploads`** y el avalúo guarda la ruta del archivo. En producción van a S3 privado. No quedan relacionadas con el avalúo en `RelacionArchivo`, así que no hay limpieza de archivos huérfanos.
- **Hasta el 23 de septiembre de 2026 las imágenes de terreno se guardaban con un id en lugar de la ruta** y se perdían al recargar. `scripts/diagnostico-produccion.sql` (sección 8) cuenta las afectadas.
- **La ruta de croquis (`/api/avaluos/[id]/info-terreno/croquis`) no la usa el editor:** era para dos croquis fijos, y la sección de terreno ahora admite imágenes libres.
- **No hay ruta autenticada para servir archivos locales.**
- **Sin escaneo antivirus.**
