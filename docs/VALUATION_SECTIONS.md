# Valuation Sections

El registro central vive en `src/features/valuations/sections/section-registry.ts`.

Cada seccion define:

- clave;
- etiqueta;
- orden;
- tipo (`normalized`, `document`, `hybrid`);
- obligatoriedad;
- visibilidad;
- permisos;
- tablas Prisma reales utilizadas.

## Contratos

- `GET /api/avaluos/:id/sections`
- `GET /api/avaluos/:id/sections/:sectionKey`
- `PATCH /api/avaluos/:id/sections/:sectionKey`
- Compatibilidad temporal: `PUT` sigue activo.
- Bloques configurables permanecen bajo `/blocks` y aceptan `sectionKey` o id numerico.
- `PUT /api/avaluos/:id/full` persiste metadatos y secciones configurables en la version de trabajo.

## Modelo hibrido

- Secciones con reglas fuertes usan tablas normalizadas como `TerrenoAvaluo`, `ConstruccionAvaluo`, `ConclusionAvaluo`.
- Secciones configurables usan `SeccionDocumento`, `NodoDocumento`, `ValorNodoDocumento`.

## Versionado

- La creacion de un avaluo asegura `VersionAvaluo` de trabajo.
- El guardado no crea una version nueva.
- `POST /api/avaluos/:id/conclude` finaliza la version de trabajo si existen catalogos finales configurados.
- `POST /api/avaluos/:id/reopen` crea una nueva version de trabajo derivada de la final.
