# Files

Contrato tecnico:

- `StorageProvider`
- `DevelopmentStorageProvider`

Operaciones:

- `createUpload`
- `confirmUpload`
- `cancelUpload`
- `getPrivateDownloadUrl`
- `deleteObject`
- `calculateChecksum`
- `validateFile`

Estado actual:

- almacenamiento local de desarrollo;
- validacion de MIME, tamano y extension;
- checksum SHA-256;
- registro de carga en `CargaArchivo`.
- pruebas de MIME, tamano y checksum.

Pendiente:

- `S3StorageProvider`;
- URLs prefirmadas privadas;
- relacion formal con entidad mediante `RelacionArchivo`;
- antivirus/escaneo si se requiere en produccion.
