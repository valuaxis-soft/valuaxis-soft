# Respaldos y recuperación

Cómo se respalda la base de producción, qué falta para que un respaldo sobreviva a perder el servidor y cómo se recupera el servicio. El servidor y sus rutas están en [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md); por qué se eligieron `age` y Backblaze B2, en [ADR 0002](adr/0002-respaldos-fuera-del-servidor-age-b2.md).

## Estado al 27 nov 2026 (según la auditoría del servidor del 21 nov)

| | Qué | Estado |
|---|---|---|
| Base de datos | Volcado diario en el mismo servidor | **Implementado** |
| Base de datos | Copia cifrada fuera del servidor (`age` + Backblaze B2 con Object Lock) | **Pendiente: no está corriendo** |
| Base de datos | Aviso si el respaldo falla o deja de correr (healthchecks.io) | **Pendiente** |
| Servidor completo | Respaldo semanal automático de Hostinger (fuera del VPS, se conservan los dos más recientes) | Implementado por Hostinger |
| Fotos y documentos | Versionado del bucket S3 de la app (`AWS_S3_BUCKET`), versiones viejas a 90 días | Activado al migrar al bucket de la empresa (22 nov); confirmar en la consola de AWS |

**Lo que esto significa hoy:** si se pierde el servidor, la base se recupera del respaldo semanal de Hostinger, así que se pueden perder **hasta unos siete días** de trabajo. El volcado diario vive en el mismo disco: protege contra errores humanos (un borrado, un despliegue malo), no contra perder el servidor.

Objetivos propuestos, **pendientes de aprobación del dueño de las cuentas**: RPO de 24 h (perder como máximo un día) y RTO de 8 h hábiles (reconstruir en un VPS nuevo desde B2). Solo se cumplen cuando la copia fuera del servidor esté corriendo.

## 1. Respaldo diario (implementado)

| | Valor |
|---|---|
| Programación | `valuaxis-db-backup.timer` de systemd, 02:30 más hasta 5 min al azar (corre hacia las 02:32) |
| Script | `scripts/ops/backup-db.sh` del código desplegado (`/opt/apps/valuos/repository`) |
| Destino | `/srv/backups/valuos/database/daily/devpware_avaluos_local_<AAAA-MM-DD_HHMM>.dump`, modo 600 |
| Retención | 14 días |
| Verificación | Cada volcado se lee con `pg_restore --list` antes de darse por bueno |
| Resultado | `journalctl -u valuaxis-db-backup -n 30` (no hay archivo de log propio) |

El cron de las 03:30 que describía una versión anterior de [OPERACION.md](OPERACION.md) se quitó el 21 nov: el timer ya existía. No instalar los dos.

```bash
systemctl list-timers valuaxis-db-backup.timer --no-pager    # próxima y última corrida
ls -lt /srv/backups/valuos/database/daily/ | head -3          # el más reciente debe ser de hoy
systemctl start valuaxis-db-backup.service                    # respaldo manual (antes de un despliegue o mantenimiento)
```

## 2. Prueba mensual de restauración

**Hoy (con el volcado local):** `restore-test.sh` restaura el volcado más reciente en una base temporal del mismo contenedor, cuenta los avalúos y la borra. No toca la base de producción. Como el timer escribe en `database/daily/`, hay que indicarle la carpeta:

```bash
BACKUP_DIR=/srv/backups/valuos/database/daily /opt/apps/valuos/repository/scripts/ops/restore-test.sh
```

Anotar en la bitácora la fecha, el nombre del volcado, el número de avalúos y cuánto tardó. Un número de avalúos muy por debajo del último registrado es un incidente ([INCIDENTES.md](INCIDENTES.md)).

**Cuando exista la copia fuera del servidor:** la prueba se hace en una PC, nunca en el servidor, porque la llave privada no puede tocarlo:

1. Descargar el último `db/devpware_avaluos_local_*.dump.age` desde la consola de B2 (o con una llave de solo lectura que guarda el dueño, nunca el servidor).
2. Descifrar: `age -d -i llave.txt -o ultimo.dump ultimo.dump.age` y borrar `llave.txt`.
3. Restaurar en un contenedor temporal con la misma imagen que `compose.dev.yml`:

   ```bash
   docker run -d --name restore-test -e POSTGRES_PASSWORD=prueba postgis/postgis:18-3.6
   sleep 15
   docker exec restore-test createdb -U postgres restore_test
   docker exec -i restore-test pg_restore -U postgres -d restore_test --no-owner --no-privileges < ultimo.dump
   docker exec restore-test psql -U postgres -d restore_test -Atc 'select count(*) from devpware_avaluos'
   ```

4. Limpiar: `docker rm -f restore-test` y borrar `ultimo.dump` y `ultimo.dump.age` (tienen datos personales).
5. Cada tres meses, descifrar también el último `config/*.tar.gz.age` y confirmar que trae `production.env`.

## 3. Copia cifrada fuera del servidor (pendiente)

### Diseño

```
02:32  valuaxis-db-backup.timer → volcado diario (ya existe)
         └─ al terminar bien (OnSuccess=) → valuaxis-offsite.service
              1) toma el volcado más reciente (falla si tiene más de 24 h)
              2) lo cifra con age -R (en el servidor solo está la LLAVE PÚBLICA)
              3) lo sube a B2 con una llave que solo puede escribir (writeFiles)
              4) hace lo mismo con un tar pequeño de configuración (production.env, compose, proxy)
              5) avisa a healthchecks.io; si el aviso no llega, healthchecks manda alerta
B2     bucket privado con Object Lock en modo Compliance, 30 días, y ciclo de vida de ~36 días
```

| Pieza | Decisión | Por qué |
|---|---|---|
| Cifrado | [`age`](https://github.com/FiloSottile/age) con un destinatario X25519 | El servidor cifra con la llave pública y **no puede descifrar**. La llave privada nunca toca el VPS |
| Llave privada | Solo con el dueño de las cuentas: en su gestor de contraseñas y en dos hojas impresas guardadas en lugares distintos | Sin ella nadie abre los respaldos, ni el proveedor, ni el operador, ni un atacante. **Si se pierden las tres copias, los respaldos de B2 no se pueden leer** |
| Subida | `curl` + `jq` contra la API nativa de B2 (v4) | Es el camino documentado que funciona con solo `writeFiles`; la CLI y las herramientas S3 piden más permisos |
| Llave de B2 del servidor | Restringida al bucket, capacidad `writeFiles` y nada más | No puede listar, descargar ni borrar. Si la roban, puede subir basura (tope de gasto en *Caps & Alerts*) u ocultar archivos (ocultar no borra) |
| Object Lock | Compliance, 30 días | Ni la cuenta dueña puede borrar ni acortar el bloqueo. Governance no basta: quien tome la cuenta puede saltarlo |
| Ciclo de vida | Ocultar a los 35 días, borrar 1 día después | La retención casi igual al bloqueo: no quedan copias viejas sin candado |
| Aviso | healthchecks.io, periodo 1 día, gracia 3 h | Avisa si falla **y** si deja de correr |

**Qué protege y qué no:** si alguien toma el servidor, no puede abrir, listar ni borrar los respaldos que ya están en B2. Pero la base viva y los volcados locales sí están en claro en el servidor: este diseño protege la copia de recuperación, no sustituye el endurecimiento del servidor.

### Instalación (resumen)

1. **Desde la cuenta de B2, nunca desde el servidor:** cuenta a nombre de la empresa con verificación en dos pasos; bucket privado con Object Lock (no se puede desactivar después), retención por defecto Compliance 30 días, regla de ciclo de vida y tope de almacenamiento.
2. **En la PC del dueño:** `age-keygen -o valuaxis-respaldos.key`. La llave pública (`age1…`) va al servidor; la privada, al gestor y a las dos hojas. Probar descifrar tecleando la llave desde la hoja; después borrar el archivo.
3. **En la PC, con la CLI `b2`:** crear la llave del servidor solo con `writeFiles` y restringida al bucket; cerrar la sesión de la llave maestra.
4. **En el servidor:** `apt-get install -y age`; la llave pública en `/etc/valuaxis/age-recipients.txt` (644, sin ninguna línea `AGE-SECRET-KEY`); la llave de subida y la URL de healthchecks en `/etc/valuaxis/offsite.env` (600). Es lo único sensible en el servidor y solo sirve para subir.
5. Instalar el script (abajo) en `/opt/apps/valuos/scripts/offsite-backup.sh` (700), la unidad `valuaxis-offsite.service` y un *drop-in* `OnSuccess=valuaxis-offsite.service` en `valuaxis-db-backup.service`; correrlo a mano y leer `/var/log/valuos-offsite.log` (agregarlo a logrotate).
6. **Pruebas obligatorias antes de confiar en él:** `b2_authorize_account` con la llave del servidor debe mostrar exactamente `["writeFiles"]` y solo el bucket de respaldos; en la consola de B2, el archivo subido debe mostrar retención Compliance a +30 días. Si no la muestra, detenerse.

Cuando funcione, el script entra al repositorio en `scripts/ops/` por PR, con su nota en [OPERACION.md](OPERACION.md).

### Script propuesto (no instalado ni probado)

No contiene secretos: los lee de `/etc/valuaxis/offsite.env`.

```bash
#!/usr/bin/env bash
# Encrypt the newest daily DB dump and a small config tarball with age (public key only)
# and upload them to Backblaze B2 with a write-only key. Nothing here can read or delete backups.
set -Eeuo pipefail
. /etc/valuaxis/offsite.env

DAILY=/srv/backups/valuos/database/daily
RECIPIENTS=/etc/valuaxis/age-recipients.txt
CONFIG_PATHS=(opt/apps/valuos/secrets opt/apps/valuos/deployment opt/platform/proxy srv/data/proxy)
STAMP=$(date +%Y-%m-%d_%H%M)
WORK=$(mktemp -d); chmod 700 "$WORK"

ping_hc() { curl -fsS -m 10 --retry 3 "$HC_URL$1" > /dev/null || true; }
trap 'rm -rf "$WORK"' EXIT
trap 'ping_hc /fail; echo "$(date -Is) offsite FAIL line $LINENO" >&2' ERR
ping_hc /start

# Newest dump, and refuse to upload a stale one (means the 02:32 job did not really run)
DUMP=$(ls -1t "$DAILY"/devpware_avaluos_local_*.dump | head -1)
[ -n "$(find "$DUMP" -mmin -1440)" ] || { echo "newest dump older than 24 h: $DUMP" >&2; false; }

age -R "$RECIPIENTS" -o "$WORK/db.age" "$DUMP"
tar -C / -czf - "${CONFIG_PATHS[@]}" | age -R "$RECIPIENTS" -o "$WORK/config.age"

# B2 native API v4; credentials go through stdin so they never show up in `ps`
AUTH=$(printf 'user = "%s:%s"\n' "$B2_KEY_ID" "$B2_APP_KEY" \
  | curl -fsS -m 30 --retry 3 -K - https://api.backblazeb2.com/b2api/v4/b2_authorize_account)
API=$(jq -r '.apiInfo.storageApi.apiUrl' <<< "$AUTH")
TOKEN=$(jq -r '.authorizationToken' <<< "$AUTH")
BUCKET_ID=$(jq -r '.apiInfo.storageApi.allowed.buckets[0].id' <<< "$AUTH")
UP=$(curl -fsS -m 30 --retry 3 -H "Authorization: $TOKEN" "$API/b2api/v4/b2_get_upload_url?bucketId=$BUCKET_ID")
UP_URL=$(jq -r '.uploadUrl' <<< "$UP")
UP_TOKEN=$(jq -r '.authorizationToken' <<< "$UP")

upload() { # $1 local file, $2 object name (only [A-Za-z0-9_./-], so no percent-encoding needed)
  curl -fsS -m 900 --retry 3 \
    -H "Authorization: $UP_TOKEN" -H "X-Bz-File-Name: $2" \
    -H "Content-Type: application/octet-stream" -H "X-Bz-Content-Sha1: $(sha1sum "$1" | cut -d' ' -f1)" \
    --data-binary @"$1" "$UP_URL" > /dev/null
}
upload "$WORK/db.age"     "db/$(basename "$DUMP").age"
upload "$WORK/config.age" "config/config_$STAMP.tar.gz.age"

ping_hc ""
echo "$(date -Is) offsite OK: $(basename "$DUMP") $(du -h "$WORK/db.age" | cut -f1)"
```

Se cifra a un archivo temporal antes de subir porque `b2_upload_file` exige `Content-Length`. Costo esperado: los volcados de unos MB × ~36 días caben en los 10 GB gratuitos de B2.

## 4. «Se perdió el servidor»

| Paso | Qué hacer |
|---|---|
| 1. Elegir el camino | **A)** hPanel → VPS → *Snapshots y respaldos*: restaurar el respaldo semanal (servidor completo, ~1 h 10 min). **B)** Si Hostinger o la cuenta no están disponibles, o el respaldo no sirve: VPS nuevo con Ubuntu 24.04. **Hoy solo existe el camino A**; el B depende de la copia de la sección 3 |
| 2. B) Reinstalar | Docker, usuarios y firewall según [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md) y [OPERACION.md](OPERACION.md) |
| 3. B) Configuración | En una PC: descargar el último `config/*.tar.gz.age`, descifrarlo y copiar al servidor nuevo `production.env`, los compose y la configuración del proxy |
| 4. Base de datos | En la PC: descargar y descifrar el último `db/*.dump.age`; copiar el `.dump` al servidor, levantar PostGIS y `pg_restore --no-owner` en una base vacía. Con el camino A, comparar la fecha del volcado de B2 con la del respaldo de Hostinger y quedarse con el más reciente |
| 5. Archivos | Siguen en S3, no dependen del VPS. Si se borraron, recuperar las versiones anteriores desde la consola de AWS (versionado) |
| 6. Volver a servicio | Levantar la app y el proxy, apuntar el DNS a la IP nueva si cambió, revisar con la lista de [INCIDENTES.md](INCIDENTES.md) y reinstalar el respaldo |
| 7. Cerrar | Borrar de la PC los archivos descifrados. Si se sospecha un ataque, rotar las llaves ([ACCESOS.md](ACCESOS.md)) |

La llave privada **nunca** se copia al servidor, ni siquiera al restaurar: se descifra en la PC y se sube el resultado.

## 5. Pendientes

1. Instalar la copia cifrada fuera del servidor (sección 3) y su aviso.
2. Aprobar los objetivos de recuperación (RPO y RTO).
3. Definir la retención de los volcados sueltos anteriores al timer en `/srv/backups/valuos` (`predeploy-*`) y borrarlos **solo** cuando la copia fuera del servidor esté corriendo.
4. Confirmar en la consola de AWS que el versionado del bucket sigue activo y que la llave de la app no puede borrar versiones ni cambiar el versionado.
5. Corregir el comentario de `scripts/ops/backup-db.sh` y el valor por defecto de `restore-test.sh`, que todavía hablan de cron y de `/srv/backups/valuos`.
