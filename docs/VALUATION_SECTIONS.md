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
- `POST /api/avaluos/:id/reopen` crea una nueva versión de trabajo con una copia completa de la final (`valuation-version-copy.service.ts`): secciones, árbol de nodos, valores, tablas, carátula y comparables.
- Un avalúo concluido se muestra con el contenido de su versión final.
- Ninguna de las dos acciones tiene botón en la interfaz.

## Valores y tablas

- Los valores capturados se guardan exactamente como se escribieron, en texto. Los valores guardados antes del 23 de septiembre de 2026 pueden estar en forma numérica ("7000" en lugar de "7,000.00") y se muestran así.
- Las tablas se guardan como TableV2 sin pérdida (`table-persistence.ts`): ids de filas y columnas, texto exacto, fórmulas, formatos y esquema. Las filas, columnas y tablas borradas en el editor se marcan como eliminadas.
