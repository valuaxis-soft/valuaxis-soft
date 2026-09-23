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

## Cómo se guarda

- El editor guarda el avalúo completo con `PUT /api/avaluos/:id/full`. No se guardan secciones o bloques por separado.
- Todo el contenido se guarda en el árbol genérico `SeccionDocumento` → `NodoDocumento` → `ValorNodoDocumento`, con tablas en `TablaDocumento`. La única tabla normalizada que se escribe es `CaratulaAvaluo`.
- Los campos `kind` (`normalized`, `document`, `hybrid`), `tables` y `permissions` del registro son declarativos: hoy ningún código los consulta.

## Versionado

- Crear un avalúo asegura una `VersionAvaluo` de trabajo. Guardar no crea versión nueva.
- `POST /api/avaluos/:id/conclude` finaliza la versión de trabajo.
- `POST /api/avaluos/:id/reopen` crea una nueva versión de trabajo a partir de la final. Hoy solo copia los nodos raíz, sin valores ni tablas.
- Ninguna de las dos acciones tiene botón en la interfaz.
