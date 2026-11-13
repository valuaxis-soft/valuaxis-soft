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
| `GOOGLE_MAPS_SERVER_KEY` | El servidor, para la búsqueda de direcciones (`/api/mapas/geocodificar`) y la imagen de cada croquis (`/api/avaluos/[id]/croquis`). Nunca sale del servidor. | Geocoding API y Maps Static API | **Aplicación:** direcciones IP, solo la IP pública del VPS (`168.231.74.90`), o ninguna si cambia de IP. **API:** solo Geocoding API y Maps Static API. |

- Una llave restringida por referente **no funciona desde el servidor**: Google rechaza las llamadas sin `Referer`. Si solo se configura `GOOGLE_MAPS_API_KEY`, el servidor la usa también para la geocodificación y los croquis, así que entonces esa llave debe permitir las tres APIs y no puede llevar restricción por referente (o se le quita la restricción de aplicación, con menos protección). La separación en dos llaves es la configuración recomendada.
- Las dos son variables de **runtime**: van en `production.env` y el contenedor las lee al arrancar (`env_file`). No llevan el prefijo `NEXT_PUBLIC_`, porque la imagen se compila sin `production.env`; la página lee la del navegador en el servidor en cada petición y se la pasa al navegador.
- Para probar en local se crean llaves aparte (`http://localhost:3000/*` como referente; sin restricción de IP para la del servidor), nunca se tocan las de producción.
- Después de agregarlas o cambiarlas: `pnpm env:check` (paso 2.3) y reiniciar la app (`docker compose ... up -d valuos-app`); no hace falta reconstruir la imagen.
- **Costo:** cada búsqueda de dirección es una llamada a Geocoding API y cada "Generar croquis de localización" pide una imagen de Maps Static API por croquis (dos en la sección Croquis, una en el anexo); el mapa interactivo cobra por carga de página del editor con la sección abierta. Conviene fijar una cuota diaria por API en Google Cloud (APIs y servicios → Cuotas). La app limita la geocodificación a 30 búsquedas por usuario por minuto y los croquis cuentan en el límite de subidas (60 cada 10 minutos).
- Los croquis quedan guardados como imágenes del avalúo: el dictamen, su PDF y los entregables no consultan a Google ni necesitan la llave.
- **Calles resaltadas (etapa 2):** las calles alrededor del pin vienen de OpenStreetMap (API Overpass, espejos públicos `overpass-api.de`, `overpass.kumi.systems` y `overpass.private.coffee`, en ese orden con ventaja escalonada: el siguiente arranca si el anterior no respondió en 3.5 s o lo rechazó; gana el primero que responda), siempre desde el servidor (`GET /api/mapas/calles`), con 12 s por espejo y 20 s en total (antes hasta ~92 s, y el proxy cortaba a los 60 s con una página que el navegador mostraba como «Request failed»), caché en memoria de un día por coordenadas redondeadas (y la última respuesta de la zona, hasta una semana, si todos fallan) y un límite de 20 consultas por usuario por minuto. No necesitan llave; los datos son ODbL y el panel acredita a OpenStreetMap. Si ningún espejo responde, el panel lo dice con «Reintentar», y un clic en el mapa avisa que no hay calles cargadas. Para diagnosticar: `docker logs <contenedor> 2>&1 | grep STREETS` muestra cada espejo que falló y por qué.
- La CSP agrega los dominios de Google (`maps.googleapis.com`, `*.googleapis.com`, `*.gstatic.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `worker-src blob:`) solo en el editor (`/workspace`) y en las rutas `/demo/`; el resto de la app, incluidos el dictamen y la ventana de vista previa, conserva la política de siempre (`googleMapsPage` en `src/security/headers/security-headers.ts`).

## 8. Precio por avalúo ($170 MXN con IVA) y cobro con Stripe

El precio acordado es **$170.00 MXN con IVA incluido** por avalúo (video 5.2 del 2 nov 2026): paquete `AVALUO_1`, guardado como $146.55 antes de IVA + 16 %. Para crearlo o corregirlo, con el contenedor arriba:

```bash
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts           # simulación
docker exec -it valuos-app node --import tsx scripts/billing-set-unit-price.ts --apply   # escribe
```

Es idempotente y no llama a Stripe.

**Stripe está conectado en producción desde el 5 nov 2026**: clave restringida en vivo de la cuenta del cliente (compartida con su tienda: no tocar sus llaves ni su configuración), webhook en `https://valuaxissoft.com/api/stripe/webhook`, configuración propia del portal de clientes y el paquete `AVALUO_1` sincronizado. Las variables (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIGURATION`) viven solo en `production.env`. Un administrador ya puede comprar avalúos en `/organizacion/facturacion`. Si cambia el importe del paquete, correr `docker exec -it valuos-app node --import tsx scripts/stripe-sync.ts`: crea el precio nuevo y archiva el anterior (detalle en [COBRO.md](COBRO.md)).

**Lo que sigue apagado por omisión es el bloqueo al concluir sin saldo** (`BCobroPorAvaluo`): concluir sin avalúos disponibles registra el consumo y deja el saldo en negativo, mostrado como pendiente de pago. Se enciende por organización solo cuando el cliente lo decida:

```bash
docker exec -it valuos-app node --import tsx scripts/billing-credits.ts enforce <slug|uuid> on
```

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
