# Valuo

Sistema SaaS de avalúos inmobiliarios construido como monolito modular con Next.js App Router, TypeScript, Prisma y PostgreSQL/PostGIS.

## Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS v4, shadcn/ui
- **ORM:** Prisma 6.19
- **Base de datos:** PostgreSQL + PostGIS
- **Autenticación:** Custom (jose + bcryptjs), Google OAuth
- **Almacenamiento:** AWS S3 / Local (desarrollo)
- **Email:** AWS SES v2 / Console (desarrollo)
- **PDF:** pdf-lib

## Requisitos

- Node.js >= 20
- PostgreSQL con extensión PostGIS
- pnpm 12 (`corepack enable` o `brew install pnpm`)

## Instalación

```bash
pnpm install
docker compose -f compose.dev.yml up -d   # base local PostGIS 18
cp .env.example .env
# Configurar variables en .env (ver abajo)
pnpm exec prisma migrate dev
pnpm dev
```

## Variables de entorno

Las variables se configuran en `.env`. Ver `.env.example` para la plantilla completa.

Variables mínimas para desarrollo:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/valuo_dev"
APP_URL="http://localhost:3000"
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm start` | Servidor de producción |
| `pnpm lint` | Linting con ESLint |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:integration` | Pruebas contra la base local de Docker |
| `pnpm db:migrate` | Ejecutar migraciones Prisma |
| `pnpm db:studio` | Abrir Prisma Studio |
| `pnpm db:seed` | Sembrar base de datos |

## Estructura

```
src/
  app/          Rutas App Router (pages, API routes)
  features/     Modulos de dominio (auth, valuations, comparables, dashboard, files, reports)
  components/   Componentes UI compartidos (shadcn/ui)
  infrastructure/  Adaptadores (Prisma, storage, email)
  security/     Guards, tokens, validación
  lib/          Utilidades compartidas
prisma/         Schema, migraciones, seed
tests/          Tests unitarios e integración
docs/           Documentación técnica
```

## Base de datos

La fuente de verdad del esquema es:

- `prisma/schema.prisma`
- `prisma/migrations/`

No se deben borrar migraciones históricas ni usar `prisma db push` para forzar cambios.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Autenticación](docs/AUTHENTICATION_FLOW.md)
- [Autorización](docs/AUTHORIZATION.md)
- [Seguridad](docs/SECURITY.md)
- [Rutas](docs/ROUTES.md)
- [Módulos y base de datos](docs/MODULES.md)
- [Secciones de avaluos](docs/VALUATION_SECTIONS.md)
- [Comparables](docs/COMPARABLES.md)
- [Archivos y storage](docs/FILES.md)
- [Testing](docs/TESTING.md)
- [Deployment checklist](docs/DEPLOYMENT_CHECKLIST.md)

## Proveedores externos

Las integraciones de SES, Google OAuth, S3, mapas/geocodificación y pagos requieren configuración de credenciales en `.env`. Los adaptadores de desarrollo están incluidos para uso local sin credenciales reales.

## Known issues

- Tests estructurales (clase B) pueden fallar por refactoring de código fuente
- 49 lint errors preexistentes (refs, hooks, require imports)
- Editor de avaluos: `valuation-workspace.tsx` y `valuation-workflow.service.ts` ya están divididos en hooks y módulos; falta el rediseño de la UI
