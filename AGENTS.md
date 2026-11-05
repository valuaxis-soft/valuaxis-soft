# Guía para agentes y asistentes de código

Valuaxis es un SaaS de avalúos inmobiliarios y de maquinaria para despachos de valuación en México. Este archivo da el contexto mínimo para trabajar en el repositorio sin romper lo que ya funciona. Lee primero lo que aplique a tu tarea en `docs/`; aquí solo están las reglas y los atajos.

## Antes de empezar

1. `docs/CONTRIBUIR.md`: quién hace qué (imSoft y devpware), cómo arrancar y las reglas de ramas, PR y migraciones. Las reglas de ese archivo mandan sobre esta guía.
2. `docs/ARCHITECTURE.md` y `docs/MODULES.md`: cómo está organizado el código.
3. Según la tarea: `docs/MOTOR-CALCULO.md` (cálculo), `docs/VALUATION_SECTIONS.md` (editor y dictamen), `docs/COMPARABLES.md`, `docs/COBRO.md`, `docs/ACREDITACION.md`, `docs/SECURITY.md`, `docs/AUTHORIZATION.md`, `docs/ROUTES.md`, `docs/OPERACION.md`, `docs/TESTING.md`.

## Stack

Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind v4 y shadcn/ui, Prisma 6 sobre PostgreSQL + PostGIS, pnpm 12, pruebas con `node:test` vía `tsx`. El PDF se genera en el servidor con Chromium. Mapas con Google Maps (llave del navegador y llave de servidor separadas) y calles de OpenStreetMap vía Overpass.

## Comandos

```bash
pnpm dev                                  # desarrollo
docker compose -f compose.dev.yml up -d   # base local PostGIS (contenedor valuaxis-db-dev)
pnpm exec prisma migrate deploy
pnpm typecheck && pnpm lint && pnpm test  # siempre antes de abrir un PR
pnpm test:integration -- --test-concurrency=3   # si tocaste base de datos o servicios
pnpm dlx knip@6                           # código sin uso: debe salir limpio
pnpm build
```

Las pruebas de integración leen `DATABASE_URL` de `.env` y solo corren contra `localhost`. Si trabajas en un worktree sin `.env`, copia el del checkout principal (está en `.gitignore`).

## Cómo entregar un cambio

- Rama propia (`feature/…`, `fix/…`, `infra/…`) a partir de `origin/main` actualizado. Nunca se sube directo a `main`.
- Commits en inglés, convencionales (`feat(editor): …`, `fix(billing): …`), con el cuerpo explicando el porqué cuando no es obvio.
- PR a `main` con descripción **en español, pensada para el valuador**: qué cambia para él, qué migración trae (si trae) y qué no se pudo verificar. Se fusiona con la CI en verde; si toca zonas compartidas (migraciones, `prisma/schema.prisma`, `src/infrastructure/**`, `src/security/**`, `src/proxy.ts`, `next.config.ts`, `deployment/**`, variables de entorno) se deja un comentario para que el otro equipo lo revise después de fusionar (regla 3 de CONTRIBUIR).
- Los agentes no despliegan ni tocan el servidor. El despliegue lo hace una persona desde `main`, siguiendo `docs/OPERACION.md`.
- Antes de hacer push, rebase sobre `origin/main`; si hay conflicto, conserva las dos conductas.

## Reglas de código

- **Idioma:** la interfaz, los mensajes de error, los textos del dictamen y las descripciones de PR van en español de México; el código, los nombres y los comentarios van en inglés. Sigue la densidad de comentarios del archivo que editas.
- **Estilo:** imita el archivo vecino (nombres, idioms, forma de los componentes). No agregues dependencias si el repo ya resuelve lo mismo; si agregas una, licencia MIT/BSD/Apache y justificación en el PR.
- **Datos nuevos:** antes de una migración, revisa si cabe en una columna JSON existente (`JConfiguracion`, `JCaracteristicas`, `JComparables`…). Si hace falta migración: solo `ADD COLUMN` (con `IF NOT EXISTS` y valor por defecto o `NULL`) o `CREATE TABLE`/`CREATE INDEX IF NOT EXISTS`; nunca `ALTER` de columnas, enums ni constraints existentes. Producción tiene reglas que no están en las migraciones (ver `scripts/diagnostico-produccion.sql`): revísalas antes de tocar una tabla. Una migración a la vez, con el número siguiente.
- **Seguridad:** toda ruta valida con Zod, exige sesión y permiso (`AUTH_PERMISSIONS`) y respeta el alcance de la organización; las rutas públicas son excepción documentada. La CSP usa nonce; los orígenes externos (Google Maps) se permiten solo en las rutas que los necesitan (`googleMapsPage`). Las llamadas a servicios externos con llave van por el servidor, con rate limit (`rate-limiter.ts`). Nunca escribas secretos ni llaves en el repositorio, en pruebas ni en salidas; en el servidor viven en `production.env`.
- **Documentos y PDF:** lo que se imprime no debe depender de recursos externos (las imágenes de mapas se guardan como imágenes del avalúo). La numeración de secciones tiene una sola fuente (`section-numbering.ts`).
- **Motor de cálculo:** el sistema calcula y avisa, nunca recomienda ni bloquea el criterio del valuador. Las únicas excepciones pedidas por el cliente son explícitas en el código (por ejemplo, el ±30 % del valor adoptado al concluir). Cualquier cambio en una fórmula se valida contra los Excel del despacho en `tests/`.
- **Editor:** todos los bloques, subbloques, conceptos y tablas ofrecen los mismos controles en todas las secciones (`block-toolbar.ts`, `table-context-menu.ts`). Borrar siempre confirma y es deshacible.
- **Documentación:** una ruta nueva va en `docs/ROUTES.md`; una variable de entorno nueva va en `.env.example`, `src/lib/env.ts` y `docs/OPERACION.md`; un script nuevo va en `package.json` y en el doc que corresponda.

## Pruebas

- Unitarias en `tests/*.test.ts(x)`; de integración en `tests/integration/*.integration.ts` (cada una crea su organización, usuario y avalúo); de punta a punta en `tests/e2e/`.
- Toda corrección lleva una prueba que la reproduce. Los cálculos se prueban con los valores esperados del despacho, no con los que produce el código.
- Las pruebas no usan datos personales reales (CURP, teléfonos, nombres de clientes): se inventan.

## Trabajo en paralelo

Cuando varios agentes trabajan a la vez, cada uno va en su propio worktree y rama, y se reparten áreas (editor, tablas, cálculo, dictamen, comparables, mapas) para no editar los mismos archivos. Quien termina después rebasa. Los worktrees viven en `.claude/worktrees/` (ignorado por git) y se borran al fusionar.

## Lo que no se hace

- Cambiar el precio, los planes o la configuración de Stripe sin que lo pida el operador; el cobro se enciende por organización con `pnpm billing:credits enforce`.
- Validar documentos contra la SEP de forma automática (pide captcha); la acreditación se aprueba a mano con `pnpm accreditation:review`.
- Guardar datos de un cliente real en plantillas, fixtures o documentación.
