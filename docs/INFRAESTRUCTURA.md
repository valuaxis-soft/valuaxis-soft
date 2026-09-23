# Infraestructura de producción

Relevado el 23 de septiembre de 2026 con los scripts de solo lectura `scripts/inventario-vps-2.sh` y `scripts/diagnostico-produccion.sql`.

## Servidor

- **VPS Hostinger KVM 4,** hostname `valuos-vps`, IP 168.231.74.90. Ubuntu 24.04, 4 vCPU, 16 GB de RAM, 200 GB de disco.
- **Acceso:** SSH como root solo con llave, sin contraseña. fail2ban activo. `ufw` permite únicamente 22, 80 y 443.
- **Dominio de la app:** https://valuaxissoft.com

## Contenedores

Todo corre con Docker Compose y `restart: unless-stopped`, así que los contenedores se levantan solos después de reiniciar el servidor.

| Contenedor | Imagen | Puertos | Datos persistentes |
|---|---|---|---|
| `valuos-app` | `devpware/valuos:local`, construida en el servidor | `127.0.0.1:3000` | `/srv/data/valuos/uploads` → `/app/public/uploads` |
| `valuos-database-migrated` | `postgis/postgis:18-3.6` | solo red interna | `/srv/data/valuos/postgres18-migrated` |
| `valuos-database` | `postgis/postgis:17-3.5` | solo red interna | `/srv/data/valuos/postgres` |
| `nginx-proxy-manager` | `jc21/nginx-proxy-manager:2.15.1` | 80, 443, admin en `127.0.0.1:81` | `/srv/data/proxy` |

## Rutas en el servidor

| Ruta | Contenido |
|---|---|
| `/opt/apps/valuos/repository` | Código desplegado. Hoy es el commit `c2ddd48`. |
| `/opt/apps/valuos/deployment` | `compose.production.yml`, `compose.migrated-db.yml`, `dockerfiles/Dockerfile.production` |
| `/opt/apps/valuos/secrets/production.env` | Variables de entorno reales. No se versionan. |
| `/opt/platform/proxy/compose.yml` | Proxy |

## Base de datos

La app usa la base `devpware_avaluos_local` del contenedor `valuos-database-migrated` (Postgres 18).

| Contenedor | Base | Tamaño | Avalúos | Estado |
|---|---|---|---|---|
| migrated (PG 18) | `devpware_avaluos_local` | 42 MB | 19 | **En uso.** Última modificación el 21 sep 2026 |
| migrated (PG 18) | `devpware_avaluos_migrada` | 40 MB | 6 | Copia anterior; último cambio el 18 jun 2026 |
| migrated (PG 18) | `devpware_avaluos` | 19 MB | — | Sin tablas de la app |
| valuos-database (PG 17) | `devpware_avaluos` | 36 MB | 0 | Vacía; solo sigue arriba por el `depends_on` de la app |

Datos reales al 23 sep 2026: 10 organizaciones, 11 usuarios, 19 avalúos, ninguno concluido. Primer avalúo el 10 de junio de 2026.

## Configuración de la app

- `NODE_ENV=production`, `STORAGE_DRIVER=s3`, `EMAIL_PROVIDER=ses`.
- Archivos en el bucket S3 `devpware-avaluos-produccion` (us-east-1).
- Correos enviados desde `no-reply@devpware.network`.
- Google OAuth con callback `https://valuaxissoft.com/api/auth/google/callback`.
- `AUTH_SECRET`, `VALUO_SESSION_SECRET`, `UPLOAD_DIR`, `EMAIL_FROM` e `INITIAL_ADMIN_*` están definidas pero el código no las usa, o solo las usa el script de alta inicial.

## Respaldos

No hay respaldos de base de datos: ni volcados ni tareas programadas que los generen. Solo existen los snapshots manuales de Hostinger.

## Pendientes

1. Respaldo diario de `devpware_avaluos_local` fuera del servidor.
2. Confirmar quién es dueño de la cuenta de AWS (S3 y SES), del cliente de Google OAuth y del dominio `devpware.network`.
3. Enviar correos desde un dominio de Valuaxis.
4. Retirar el contenedor de Postgres 17 y las bases sin uso, después de respaldarlas.
5. Aplicar las 30 actualizaciones y reiniciar en una ventana de bajo uso, con respaldo previo.
6. Quitar de `production.env` las variables que no se usan, sobre todo `INITIAL_ADMIN_PASSWORD`.
