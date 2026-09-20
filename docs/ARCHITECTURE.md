# Arquitectura

Valuo se mantiene como monolito modular Next.js App Router con TypeScript, Prisma y PostgreSQL/PostGIS.

## Capas

- `src/app`: rutas, route handlers y composicion de paginas.
- `src/features`: modulos de dominio y casos de uso.
- `src/infrastructure`: adaptadores tecnicos, como Prisma y almacenamiento.
- `src/security`: guards, validacion de redireccion y tokens.
- `src/components/ui`: biblioteca base shadcn/ui.
- `src/lib`: utilidades compartidas y shims temporales de compatibilidad.

## Reglas

- `app` puede depender de `features`, `components` y `security`.
- `features` puede depender de `infrastructure`, `security` y `components/ui`.
- `infrastructure` no contiene reglas de negocio.
- `components/ui` no depende de modulos de dominio.

## Estado de esta etapa

- `features/valuation` fue normalizado a `features/valuations`.
- Storage, uploads, reportes PDF, comparables y helpers de valuacion fueron movidos a modulos de dominio o infraestructura.
- Las APIs antiguas de `logout`, `uploads` e `history` siguen disponibles como compatibilidad.
- El editor de avalúos ahora esta dividido en coordinador, top bar, navegacion, editor, panel de vista previa y feedback.
- `StorageProvider` separa contrato de almacenamiento de la implementacion local de desarrollo.
