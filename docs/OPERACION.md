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

La imagen incluye Chromium (`CHROMIUM_PATH=/usr/bin/chromium`) para generar el dictamen en PDF en el servidor; pesa alrededor de 2.6 GB. No hace falta ninguna variable nueva en `production.env`.

## 3. Actualizaciones del sistema y reinicio

Se hizo así el 28 de septiembre de 2026 (37 paquetes, kernel 6.8.0-136 → 142). La plataforma estuvo fuera unos 2 minutos, durante el reinicio. Hacerlo en un horario de poco uso y avisar al cliente antes.

1. **Revisar**, sin cambiar nada: qué se va a actualizar (kernel, Docker), que Docker arranque con el servidor y que los contenedores tengan `unless-stopped`.

   ```bash
   apt list --upgradable 2>/dev/null | tail -n +2
   systemctl is-enabled docker
   docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)
   ```

2. **Respaldar:** un snapshot en hPanel (VPS → Snapshots y respaldos → Nueva snapshot), que es lo único que revierte una actualización del sistema, y el volcado de la base:

   ```bash
   docker exec valuos-database-migrated pg_dump -U devpware_avaluos_user -Fc devpware_avaluos_local > /srv/backups/valuos/premantenimiento-$(date +%Y%m%d-%H%M).dump
   ```

3. **Actualizar** sin preguntas, conservando los archivos de configuración propios:

   ```bash
   export DEBIAN_FRONTEND=noninteractive
   apt-get update
   apt -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
   ```

   El aviso `apparmor.postinst: Illegal number: yes` es un error conocido del script de AppArmor en Ubuntu 24.04 y no afecta nada.

4. **Reiniciar** con `reboot`. Por la consola web de hPanel, volver a entrar a los 2 minutos.

5. **Comprobar:**

   ```bash
   uname -r
   ls /var/run/reboot-required 2>/dev/null || echo "sin reinicio pendiente"
   docker ps --format '{{.Names}}\t{{.Status}}'
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
   ```

   Los 4 contenedores se levantan solos y las bases quedan `healthy`. Si alguno no arranca: `docker compose -f compose.production.yml -f compose.migrated-db.yml up -d`. Si el servidor queda mal, restaurar el snapshot.

### 3.1 Limpiar imágenes viejas

Cada despliegue deja una imagen de unos 2.6 GB (`devpware/valuos:previo-…`) y caché de compilación. Conservar la actual (`local`) y la del último despliegue, y borrar las demás:

```bash
docker images devpware/valuos --format '{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}'
docker rmi devpware/valuos:<etiqueta-vieja>
docker image prune -f && docker builder prune -f
```

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

## 7. Llaves de Google Maps (`GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`)

Opcionales. Las usan la sección Croquis del editor ("Ubicación y croquis del inmueble": el mapa para ubicar el inmueble sujeto, la búsqueda de direcciones y "Generar croquis de localización", que guarda los croquis de macro y microlocalización y el mapa de comparables como imágenes del avalúo; `src/features/maps/`) y la página de demostración (`src/features/demo-maps/`). Sin llave la app funciona igual: el panel avisa que los mapas no están configurados y los croquis se agregan como cualquier imagen; la demostración dibuja su propio mapa con calles de OpenStreetMap.

Google se consulta desde dos lugares distintos, y por eso conviene tener dos llaves:

| Variable | Quién la usa | API que necesita | Restricción en Google Cloud |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | El navegador, para el mapa interactivo del editor y de la demostración. Quien abra la página la puede ver. | Maps JavaScript API | **Aplicación:** sitios web (referentes HTTP), solo `https://valuaxissoft.com/*`. **API:** solo Maps JavaScript API. |
| `GOOGLE_MAPS_SERVER_KEY` | El servidor, para la búsqueda de direcciones (`/api/mapas/geocodificar`). Nunca sale del servidor. Desde el 25 nov 2026 los croquis ya no le piden nada a Google (ver abajo). | Geocoding API | **Aplicación:** direcciones IP, solo la IP pública del VPS (`168.231.74.90`), o ninguna si cambia de IP. **API:** solo Geocoding API (Maps Static API ya se puede quitar de la llave). |

- Una llave restringida por referente **no funciona desde el servidor**: Google rechaza las llamadas sin `Referer`. Si solo se configura `GOOGLE_MAPS_API_KEY`, el servidor la usa también para la geocodificación, así que entonces esa llave debe permitir las dos APIs y no puede llevar restricción por referente (o se le quita la restricción de aplicación, con menos protección). La separación en dos llaves es la configuración recomendada.
- Las dos son variables de **runtime**: van en `production.env` y el contenedor las lee al arrancar (`env_file`). No llevan el prefijo `NEXT_PUBLIC_`, porque la imagen se compila sin `production.env`; la página lee la del navegador en el servidor en cada petición y se la pasa al navegador.
- Para probar en local se crean llaves aparte (`http://localhost:3000/*` como referente; sin restricción de IP para la del servidor), nunca se tocan las de producción.
- Después de agregarlas o cambiarlas: `pnpm env:check` (paso 2.3) y reiniciar la app (`docker compose ... up -d valuos-app`); no hace falta reconstruir la imagen.
- **Costo:** cada búsqueda de dirección es una llamada a Geocoding API; el mapa interactivo cobra por carga de página del editor con la sección abierta. "Generar croquis de localización" ya no cuesta nada en Google: el croquis se dibuja en el servidor con nuestra copia de OpenStreetMap. Conviene fijar una cuota diaria por API en Google Cloud (APIs y servicios → Cuotas). La app limita la geocodificación a 30 búsquedas por usuario por minuto y los croquis cuentan en el límite de subidas (60 cada 10 minutos).
- **Croquis sin imágenes de Google (25 nov 2026, matriz legal 1.5 bis):** los términos de Google Maps Platform (3.2.3 a/b) no permiten guardar sus imágenes, y el croquis, la memoria y el PDF se guardan. Por eso el croquis que se guarda e imprime (macro, micro y mapa de comparables) se dibuja en el servidor con **nuestra copia de OpenStreetMap** (`devpware_calles_osm`, la misma tabla de las calles resaltadas): las calles por jerarquía con los colores del mapa estándar de OpenStreetMap, sus nombres donde caben, y encima lo de siempre (calles resaltadas, trazo libre, letreros, pines, simbología, norte) y el crédito «© colaboradores de OpenStreetMap» en una esquina (`src/features/maps/osm-base-map.ts`, `server/croquis-image.service.ts`). No se usa ningún servidor de teselas (ni el de OpenStreetMap, cuya política no permite descargas masivas ni guardarlas para otro uso): todo sale de nuestra base, sin dependencia externa ni al generar ni al imprimir. Mismo tamaño (1280 × 800) y mismos encuadres que antes. La tabla solo tiene calles con nombre (las vías sin nombre, ríos y parques no se dibujan); mientras la tabla está vacía, el mapa base usa el respaldo de Overpass del inciso siguiente. Google solo se ve en pantalla, en el generador, con su atribución; a Google solo se le manda la dirección escrita en «Buscar dirección» (nunca datos del propietario o del solicitante). La vista «Satélite» y «Mapa limpio» solo cambian el mapa en pantalla.
- Los croquis quedan guardados como imágenes del avalúo: el dictamen, su PDF y los entregables no consultan a nadie ni necesitan la llave.
- **Croquis guardados antes del 25 nov 2026** (sobre imagen de Google): se redibujan con OpenStreetMap a partir de lo que guarda cada avalúo (pin, encuadre, calles resaltadas, trazo libre, letreros), en la misma llave de almacenamiento, así el documento no cambia:

  ```bash
  docker exec valuos-app node --import tsx scripts/ops/regenerar-croquis.ts --dry-run              # cuántos hay
  docker exec valuos-app node --import tsx scripts/ops/regenerar-croquis.ts --apply                # avalúos no concluidos
  docker exec valuos-app node --import tsx scripts/ops/regenerar-croquis.ts --apply --include-concluded   # también los concluidos
  ```

  `--org <id>` lo limita a una organización. Solo toca los archivos que generó el generador (`JMetadatos.uso = CROQUIS`), nunca una imagen subida a mano; marca los redibujados (`JMetadatos.base = openstreetmap`) y se puede repetir. Imprime solo conteos: croquis encontrados, redibujados, ya en OpenStreetMap, de avalúos concluidos sin tocar, sin ubicación, no generados y, aparte, cuántos PDF del dictamen guardados de esas versiones conservan la imagen anterior (no se borran: lo decide el operador). En desarrollo: `pnpm maps:regenerate-croquis --dry-run`.
- **Calles resaltadas (etapa 2):** las calles alrededor del pin son de OpenStreetMap y salen de **nuestra propia base** (tabla `devpware_calles_osm`, migración 061): todas las calles con nombre de México, copiadas del extracto diario de Geofabrik. Así no dependen de nadie: los espejos públicos de Overpass, de donde venían antes, fallaban casi siempre en producción (502 y tiempos de espera; `[STREETS] every Overpass mirror failed`). La consulta va siempre por el servidor (`GET /api/mapas/calles`), con caché en memoria de un día por coordenadas redondeadas y un límite de 20 consultas por usuario por minuto. Los datos son ODbL y el panel acredita a OpenStreetMap.
  - **Cargar o actualizar las calles** (una vez después de desplegar la migración 061, y luego cuando se quiera refrescar; cada pocos meses basta):

    ```bash
    docker exec valuos-app node --import tsx scripts/ops/importar-calles.ts
    ```

    Descarga `mexico-latest.osm.pbf` (~650 MB) a `/tmp` del contenedor, carga las calles por lotes y borra el archivo. No detiene la app ni necesita respaldo previo: solo escribe en `devpware_calles_osm`, que no guarda datos de ningún despacho. Se puede repetir: cada calle se inserta o se reemplaza, y solo al final de una carga completa se borran las que ya no existen en OpenStreetMap, así que la tabla nunca queda vacía a medias y una corrida interrumpida deja las calles anteriores. Medido el 22 nov 2026 en una laptop con el extracto de ese día: 1,658,427 calles, **530 MB** en disco la primera vez (352 MB la tabla, 112 MB el índice espacial, 61 MB la llave) y hasta **1 GB** después de una actualización (PostgreSQL reutiliza el espacio de las filas reemplazadas, no lo devuelve); entre 1 y 7 minutos de carga según lo ocupada que esté la máquina, más la descarga, y unos 0.8 GB de memoria mientras corre. Al terminar imprime filas, tamaño y memoria. Las zonas ya consultadas siguen en la memoria de la app hasta un día; `docker restart valuos-app` las refresca de inmediato.
  - Opciones: `--file <ruta>` carga un archivo ya descargado (por ejemplo, copiado con `docker cp`); `--url <url>` usa otro extracto; `--bbox oeste,sur,este,norte` carga solo esa zona, sin borrar nada (para probar: `--bbox -102.40,20.65,-102.28,20.76` es Arandas); `--keep` conserva la descarga. En desarrollo: `pnpm streets:import`.
  - **Respaldo con Overpass:** solo mientras la tabla está vacía (todavía no se corrió la carga) o no se puede leer, la app pregunta a los espejos públicos como antes (`overpass-api.de`, `overpass.kumi.systems` y `overpass.private.coffee`, con ventaja escalonada de 3.5 s, 12 s por espejo y 20 s en total); si no responden, el panel avisa con «Reintentar». Con la tabla cargada no se consulta a Overpass: es la misma fuente (OpenStreetMap), así que una zona sin calles en la tabla responde vacía de inmediato y el panel dice «OpenStreetMap no tiene calles con nombre en esta zona». Un fraccionamiento más nuevo que la última carga aparece al volver a correr la carga.
  - **Para diagnosticar:** `docker logs valuos-app 2>&1 | grep STREETS`. `source=db n=…` quiere decir que salieron de la base; `source=db n=0`, que la zona no tiene calles con nombre; `source=overpass n=…`, de un espejo (la tabla está vacía); `source=db failed`, que la tabla no se pudo leer (¿falta la migración 061?). Cuántas calles hay: `docker exec valuos-database-migrated psql -U devpware_avaluos_user -d devpware_avaluos_local -Atc 'select count(*), pg_size_pretty(pg_total_relation_size($$devpware_calles_osm$$)) from devpware_calles_osm'`.
- La CSP agrega los dominios de Google (`maps.googleapis.com`, `*.googleapis.com`, `*.gstatic.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `worker-src blob:`) solo en el editor (`/workspace`) y en las rutas `/demo/`; el resto de la app, incluidos el dictamen y la ventana de vista previa, conserva la política de siempre (`googleMapsPage` en `src/security/headers/security-headers.ts`).

## 8. Precio por avalúo ($170 MXN con IVA) y cobro con Stripe

El precio acordado es **$170.00 MXN con IVA incluido** por avalúo (video 5.2 del 2 nov 2026): paquete `AVALUO_1`, guardado como $146.55 antes de IVA + 16 %. Para crearlo o corregirlo, con el contenedor arriba:

```bash
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts           # simulación
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts --apply   # escribe
```

Es idempotente y no llama a Stripe.

**Stripe está conectado en producción desde el 5 nov 2026**: clave restringida en vivo de la cuenta del cliente (compartida con su tienda: no tocar sus llaves ni su configuración), webhook en `https://valuaxissoft.com/api/stripe/webhook`, configuración propia del portal de clientes y el paquete `AVALUO_1` sincronizado. Las variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION`) viven solo en `production.env`. Un administrador ya puede comprar avalúos en `/organizacion/facturacion`. Si cambia el importe del paquete, correr `docker exec -it valuos-app node --import tsx scripts/stripe-sync.ts`: crea el precio nuevo y archiva el anterior (detalle en [COBRO.md](COBRO.md)).

**Cobro al crear (Políticas comerciales, 23 nov 2026).** Un avalúo disponible se descuenta al oprimir «Crear avalúo» (o «Duplicar»); concluir, cancelar o reabrir no descuenta otro. Las cuentas nuevas reciben tres avalúos de prueba por un mes. Antes de desplegarlo, y después para confirmar, revisar qué ve cada organización (no escribe nada):

```bash
docker exec -it valuos-app node --import tsx scripts/billing-policies-report.ts
```

**Lo que sigue apagado por omisión es el bloqueo sin saldo** (`BCobroPorAvaluo`): crear un avalúo sin avalúos disponibles registra el consumo y deja el saldo en negativo, mostrado como pendiente de pago. Se enciende por organización solo cuando el cliente lo decida; con él encendido, «Crear avalúo» se bloquea con un enlace para comprar:

```bash
docker exec -it valuos-app node --import tsx scripts/billing-credits.ts enforce <slug|uuid> on
```

Un pago por transferencia o depósito confirmado en el banco se abona así (al precio vigente, una vez por referencia, con el correo de confirmación):

```bash
docker exec -it valuos-app node --import tsx scripts/billing-credits.ts payment <slug|uuid> <avalúos> transferencia|deposito "<referencia>"
```

Un cambio de precio se anuncia con al menos un mes de anticipación, solo cuando el cliente lo pida (aviso en la plataforma y correo a todos los usuarios; detalle en [COBRO.md](COBRO.md), «Cambio de precio»):

```bash
docker exec -it valuos-app node --import tsx scripts/billing-price-notice.ts announce <precio con IVA> <AAAA-MM-DD>           # simulación
docker exec -it valuos-app node --import tsx scripts/billing-price-notice.ts announce <precio con IVA> <AAAA-MM-DD> --apply   # registra y envía
```

### 8.1 Facturación CFDI con Facturapi (`FACTURAPI_KEY`)

**Apagada mientras no exista `FACTURAPI_KEY`.** Sin ella no se emite nada; los administradores pueden capturar sus datos fiscales en «Plan y facturación» y la página dice que la facturación automática todavía no está habilitada. Detalle del funcionamiento en [COBRO.md](COBRO.md), sección «Facturación CFDI».

Para encenderla (la cuenta de Facturapi y el CSD los maneja el cliente; nosotros nunca vemos el CSD ni su contraseña):

1. El cliente abre su cuenta en Facturapi, crea la organización emisora con sus datos fiscales, sube su CSD (.cer, .key y contraseña) y, si quiere, su logotipo y la serie de folios. Con el contador confirma las claves del SAT (ver COBRO.md).
2. Primero en pruebas: la llave secreta de pruebas (`sk_test_…`) en `/opt/apps/valuos/secrets/production.env`, nunca en el repositorio ni en un chat:

   ```
   FACTURAPI_KEY=sk_test_...
   # Opcionales; vacías usan 81112106 y E48.
   INVOICE_PRODUCT_KEY=
   INVOICE_UNIT_KEY=
   ```

   `FACTURAPI_BASE_URL` se deja sin definir en producción (solo sirve para pruebas en local).
3. Recrear la app (paso 2). Con una organización de prueba con datos fiscales completos, comprar el paquete más barato y revisar en «Movimientos» que aparezca la factura con PDF y XML, que llegue el correo y que en el panel de Facturapi (modo pruebas) esté la factura con los importes de Stripe. Reembolsar el cargo en Stripe y cancelar la factura de prueba en Facturapi.
4. Cambiar a la llave en vivo (`sk_live_…`) y recrear la app. Desde ese momento cada compra de una organización con datos fiscales se timbra ante el SAT.
5. Cada mes, el día 1 (el SAT pide emitir la factura global en cuanto cierra el periodo; el plazo exacto lo confirma el contador), la factura global de los pagos sin datos fiscales del mes anterior:

   ```bash
   docker exec -it valuos-app node --import tsx scripts/invoices-global.ts --month 2026-11           # simulación
   docker exec -it valuos-app node --import tsx scripts/invoices-global.ts --month 2026-11 --apply   # emite
   ```

Si una factura no sale: `docker logs valuos-app 2>&1 | grep "\[INVOICING\]"` (trae el código de Facturapi; el RFC aparece abreviado y la llave nunca). El mensaje completo del SAT o de Facturapi queda en la fila de la compra y lo ve el administrador en «Movimientos», con «Reintentar factura».

## 9. Acreditación profesional

Ver [ACREDITACION.md](ACREDITACION.md). Tras desplegar la migración 054:

- **Secreto de la CURP (una sola vez):** agregar a `production.env` `ACCREDITATION_HASH_SECRET` con 32 caracteres o más (`openssl rand -hex 32`), `pnpm env:check` y reiniciar. Hacerlo **antes** de que alguien suba su constancia y **no cambiarlo nunca**: los hashes guardados dejarían de compararse. Sin él la app funciona, con un SHA-256 simple.
- **Revisar solicitudes:** la validación automática con la SEP no está disponible (su página exige reCAPTCHA), así que toda constancia queda "En revisión":

  ```bash
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts pendientes
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts aprobar  <correo> --nivel maestria --programa "<programa>" --por "<quién>"            # simulación
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts aprobar  <correo> --nivel maestria --programa "<programa>" --por "<quién>" --apply
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts rechazar <correo> "<motivo>" --por "<quién>" --apply
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts revocar  <correo> "<motivo>" --por "<quién>" --apply
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts sin-nivel
  docker exec -it valuos-app node --import tsx scripts/ops/acreditacion.ts confirmar-nivel <correo> --nivel especialidad --programa "<programa>" --por "<quién>" --apply
  ```

  Antes de aprobar, abrir en un navegador el enlace de la SEP que imprime `pendientes` y comparar nombre, cédula, nivel y programa con la cuenta. Desde la migración 057 solo una especialidad, maestría o doctorado en valuación quitan el aviso; las cuentas acreditadas antes quedan igual hasta confirmar su nivel (`sin-nivel`, `confirmar-nivel`).

## 10. Errores al guardar con código

Cuando el guardado completo de un avalúo falla por algo inesperado, el usuario ve «No se pudo guardar el avalúo…. Código: G-XXXXXX» (con «Copiar código»). El mismo código queda en el log con el id del avalúo y la causa:

```bash
docker logs valuos-app 2>&1 | grep -A20 "G-XXXXXX"
```

Si dos elementos de una sección llegan con el mismo id (por ejemplo, imágenes de croquis copiadas con su bloque), el servidor les da uno propio y deja `[VALUATION_SECTIONS] repeated ids renamed` en el log.

## 11. Avalúos que se quedaron en «Nuevo» (una vez, al desplegar la migración 059)

Antes del 2 de noviembre de 2026 el primer guardado no pasaba el avalúo a «En edición», y la reprueba del 5 de noviembre vio avalúos con captura que seguían en «Nuevo». Después de desplegar, revisar y corregir con `scripts/ops/corregir-estado-nuevo.ts` (`pnpm valuations:fix-status`). Sin `--apply` solo lista lo que cambiaría:

```bash
docker exec valuos-app node --import tsx scripts/ops/corregir-estado-nuevo.ts
docker exec valuos-app node --import tsx scripts/ops/corregir-estado-nuevo.ts --apply
```

Cuenta como capturado el avalúo guardado más de 2 minutos después de crearse o que ya tiene comparables. Cada uno pasa a «En edición» con un renglón en su historial («corrección: ya tenía captura») y conserva su fecha de última modificación. Se puede correr otra vez: no cambia los ya corregidos.

La papelera no necesita tarea programada: al abrir «Papelera» en `/avaluos` se eliminan definitivamente los avalúos de ese despacho que llevan más de 30 días en ella (el renglón se conserva por los créditos y la auditoría; solo deja de aparecer y de poder restaurarse).

## 12. Correo con Resend (`EMAIL_PROVIDER=resend`)

Todos los correos de la app (verificación de cuenta, «olvidé mi contraseña», invitaciones al equipo, avisos de avalúos y el dictamen al cliente con el PDF adjunto) salen por el proveedor que indique `EMAIL_PROVIDER`: `development` (solo registra en el log), `ses` (Amazon SES, se conserva como respaldo) o `resend`. Por qué Resend: [ADR 0001](adr/0001-correo-con-resend.md).

1. En Resend, el dominio `valuaxissoft.com` ya está verificado (región us-east-1). Crear una llave de API con permiso **solo de envío** (*Sending access*) limitada a ese dominio. La llave se ve una sola vez: se pega directo en el servidor, nunca en el chat, en un ticket ni en el repositorio.
2. Editar `/opt/apps/valuos/secrets/production.env`:

   ```bash
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=<llave de Resend>
   EMAIL_FROM_ADDRESS=no-reply@valuaxissoft.com
   EMAIL_FROM_NAME=Valuaxis Soft
   EMAIL_REPLY_TO=contacto@valuaxissoft.com
   ```

   - `EMAIL_FROM_ADDRESS` y `EMAIL_FROM_NAME` son el remitente para cualquier proveedor. Si faltan, la app usa `SES_FROM_EMAIL` y `SES_FROM_NAME`; hoy `SES_FROM_EMAIL` apunta a un dominio que Resend no tiene verificado, así que **hay que definir `EMAIL_FROM_ADDRESS`** con la dirección de `valuaxissoft.com`.
   - `EMAIL_REPLY_TO` es opcional: a dónde llegan las respuestas a los correos del sistema. El dictamen no la usa: sus respuestas van al correo del despacho («Datos del despacho»), igual que antes.
   - `EMAIL_FROM` no lo lee el código (es de la configuración inicial); se puede dejar o quitar.
   - Las variables de SES (`AWS_SES_*`, `SES_FROM_*`) se pueden dejar: no estorban y permiten volver a `EMAIL_PROVIDER=ses` si hiciera falta.
3. `pnpm env:check` (paso 2.3). Con `EMAIL_PROVIDER=resend` y sin `RESEND_API_KEY` reporta la variable y el servidor no arrancaría.
4. Recrear la app para que lea `production.env` (no hace falta reconstruir la imagen):

   ```bash
   cd /opt/apps/valuos/deployment
   docker compose -f compose.production.yml -f compose.migrated-db.yml up -d valuos-app
   ```

5. Correo de prueba (un correo de verificación con un enlace que no sirve; no registra la llave ni tokens):

   ```bash
   docker exec -e TEST_EMAIL_TO=<tu correo> valuos-app node --import tsx scripts/send-test-email.ts
   ```

   En local, con las variables en `.env`: `TEST_EMAIL_TO=<tu correo> pnpm email:test`.
6. Probar en el navegador «¿Olvidaste tu contraseña?» con una cuenta propia y, en un avalúo de prueba, «Enviar por correo» el dictamen a un correo propio: debe llegar con el PDF adjunto, a nombre de «<despacho> vía Valuaxis Soft».

Si un correo no sale, el usuario ve el mismo mensaje de siempre y el log lo dice sin mostrar la llave: `docker logs valuos-app 2>&1 | grep -E "Resend email delivery failed|PASSWORD_RESET_EMAIL|DICTAMEN_EMAIL"` (trae el código HTTP y el motivo que dio Resend, por ejemplo dominio no verificado o llave inválida). La solicitud a Resend se corta a los 25 s. El PDF del dictamen se limita a 25 MB (Resend acepta 40 MB por correo, contando el adjunto en base64). Para volver a SES: `EMAIL_PROVIDER=ses` y recrear la app.

## 13. Búsqueda de comparables con IA (`AI_COMPARABLE_SEARCH_ENABLED`)

«Buscar con IA en la web», dentro de «Buscar comparables», está **apagada por omisión** porque cada búsqueda cuesta bastante más que las otras ayudas de IA (ver «Costo y registro de uso» en [IA.md](IA.md)). Para encenderla:

1. En `/opt/apps/valuos/secrets/production.env`, con la llave de Anthropic ya puesta (`ANTHROPIC_API_KEY`, nunca en el repositorio ni en un chat):

   ```
   AI_COMPARABLE_SEARCH_ENABLED=true
   # Opcional; vacío usa claude-opus-5-5.
   AI_SEARCH_MODEL=
   ```

2. En la consola de Anthropic (Settings → Capabilities) la búsqueda web debe estar permitida para la organización de esa llave. Viene permitida salvo que un administrador la haya deshabilitado.
3. Recrear la app (paso 2) y, en un avalúo de prueba con un terreno, abrir «Buscar comparables» → «Buscar con IA en la web» → «Buscar». Debe mostrar el avance y, en uno o dos minutos, la tabla de anuncios. Abrir al menos tres ligas y comparar precio y superficie con el anuncio.
4. Si falla: `docker logs valuos-app 2>&1 | grep -E "\[AI\]"`. `COMPARABLE_SEARCH failed: configuration` es llave inválida (401) o búsqueda web deshabilitada en la consola (la línea `web search rejected by the provider` trae el motivo); `timeout` es que pasó de 240 s; `no_credit`, que la cuenta no tiene saldo.

Para apagarla, quitar la variable o ponerla en `false` y recrear la app: la opción queda deshabilitada con su aviso y lo demás funciona igual. La búsqueda corre en segundo plano dentro del contenedor (la petición que la inicia responde de inmediato y el navegador consulta el estado), así que el límite de 60 s del proxy no la corta; un reinicio de la app sí termina las que estén en curso.

El gasto por despacho sale de la auditoría (acción `AI_COMPARABLE_SEARCH`); la consulta está en [IA.md](IA.md).

### 13.1 Comparables quitados de su mercado antes del 26 nov 2026 (`pnpm comparables:keep-removed`, una vez)

Desde el 26 nov 2026 un comparable que se quita de un mercado se queda en la base del despacho. Los que se quitaron antes (el valuador reportó C-00144 a C-00147, creados con «Buscar con IA») no aparecen en Comparables. Una vez, después de desplegar:

```bash
docker exec valuos-app node --import tsx scripts/comparables-keep-removed.ts          # dice cuáles devolvería
docker exec valuos-app node --import tsx scripts/comparables-keep-removed.ts --apply  # los devuelve
```

Es idempotente: copia la ficha de cada comparable quitado (en la versión que hoy muestra su avalúo) a la base sin avalúo, con su mismo número, fotos y pantalla, solo si nada más de la base tiene ese número. No cambia ningún avalúo ni da números nuevos.

## 14. Operador de la plataforma (`OPERATOR_EMAILS`)

El dueño de la plataforma necesita saber quién es cada persona registrada (si una autoridad pregunta quién hizo un avalúo), sin ver el contenido de sus avalúos. Para eso existe `/operador/usuarios`: nombre, correo, teléfono (tal como lo capturó, sin verificar), despachos y rol, acreditación, alta, último acceso y cuántos avalúos creó y concluyó. Nada más de sus avalúos. Ver [AUTHORIZATION.md](AUTHORIZATION.md#operador-de-la-plataforma).

1. En `/opt/apps/valuos/secrets/production.env`, el correo (o los correos, separados por comas) de las cuentas del operador. Deben ser cuentas ya registradas y con el correo verificado:

   ```
   OPERATOR_EMAILS=correo-del-operador@ejemplo.com
   ```

2. `pnpm env:check` y recrear la app (paso 2). La persona ve «Usuarios de la plataforma» en el menú de su cuenta.
3. Para quitar el acceso, borrar su correo de la variable y recrear la app. Sin la variable nadie es operador y la página responde «no encontrado».

Cada consulta y cada exportación quedan en la auditoría (acciones `OPERATOR_USER_DIRECTORY_VIEW` y `OPERATOR_USER_DIRECTORY_EXPORT`, con quién, cuándo, IP y lo que buscó); los intentos de quien no es operador, como `OPERATOR_ACCESS_DENIED`:

```sql
select a."DFechaEvento", u."SCorreo", a."SAccion", a."JMetadatos"
from devpware_auditorias a join devpware_usuarios u on u."IdUsuario" = a."IdUsuario"
where a."SAccion" like 'OPERATOR_%' order by a."DFechaEvento" desc limit 50;
```

## 15. Verificación del teléfono (Twilio Verify)

Cada usuario verifica su celular en «Mi cuenta» → «Teléfono» con un código por SMS o WhatsApp, para que nadie abra cuentas falsas y vuelva a usar los avalúos gratuitos. Un teléfono verificado pertenece a una sola cuenta (migración 062). Registrarse y explorar sigue libre; mientras el teléfono no esté verificado, las páginas privadas muestran un recordatorio que se puede posponer 3 días. **Sin las tres llaves de Twilio no pasa nada**: no hay recordatorio, «Mi cuenta» dice que la verificación todavía no está habilitada y `PHONE_VERIFICATION_REQUIRED` se ignora (el log lo dice una vez: `[PHONE] PHONE_VERIFICATION_REQUIRED is on but the Twilio keys are missing`).

**Crear la cuenta y el servicio (lo hace el cliente, una vez):**

1. Crear la cuenta en [twilio.com](https://www.twilio.com) a nombre del despacho y pasarla de prueba a pagada (Upgrade). En prueba solo llegan códigos a números verificados a mano en la consola.
2. Console → Verify → Services → «Create new»: nombre `Valuaxis Soft` (es el que aparece en el mensaje), longitud del código 6. En «Delivery channels» encender **SMS** y, si se quiere, **WhatsApp**. Copiar el **Service SID** (`VA…`).
3. **WhatsApp necesita un remitente:** un número de WhatsApp Business aprobado por Meta y asociado al servicio (Verify → Services → el servicio → WhatsApp, o Messaging → Senders → WhatsApp senders). Mientras no lo tenga, quien elija WhatsApp ve «Ese medio de envío no está disponible por ahora. Elige SMS.» (error 60223 de Twilio) y SMS funciona igual.
4. Console → Messaging → Settings → Geo permissions (o Verify → Settings → Geo permissions): permitir **México** (y los países de los que se acepten números). Fraud Guard puede quedarse encendido.
5. Copiar de la portada de la consola el **Account SID** (`AC…`) y el **Auth Token**. Nunca en el repositorio, un chat ni un correo.

**Encenderla en el servidor:**

1. En `/opt/apps/valuos/secrets/production.env`:

   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_VERIFY_SERVICE_SID=VA...
   # Al principio en false: solo se recuerda. En true, crear un avalúo exige el teléfono verificado.
   PHONE_VERIFICATION_REQUIRED=false
   ```

   `TWILIO_API_BASE_URL` es solo para pruebas en local y en producción se ignora; no ponerla.
2. `pnpm env:check` y recrear la app (paso 2).
3. Con una cuenta propia: «Mi cuenta» → «Teléfono» → escribir el celular → SMS → «Enviar código» → escribir el código → «Verificar». Debe quedar «Verificado» y seguir así al recargar. Repetir con WhatsApp si se configuró el remitente.
4. Cuando el cliente lo decida, `PHONE_VERIFICATION_REQUIRED=true` y recrear la app: el formulario de «Nuevo avalúo» y «Duplicar» piden verificar el teléfono, con liga a «Mi cuenta». Para apagarlo, `false` y recrear.

**Límites y costo:** cada código es un mensaje que Twilio cobra (SMS a México o conversación de WhatsApp, más la verificación). La app permite 5 envíos por hora por persona y por número, y 10 intentos de código cada 15 minutos; Twilio además corta a los 5 envíos en 10 minutos y a los 5 intentos por código. El código vence a los 10 minutos.

**Si falla:** `docker logs valuos-app 2>&1 | grep "\[PHONE\]"`. Las líneas traen el código HTTP y el de Twilio, nunca el código enviado ni el número completo (`+52 ••••••1234`). `20003` es SID o token inválidos; `20404` al enviar, Service SID equivocado; `60223`, canal no habilitado (WhatsApp sin remitente); `60410` o `60605`, bloqueado por Fraud Guard o por los permisos de país; `21608`, cuenta de prueba. Los envíos y las verificaciones quedan en la auditoría con las acciones `TELEFONO_CODIGO_ENVIADO` y `TELEFONO_VERIFICADO`.

## 16. Avalúos al día con el formato (`VALUATION_LAYOUT_REFRESH`)

Durante la afinación, lo que se despliega debe verse en los avalúos que el valuador ya trabajó, no solo en los nuevos (video 8.3 de Álvaro, 24 nov 2026). Cómo funciona y qué conserva: [VALUATION_SECTIONS.md](VALUATION_SECTIONS.md#avalúos-al-día-con-el-formato).

- `VALUATION_LAYOUT_REFRESH=all` (o sin definir; es lo de ahora): al abrir en el editor un avalúo **no concluido**, toma los cambios de formato que le falten.
- `VALUATION_LAYOUT_REFRESH=new` (para cuando ya esté en operación): solo los avalúos creados desde el día en que salió cada cambio lo toman solos; los anteriores conservan su formato y el valuador lo trae con «Actualizar al formato más reciente» (renglón del estado, junto a «Historial»).
- Los avalúos concluidos no cambian nunca, con cualquier valor.

Se cambia en `production.env` y se recrea la app (paso 2). Para ver antes qué cambiaría, por folio y sin datos del cliente (no escribe nada; no hay `--apply`: el cambio lo hace el editor al abrir, con «Deshacer»):

```bash
docker exec valuos-app node --import tsx scripts/ops/actualizar-formato.ts --dry-run
docker exec valuos-app node --import tsx scripts/ops/actualizar-formato.ts --dry-run --org <id>
docker exec valuos-app node --import tsx scripts/ops/actualizar-formato.ts --dry-run --policy new
```

En local es `pnpm valuations:refresh-layout --dry-run`. Cada renglón dice el folio, la versión de formato que tiene, si cambiaría «al abrirlo» o «solo con «Actualizar formato»» y cuántos conceptos o bloques se agregarían o ligarían al cálculo.

## 17. Soporte y reportes de fallas (matriz de We Law 1.9)

- **Correo y WhatsApp de soporte:** se escriben en `src/features/support/support-contact.ts` (`SUPPORT_CONTACT.email` y `SUPPORT_CONTACT.whatsapp`, a 10 dígitos o con +52). Mientras estén vacíos, «Ayuda y soporte» (`/soporte`, en el menú de la cuenta) dice «Por publicar». Cambiarlos requiere un PR y desplegar.
- **Reportar una falla:** el usuario elige el avalúo (opcional), la fecha, describe lo que pasó y puede subir una captura. Se guarda en la auditoría (acción `SUPPORT_FAILURE_REPORT`, entidad `ReporteFalla`, con cuenta, avalúo, fecha y descripción; la captura en el almacenamiento del despacho, carpeta `compartidos/soporte`) y llega un correo a cada `OPERATOR_EMAILS` con la liga a `/operador/fallas`.
- **Responder:** en `/operador/fallas` el operador elige el estado («En revisión», «Corregido», «Cerrado») y escribe la respuesta; queda como otro renglón de la auditoría (`SUPPORT_FAILURE_RESPONSE`) y el usuario la ve en «Mis reportes». Control de la matriz: cada reporte debe tener respuesta registrada; los que siguen en «Recibido» no la tienen. La plataforma no ofrece ni calcula ningún remedio por fallas.

```sql
select a."DFechaEvento", u."SCorreo", a."SAccion", a."SIdentificadorEntidad", a."JMetadatos"
from devpware_auditorias a left join devpware_usuarios u on u."IdUsuario" = a."IdUsuario"
where a."SEntidad" = 'ReporteFalla' order by a."DFechaEvento" desc limit 50;
```

## 18. Registro de actividad (matriz de We Law 3.3)

- **Avalúos:** cada acción (crear, guardar —una vez cada 10 minutos por persona—, cambiar datos, concluir, reabrir, exportar, enviar por correo, archivar, papelera) queda en `devpware_auditorias` con fecha y hora, usuario, IP, navegador y, desde el 25 nov 2026, la versión del avalúo en `JMetadatos.versionAvaluo`. Los cambios de estado guardan además su versión en el historial de estados.
- **IA:** cada uso de «Pegar anuncio», «Redactar borrador» y «Buscar con IA» queda con quién, cuándo, IP, avalúo, modelo y tokens (acciones `AI_LISTING_EXTRACT`, `AI_DRAFT_WRITE`, `AI_COMPARABLE_SEARCH`); el costo se obtiene de los tokens (ver [IA.md](IA.md#costo-por-uso)).
- La auditoría es inmutable (un disparador impide cambiar o borrar renglones, migración 017).

## 19. Documentos legales (`pnpm legal:publish`, `LEGAL_ACCEPTANCE_REQUIRED`)

Los textos del abogado viven por versión en la base, con su SHA-256, y una versión nunca se cambia ni se borra. Cómo se muestran, qué se acepta y qué guarda la bitácora: [LEGAL.md](LEGAL.md). La migración 064 deja la versión 1 de cada documento como **borrador** (sin publicar, con sus espacios en blanco).

**Ver el estado** (qué versiones hay, cuáles están publicadas y cuántos espacios en blanco les quedan):

```bash
docker exec valuos-app node --import tsx scripts/ops/publicar-legal.ts estado
```

**Publicar una versión** cuando We Law la libere y Álvaro haya llenado los datos (domicilio, correos, teléfono y WhatsApp, sitio web; en las Políticas comerciales, banco, CLABE, titular y plazo de abono):

1. Prepara el archivo con el modelo de `docs/legal/<documento>.md` (el encabezado `---` es opcional; el cuerpo se guarda tal cual) y cópialo al contenedor: `docker cp terminos.md valuos-app:/tmp/terminos.md`.
2. Simulación (no escribe nada; dice la versión, la fecha, la huella y si le quedan espacios en blanco):
   ```bash
   docker exec valuos-app node --import tsx scripts/ops/publicar-legal.ts terminos /tmp/terminos.md --fecha 2026-12-01 --por "Brandon"
   ```
3. Si está bien, lo mismo con `--apply`. **Se rechaza cualquier texto con «______»**. Un cambio que no toca derechos ni obligaciones de los usuarios lleva `--sin-nueva-aceptacion` (no detiene a nadie). `--borrador` guarda un borrador en lugar de publicar.
4. Orden: primero `privacidad-simplificado` y `privacidad-integral` (se publican desde que se recaban datos); los demás cuando la plataforma ya hace lo que describen (regla 1 de la matriz).

**Pedir la aceptación a las cuentas previas:** con los seis documentos de la aceptación publicados (`terminos`, `licencia`, `politicas-comerciales`, `anexo-ia`, `privacidad-simplificado`, `privacidad-integral`), en `production.env`:

```
LEGAL_ACCEPTANCE_REQUIRED=true
```

y recrear la app (paso 2). Desde entonces, quien no haya aceptado la versión publicada más reciente que lo pide ve `/aceptar-documentos` antes de cualquier página privada. Para apagarlo, `false` y recrear. El registro guarda la bitácora con o sin la variable.

**Consultar la bitácora de una cuenta** (evidencia de aceptación; se conserva diez años, no se borra):

```bash
docker exec valuos-database-migrated psql -U devpware_avaluos_user -d devpware_avaluos_local -c "SELECT \"SEvento\", \"SMetodo\", \"DFechaEvento\", \"SZonaHoraria\", \"SDireccionIP\", \"JCasillas\", \"JDocumentos\" FROM devpware_bitacora_consentimientos WHERE \"SCorreo\" = '<correo>' ORDER BY \"DFechaEvento\";"
```

Los avisos por correo de un cambio (Términos 15.2, aviso integral 9.2) todavía se mandan a mano.

## 20. Inactividad de las cuentas (`ACCOUNT_INACTIVITY_ENABLED`)

Tras tres meses sin generar avalúos, la persona recibe un correo para que descargue sus reportes; 30 días después, si sigue sin avalúos, su cuenta queda inhabilitada (entra a consultar y descargar sus concluidos, pero no elabora ni concluye) hasta que el operador la reactiva a su solicitud. Cómo funciona: [CUENTAS.md](CUENTAS.md#inactividad). **Apagada por omisión:** sin la variable en `true`, el script solo cuenta, aun con `--apply`.

Simulación (no envía ni escribe; imprime solo conteos, nunca quién):

```bash
docker exec valuos-app node --import tsx scripts/ops/inactividad-cuentas.ts --dry-run
```

En local: `pnpm accounts:inactivity --dry-run`. Responde cuántas cuentas revisó y cuántos correos de inactividad, inhabilitaciones y avisos retirados haría.

**Encenderla (cuando el cliente lo decida):**

1. Correr la simulación y revisar los números con el cliente: la primera vez, todas las cuentas registradas hace más de tres meses sin avalúos recibirían el correo el mismo día.
2. En `production.env`: `ACCOUNT_INACTIVITY_ENABLED=true`. `pnpm env:check` y recrear la app (paso 2). La variable la lee el script al correr.
3. Tarea diaria (la instala una persona en el servidor; los agentes no la instalan). Corre después del respaldo de las 3:30, en la hora del servidor:

   ```bash
   echo '30 4 * * * root docker exec valuos-app node --import tsx scripts/ops/inactividad-cuentas.ts --apply >> /var/log/valuos-inactividad.log 2>&1' > /etc/cron.d/valuos-inactividad
   ```

   Se puede instalar antes de encender la variable: con la variable apagada solo escribe conteos en el log.
4. **Reactivar:** cuando la persona pida por correo la reactivación, el operador abre `/operador/cuentas` y pulsa «Reactivar» en su renglón (máximo doce horas, Términos 14.1). El saldo no cambia.

Para apagarla: `ACCOUNT_INACTIVITY_ENABLED=false` y recrear la app; las cuentas ya inhabilitadas siguen así hasta reactivarlas.

## 21. Guarda de los avalúos concluidos (`VALUATION_RETENTION_ENABLED`)

**Un avalúo concluido nunca se borra** (decisión del cliente del 26 nov 2026; el abogado actualiza los Términos 14.3 y **debe confirmarlo antes de encender la tarea**). Doce meses después de su conclusión solo se quitan las copias pesadas: los PDF del dictamen y de la memoria que se guardaron en el almacenamiento al descargarlos. El avalúo, su contenido, sus comparables, sus imágenes y su historial se quedan, y el PDF se vuelve a generar cuando se pide. Detalle: [CUENTAS.md](CUENTAS.md#guarda-de-los-avalúos-concluidos). **Apagada por omisión:** sin la variable en `true`, el script solo cuenta, aun con `--apply`.

Simulación (no borra; imprime solo conteos, nunca folios ni nombres):

```bash
docker exec valuos-app node --import tsx scripts/ops/guarda-avaluos.ts --dry-run
```

En local: `pnpm valuations:retention --dry-run`. Responde cuántos avalúos concluidos revisó y a cuántos les quitaría copias de PDF.

**Encenderla (cuando el cliente y el abogado lo confirmen):**

1. Respaldo manual (`/opt/apps/valuos/scripts/backup-db.sh`).
2. Correr la simulación.
3. En `production.env`: `VALUATION_RETENTION_ENABLED=true`. `pnpm env:check` y recrear la app (paso 2).
4. Tarea diaria (la instala una persona en el servidor), después del respaldo:

   ```bash
   echo '15 4 * * * root docker exec valuos-app node --import tsx scripts/ops/guarda-avaluos.ts --apply >> /var/log/valuos-guarda.log 2>&1' > /etc/cron.d/valuos-guarda
   ```

5. Revisar el log los primeros días: «No se pudieron quitar» debe ser 0 (si no, las copias quedaron como estaban; `docker logs valuos-app 2>&1 | grep "\[RETENTION\]"` dice el motivo, sin datos del avalúo) y «con error» en archivos, 0 (un objeto de S3 que no se pudo borrar; su renglón ya no existe).

Los avisos enviados (de la inactividad, de las suspensiones y de las bajas) quedan en `devpware_avisos_correo`; la consulta está en [CUENTAS.md](CUENTAS.md#bitácora-de-avisos-por-correo).
