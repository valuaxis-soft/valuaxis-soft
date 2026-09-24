# Pruebas

```bash
pnpm test
```

Tipos: `pnpm typecheck` (genera primero los tipos de las rutas de Next; `tsc` solo falla en una copia recién clonada).

Usa `node:test` a través de `tsx --test`, sobre `tests/**/*.test.ts` y `tests/**/*.test.tsx`. No hay framework adicional.

## Pruebas de integración

Corren contra una base PostgreSQL local, nunca contra producción:

```bash
docker compose -f compose.dev.yml up -d   # PostGIS 18, igual que producción
pnpm exec prisma migrate deploy
pnpm test:integration
```

Leen `DATABASE_URL` de `.env` y se niegan a correr si no apunta a `localhost`. Cada prueba crea su propia organización, usuario y avalúo.

## Avalúo de demostración

`scripts/demo/load-demo-valuation.ts` carga un avalúo completo en la base local, a través de la API igual que el editor: crea organización, administrador con sesión y avalúo, sube las imágenes y guarda el documento. Sirve para revisar el dictamen con datos reales:

```bash
pnpm build && pnpm start -p 3100
pnpm exec tsx --env-file=.env scripts/demo/load-demo-valuation.ts docs/fase0/dump/REAL_ARANDAS/demo/arandas.json http://localhost:3100
```

Imprime la cookie de sesión y la URL del dictamen. El caso Arandas (`docs/fase0/dump/REAL_ARANDAS/demo/`, fuera de git porque son datos del cliente) se genera con `python3 build.py` desde el volcado del Excel. Con almacenamiento local, `next start` solo sirve los archivos de `public/` que existían al compilar: vuelve a compilar después de cargar para ver las imágenes, o usa `pnpm dev`.

## Convenciones

- Las pruebas verifican **comportamiento**: entradas, salidas y HTML renderizado. No se aceptan pruebas que lean el código fuente como texto y busquen patrones; se rompen con cualquier refactor.
- Los componentes se prueban con `renderToStaticMarkup`. Si el componente usa portales, importa `tests/support/ssr-portal-shim.ts`.
- `tests/support/expect.ts` ofrece un `expect()` mínimo sobre `node:assert` para las pruebas migradas de vitest.
- Un bug conocido que todavía no se corrige se marca con `{ todo: "BUG: ..." }`. La suite sigue en verde y el bug queda visible.

## Validación de la metodología

Los scripts de `docs/fase0/metodologia/` recalculan los enfoques del Excel del despacho y los comparan contra los valores de referencia. Ver [fase0/README.md](fase0/README.md).
