# Operación del servidor

Procedimientos para el VPS de producción descrito en [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md). Todos se corren como root en la consola del servidor. Los que modifican algo piden respaldo previo.

## 1. Respaldo diario de la base

Instalar una vez:

```bash
mkdir -p /opt/apps/valuos/scripts
# Copiar scripts/ops/backup-db.sh y scripts/ops/restore-test.sh del repositorio a esa carpeta.
chmod +x /opt/apps/valuos/scripts/*.sh
/opt/apps/valuos/scripts/backup-db.sh          # primera corrida manual
/opt/apps/valuos/scripts/restore-test.sh       # comprueba que el respaldo se restaura
echo '30 3 * * * root /opt/apps/valuos/scripts/backup-db.sh >> /var/log/valuos-backup.log 2>&1' > /etc/cron.d/valuos-backup
```

- Corre todos los días a las 3:30 y conserva 14 días en `/srv/backups/valuos`.
- Cada volcado se verifica con `pg_restore --list` antes de darse por bueno.
- **Copia fuera del servidor:** un respaldo que vive en el mismo disco no protege contra perder el servidor. Mientras se define el almacenamiento externo, bajarlo periódicamente:

```bash
# Desde la computadora de imSoft
scp root@168.231.74.90:/srv/backups/valuos/*.dump ~/Respaldos/valuaxis/
```

- Probar la restauración una vez al mes con `restore-test.sh`. No toca la base de producción.

## 2. Desplegar una versión nueva

1. Respaldo manual: `/opt/apps/valuos/scripts/backup-db.sh`.
2. Actualizar el código en `/opt/apps/valuos/repository` al commit a desplegar.
3. Revisar la configuración con las variables reales:

   ```bash
   docker run --rm --env-file /opt/apps/valuos/secrets/production.env \
     -v /opt/apps/valuos/repository:/app -w /app node:24 \
     sh -c "corepack enable && pnpm install --frozen-lockfile --ignore-scripts && pnpm env:check"
   ```

   Si reporta variables inválidas, corregirlas antes de seguir: el servidor no arrancaría.
4. Migraciones. Primero ver cuáles registra la base:

   ```bash
   docker exec valuos-database-migrated psql -U devpware_avaluos_user -d devpware_avaluos_local \
     -Atc 'select migration_name from _prisma_migrations order by finished_at' | tail -3
   ```

   - Si aparecen las migraciones anteriores, aplicar las nuevas con `pnpm exec prisma migrate deploy` usando el `DATABASE_URL` de producción. Hoy son tres: `031_conciliar_esquema`, `032_motor_calculo` y `033_resumen_metodo`.
   - Si la tabla `_prisma_migrations` no existe, la base se creó sin Prisma Migrate: no correr `migrate deploy` a ciegas. Las migraciones 031, 032 y 033 son idempotentes y se pueden aplicar directo, en orden, con `psql -f prisma/migrations/<carpeta>/migration.sql`. Después se marca cada una como aplicada con `prisma migrate resolve --applied <carpeta>`.
5. Reconstruir y levantar la app:

   ```bash
   cd /opt/apps/valuos/deployment
   docker compose -f compose.production.yml -f compose.migrated-db.yml up -d --build valuos-app
   docker logs --tail 50 valuos-app
   ```

6. Probar en el navegador: iniciar sesión, abrir un avalúo, guardar, subir una imagen y exportar el PDF.

### 2.1 Imagen con pnpm (una sola vez)

Desde septiembre de 2026 el proyecto usa pnpm y ya no tiene `package-lock.json`. El Dockerfile que estaba en el servidor (`deployment/dockerfiles/Dockerfile.production`) hace `npm ci` y ya no compila. El nuevo vive en el repositorio, en [deployment/Dockerfile.production](../deployment/Dockerfile.production), junto con un `.dockerignore` en la raíz. Hace lo mismo que el anterior (mismo usuario `nextjs`, puerto 3000 y carpeta `public/uploads`), pero:

- Usa Node 24 y pnpm a través de corepack.
- Copia `pnpm-workspace.yaml` antes de instalar: ese archivo autoriza los scripts de compilación de `sharp` y Prisma.
- Arranca con `node_modules/.bin/next start`, sin pnpm, para que corepack no intente descargarlo al arrancar.

En el primer despliegue con esta versión, apuntar `compose.production.yml` al Dockerfile del repositorio:

```yaml
  valuos-app:
    build:
      context: /opt/apps/valuos/repository
      dockerfile: deployment/Dockerfile.production
```

Con eso, el Dockerfile del servidor queda sin uso: los cambios a la imagen entran por PR como el resto del código. Dentro del contenedor, las migraciones se corren con `node_modules/.bin/prisma migrate deploy` y la revisión de variables con `node --import tsx scripts/check-env.ts`.

Más adelante, el dictamen en PDF generado en el servidor (característica 11 de la cotización) va a necesitar Chromium en esta misma imagen.

## 3. Actualizaciones del sistema y reinicio

Los contenedores tienen `restart: unless-stopped` y se levantan solos.

```bash
/opt/apps/valuos/scripts/backup-db.sh
apt update && apt upgrade -y
reboot
# Después del reinicio
docker ps --format '{{.Names}} {{.Status}}'
```

Hacerlo en un horario de poco uso.

## 4. Secciones duplicadas

Producción tiene 6 secciones duplicadas. El código ya elige la sección correcta al leer, así que no es urgente. Para limpiarlas:

1. Respaldo manual.
2. Revisar el reporte previo que incluye `scripts/repair-duplicate-valuation-sections.sql` y aplicarlo dentro de una transacción.
3. Volver a correr `scripts/diagnostico-produccion.sql`; la sección 6 debe dar 0.

## 5. Retirar el Postgres 17 y las bases sin uso

La app usa `devpware_avaluos_local` en `valuos-database-migrated`. El contenedor `valuos-database` (Postgres 17) está vacío pero sigue arriba porque `compose.production.yml` lo pone como dependencia de la app.

1. Respaldar las tres bases que no se usan, por si acaso:

   ```bash
   docker exec valuos-database pg_dump -U devpware_avaluos_user -Fc devpware_avaluos > /srv/backups/valuos/pg17_devpware_avaluos.dump
   docker exec valuos-database-migrated pg_dump -U devpware_avaluos_user -Fc devpware_avaluos_migrada > /srv/backups/valuos/devpware_avaluos_migrada.dump
   docker exec valuos-database-migrated pg_dump -U devpware_avaluos_user -Fc devpware_avaluos > /srv/backups/valuos/pg18_devpware_avaluos.dump
   ```

2. En `compose.production.yml`, cambiar el `depends_on` de `valuos-app` a `valuos-database-migrated` y quitar el servicio `valuos-database`. Acordarlo con devpware, que mantiene ese archivo.
3. `docker compose ... up -d` y verificar que la app sigue funcionando.
4. Después de unas semanas sin problemas, borrar las bases `devpware_avaluos_migrada` y `devpware_avaluos` del contenedor nuevo.

## 6. Limpiar `production.env`

Quitar las variables que el código no usa o que solo sirvieron para el alta inicial:

- `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME`, `INITIAL_ORGANIZATION_NAME`, `INITIAL_ADMIN_EMAIL_VERIFIED`
- `AUTH_SECRET`, `VALUO_SESSION_SECRET`: las sesiones no usan secreto de firma.
- `UPLOAD_DIR`: producción usa S3.

Después, `pnpm env:check` (paso 2.3) y reiniciar la app.
