# Arquitectura

Monolito modular con Next.js 16 (App Router), React 19, TypeScript, Prisma 6 y PostgreSQL con PostGIS. Gestor de paquetes: pnpm.

## Capas

| Carpeta | Contenido | Puede depender de |
|---|---|---|
| `src/app` | Páginas, layouts y route handlers | `features`, `components`, `security`, `lib` |
| `src/features` | Módulos de dominio: auth, valuations, files, dashboard, comparables, reports, notifications | `infrastructure`, `security`, `components/ui`, `lib` |
| `src/infrastructure` | Adaptadores técnicos: Prisma, almacenamiento, email | `lib` |
| `src/security` | Guards, hashing de tokens, validación de redirecciones | `features/auth` |
| `src/components/ui` | Componentes shadcn/ui sobre Base UI | nada de dominio |
| `src/lib` | Utilidades compartidas, cliente de API, variables de entorno | — |

`infrastructure` no contiene reglas de negocio. `components/ui` no depende de ningún módulo de dominio.

## El editor de avalúos

`ValuationWorkspace` coordina el estado del editor: metadatos, secciones y carátula, con deshacer y rehacer propios. Delega en la barra superior, la navegación de secciones, el panel del editor y el panel de vista previa. Guarda manualmente con `PUT /api/avaluos/[id]` y `PUT /api/avaluos/[id]/full`.

El documento tiene dos capas de presentación, ambas con formato v1 y v2 por compatibilidad con datos guardados:

- **Content layout:** acomodo de conceptos, tablas e imágenes en filas de hasta 3 columnas.
- **Block flow:** orden intercalado de filas de contenido y apartados dentro de un bloque.

La vista previa pagina midiendo el DOM real en tamaño carta. El PDF (`src/features/reports/services/pdf-generator.ts`) todavía no comparte ese motor.

## Deuda conocida

- `valuation-workspace.tsx` (unas 2,200 líneas) y `valuation-workflow.service.ts` (unas 1,600) concentran demasiada lógica y deben dividirse antes del rediseño.
- Quedan errores de lint de las reglas de React 19 (refs y `setState` durante el render) en el editor y la vista previa.
