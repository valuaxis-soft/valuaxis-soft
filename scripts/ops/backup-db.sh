#!/usr/bin/env bash
# Respaldo diario de la base de producción de Valuaxis.
#
# Uso en el servidor (como root):
#   /opt/apps/valuos/scripts/backup-db.sh
# Programado con cron (ver docs/OPERACION.md).
#
# Genera un volcado en formato custom de pg_dump (comprimido, restaurable con
# pg_restore), verifica que se pueda leer y conserva los últimos KEEP_DAYS días.
set -euo pipefail

CONTAINER="${CONTAINER:-valuos-database-migrated}"
DATABASE="${DATABASE:-devpware_avaluos_local}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/valuos}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
STAMP="$(date +%Y-%m-%d_%H%M)"
TARGET="$BACKUP_DIR/${DATABASE}_${STAMP}.dump"
PARTIAL="$TARGET.partial"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -Fc "$DATABASE" > "$PARTIAL"

# Un volcado que pg_restore no puede leer no es un respaldo.
docker exec -i "$CONTAINER" pg_restore --list < "$PARTIAL" > /dev/null
mv "$PARTIAL" "$TARGET"
chmod 600 "$TARGET"

find "$BACKUP_DIR" -name "${DATABASE}_*.dump" -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%Y-%m-%dT%H:%M:%S%z') respaldo OK: $TARGET ($(du -h "$TARGET" | cut -f1))"
