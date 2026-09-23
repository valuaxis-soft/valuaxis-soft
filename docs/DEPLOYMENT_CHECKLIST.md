# Deployment Checklist

Antes de produccion:

- Configurar `DATABASE_URL` PostgreSQL/PostGIS.
- Configurar email:
  - `EMAIL_PROVIDER=ses`
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `SES_FROM_EMAIL`
  - `SES_FROM_NAME`
  - `APP_URL`
- Configurar Google OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - callback local: `http://localhost:3000/api/auth/google/callback`
  - callback produccion: configurar segun dominio de despliegue.
- Configurar S3 privado.
- Configurar proveedor de mapas/geocodificacion.
- Configurar proveedor de pagos.
- Revisar cookies `Secure`, `HttpOnly`, `SameSite`.
- Activar security headers.
- Activar rate limiting persistente.
- Sustituir `DevelopmentMapProvider` por proveedor real.
- Sustituir `DevelopmentStorageProvider` por S3 privado.
- Validar la configuración real antes de desplegar; un servidor con variables inválidas no arranca:

```bash
pnpm env:check
```

- Aplicar migraciones pendientes (`pnpm exec prisma migrate deploy`) antes de levantar el código nuevo.
- Ejecutar:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

No usar `prisma db push` ni `prisma migrate reset` contra datos reales.

Prueba manual segura de email:

```bash
TEST_EMAIL_TO="destino@dominio.com" pnpm email:test
```

El script solo envia si `TEST_EMAIL_TO` esta definido y no registra tokens ni credenciales.
