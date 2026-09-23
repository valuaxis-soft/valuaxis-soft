#!/usr/bin/env bash
# Prueba que el respaldo más reciente se puede restaurar, sin tocar producción.
# Restaura en una base temporal dentro del mismo contenedor, cuenta avalúos y la borra.
set -euo pipefail

CONTAINER="${CONTAINER:-valuos-database-migrated}"
DATABASE="${DATABASE:-devpware_avaluos_local}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/valuos}"
SCRATCH_DB="restore_test_$(date +%s)"

LATEST="$(ls -t "$BACKUP_DIR"/${DATABASE}_*.dump | head -1)"
DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"

docker exec "$CONTAINER" createdb -U "$DB_USER" "$SCRATCH_DB"
trap 'docker exec "$CONTAINER" dropdb -U "$DB_USER" --if-exists "$SCRATCH_DB"' EXIT

docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$SCRATCH_DB" --no-owner < "$LATEST"
COUNT="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$SCRATCH_DB" -Atc 'select count(*) from devpware_avaluos')"
echo "Respaldo $LATEST restaurado correctamente: $COUNT avalúos."
