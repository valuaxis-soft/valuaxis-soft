# Cómo trabajamos

Dos equipos trabajan sobre este repositorio: **imSoft** (Brandon) y **devpware** (Aron). Esta guía reparte las áreas y fija las reglas para no pisarnos.

## Quién hace qué

| imSoft | devpware |
|---|---|
| Funciones de la cotización COT-2026-001: dictamen en PDF, correos, equipos, IA, extracción de comparables, créditos y cobro | Almacenamiento en AWS (S3), centralización de archivos |
| Motor de cálculo, editor y dictamen (`src/features/valuations/**`) | `src/infrastructure/storage/**` |
| UX/UI, seguridad de la aplicación, SEO | Servidor: Dockerfile, compose, imagen con Chromium para el PDF, actualizaciones del sistema |
| Pruebas del motor contra los Excel del despacho | Respaldos automáticos (`scripts/ops/`), monitoreo, dominio de correo en SES |
| | Despliegues, siguiendo [OPERACION.md](OPERACION.md) |

Si una tarea no está en la tabla, se acuerda antes de empezarla.

## Empezar

```bash
git pull origin main
corepack enable                            # pnpm 12; el proyecto ya no usa npm
pnpm install
docker compose -f compose.dev.yml up -d    # PostGIS 18, la misma imagen que producción
cp .env.example .env                       # DATABASE_URL=postgresql://valuaxis:valuaxis@localhost:5432/valuaxis_dev
pnpm exec prisma migrate deploy
pnpm dev
```

Antes de abrir un PR, lo mismo que corre la integración continua:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build
```

## Qué cambió desde la versión inicial (c2ddd48)

- **pnpm** en lugar de npm; `package-lock.json` ya no existe.
- **Limpieza:** se quitaron código muerto, rutas sin uso y las pruebas que leían el código como texto. `pnpm dlx knip@6` revisa que no vuelva a entrar código sin uso.
- **Editor dividido** en `src/features/valuations/components/workspace/` (hooks y modelo) y servicio de guardado en `services/valuation-workflow/`.
- **Guardado sin pérdidas** de tablas y fórmulas, reapertura que copia todo, guardado automático.
- **Seguridad:** permisos desde la base (`AVALUO_*`), CSRF, validación con Zod, cabeceras y CSP con nonce, sesión deslizante, bloqueo por cuenta e IP, auditoría. Ver [SECURITY.md](SECURITY.md) y [AUTHORIZATION.md](AUTHORIZATION.md).
- **Marca Valuaxis**, página pública con SEO, modo oscuro, editor usable en teléfono y tableta.
- **Motor de cálculo** (`src/features/valuations/engine/`) y paneles de mercado, rentas, costos, ingresos y conclusión en el editor. Ver [MOTOR-CALCULO.md](MOTOR-CALCULO.md).
- **Migraciones 031 a 033:** 031 concilia el esquema con lo que producción tenía sin migración (idempotente), 032 y 033 son del motor.
- **Variables de entorno:** el servidor no arranca con una configuración inválida; `pnpm env:check` la valida antes de desplegar.

Toda la operación del servidor está en [OPERACION.md](OPERACION.md) e [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md).

## Reglas

1. **Nadie sube directo a `main`.** Cada cambio va en su rama (`feature/…`, `fix/…`, `infra/…`) y entra por PR.
2. **La integración continua debe pasar** (tipos, lint, pruebas, migraciones sobre una base vacía, código sin uso y compilación). Un PR en rojo no se fusiona.
3. **Revisión cruzada en las zonas compartidas:** si un PR toca migraciones, `prisma/schema.prisma`, `src/infrastructure/**`, `src/security/**`, `src/proxy.ts`, `next.config.ts` o variables de entorno, lo aprueba el otro equipo.
4. **Migraciones, una a la vez:** avisa antes de crear una, haz pull justo antes y usa el número siguiente. Deben ser idempotentes cuando tocan algo que producción ya pueda tener.
5. **Despliegues solo desde `main`**, con respaldo previo, `pnpm env:check` y el diagnóstico de `scripts/diagnostico-produccion.sql`, como indica [OPERACION.md](OPERACION.md). Se avisa en el chat antes y después.
6. **Secretos fuera del repositorio.** Las variables reales viven en el servidor; en el repositorio solo `.env.example`.
