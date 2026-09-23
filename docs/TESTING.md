# Pruebas

```bash
pnpm test
```

Usa `node:test` a través de `tsx --test`, sobre `tests/**/*.test.ts` y `tests/**/*.test.tsx`. No hay framework adicional.

## Pruebas de integración

Corren contra una base PostgreSQL local, nunca contra producción:

```bash
docker compose -f compose.dev.yml up -d   # PostGIS 18, igual que producción
pnpm exec prisma migrate deploy
pnpm test:integration
```

Leen `DATABASE_URL` de `.env` y se niegan a correr si no apunta a `localhost`. Cada prueba crea su propia organización, usuario y avalúo.

## Convenciones

- Las pruebas verifican **comportamiento**: entradas, salidas y HTML renderizado. No se aceptan pruebas que lean el código fuente como texto y busquen patrones; se rompen con cualquier refactor.
- Los componentes se prueban con `renderToStaticMarkup`. Si el componente usa portales, importa `tests/support/ssr-portal-shim.ts`.
- `tests/support/expect.ts` ofrece un `expect()` mínimo sobre `node:assert` para las pruebas migradas de vitest.
- Un bug conocido que todavía no se corrige se marca con `{ todo: "BUG: ..." }`. La suite sigue en verde y el bug queda visible.

## Bugs conocidos marcados como pendientes

- `valuation-section-deduplication.test.ts`: los marcadores de sección vacíos guardados con etiquetas anteriores ("CONSTRUCCION", "COSTOS", "MERCADO VENTA") ya no se reemplazan por su plantilla.

## Validación de la metodología

Los scripts de `docs/fase0/metodologia/` recalculan los enfoques del Excel del despacho y los comparan contra los valores de referencia. Ver [fase0/README.md](fase0/README.md).
