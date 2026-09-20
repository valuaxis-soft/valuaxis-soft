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
- Ejecutar:

```bash
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm test
npm run build
```

No usar `prisma db push` ni `prisma migrate reset` contra datos reales.

Prueba manual segura de email:

```bash
TEST_EMAIL_TO="destino@dominio.com" npm run email:test
```

El script solo envia si `TEST_EMAIL_TO` esta definido y no registra tokens ni credenciales.
