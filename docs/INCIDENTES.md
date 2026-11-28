# Procedimiento de incidentes

Qué hacer cuando la app falla en producción: cómo medir la gravedad, qué revisar en los primeros 15 minutos, los incidentes típicos paso a paso, a quién avisar y cómo dejar constancia. El servidor y sus rutas están en [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md); los procedimientos de rutina, en [OPERACION.md](OPERACION.md).

Todos los comandos se corren como root en el servidor (SSH o la consola web de hPanel). Las rutas de compose:

```bash
cd /opt/apps/valuos/deployment
COMPOSE="docker compose -f compose.production.yml -f compose.migrated-db.yml"
```

## 1. Gravedad

| Nivel | Qué es | Ejemplos | Respuesta |
|---|---|---|---|
| **S1, crítico** | La app no sirve a nadie, o hay riesgo para los datos | Sitio caído o con error 5xx en todo; base caída; sospecha de acceso indebido; datos borrados; servidor perdido | Atender de inmediato, a cualquier hora. Avisar al dueño y a imSoft al confirmar |
| **S2, alto** | Una función clave falla para todos | No salen correos (restablecer contraseña, envío del dictamen); no se suben o abren fotos; no se genera el PDF; falla el cobro | Atender el mismo día hábil. Avisar al dueño |
| **S3, medio** | Falla parcial con alternativa, o un riesgo que todavía no pega | Un despacho con un error; disco arriba de 85 %; el respaldo diario falló una vez | Atender en horario hábil; registrar en la bitácora |
| **S4, bajo** | Molestia sin impacto en el trabajo | Un texto o un aviso mal mostrado | Issue en GitHub |

Si hay duda entre dos niveles, se toma el más alto y se baja después.

## 2. Primeros 15 minutos

1. **¿Está caída para todos?**

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://valuaxissoft.com/     # desde fuera: 200
   ```

   No hay todavía un monitoreo externo ni una ruta `/api/health`: el aviso suele llegar por un usuario. Probar también desde otra red (el teléfono sin wifi).

2. **Entrar al servidor** (SSH o consola de hPanel). Si el VPS no responde ni por la consola, reiniciarlo desde hPanel y seguir con el paso 3.

3. **Contenedores:**

   ```bash
   docker ps -a --format '{{.Names}}\t{{.Status}}'
   ```

   Deben estar `Up` `valuos-app`, `nginx-proxy-manager` y `valuos-database-migrated` (`healthy`). `valuos-database` (Postgres 17, sin uso) también aparece mientras no se retire.

4. **La app desde dentro del servidor:**

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/       # 200
   ```

   200 aquí y error desde fuera apunta al proxy o al DNS; error aquí apunta a la app o la base.

5. **Logs de la app:**

   ```bash
   docker logs --tail 100 valuos-app
   docker logs --since 30m valuos-app 2>&1 | grep -iE "error|prisma|ECONN|timeout" | tail -30
   ```

6. **Recursos:**

   ```bash
   df -h / /srv          # disco
   free -h               # memoria
   uptime                # carga
   ```

7. **Anotar** la hora de inicio, el nivel y lo que se vio, y avisar (sección 4). Si no se encontró la causa en estos 15 minutos y es S1, avisar de todos modos.

## 3. Incidentes típicos

### 3.1 La app no abre o responde 5xx

1. Si `valuos-app` no está `Up`: `$COMPOSE up -d valuos-app` y `docker logs --tail 100 valuos-app`.
2. Si está `Up` pero responde error: revisar en el log si es la base (sección 3.2), la configuración (`pnpm env:check` reporta una variable inválida y la app no arranca: ver [OPERACION.md](OPERACION.md), paso 2.3) o un error de código.
3. **Si empezó justo después de un despliegue:** regresar `/opt/apps/valuos/repository` al commit anterior y repetir el paso 5 de [OPERACION.md](OPERACION.md), sección 2 (reconstruir y levantar la app), y avisar a imSoft con el log. Si el despliegue trajo una migración, no revertirla a mano: se restaura con el volcado previo al despliegue solo si la migración dañó datos.
4. Si solo falla desde fuera (200 en `127.0.0.1:3000`): `docker logs --tail 50 nginx-proxy-manager`; si el proxy no está arriba, `docker compose -f /opt/platform/proxy/compose.yml up -d`. Revisar también que el certificado no haya vencido.
5. Comprobar con el paso «Comprobar» de [OPERACION.md](OPERACION.md), sección 3, y en el navegador: iniciar sesión, abrir un avalúo, guardar, subir una imagen y exportar el PDF.

### 3.2 La base de datos no responde

1. `docker ps -a`: ¿`valuos-database-migrated` está `Up (healthy)`?
2. `docker logs --tail 100 valuos-database-migrated`. Causas comunes: disco lleno (sección 3.3) o memoria.
3. Levantarla: `$COMPOSE up -d valuos-database-migrated`, esperar a `healthy` y luego `$COMPOSE up -d valuos-app`.
4. Comprobar: `docker exec valuos-database-migrated pg_isready`.
5. **No** borrar ni recrear el volumen de datos (`/srv/data/valuos/postgres18-migrated`). Si la base no arranca por daño en los datos, es S1 con riesgo de pérdida: detenerse, avisar al dueño y restaurar **primero en una base temporal** desde el último volcado ([RESPALDOS.md](RESPALDOS.md), sección 2), para comparar antes de tocar producción.

### 3.3 Disco lleno

1. Ver qué ocupa:

   ```bash
   df -h / /srv
   docker system df
   du -sh /srv/backups/valuos /srv/data/valuos/* /var/lib/docker 2>/dev/null
   journalctl --disk-usage
   ```

2. Liberar lo seguro: imágenes y caché de compilación de Docker ([OPERACION.md](OPERACION.md), sección 3.1) y, si hace falta, `journalctl --vacuum-time=3d`.
3. **No borrar los volcados de `/srv/backups/valuos`**: hoy son la única copia diaria de la base (la copia fuera del servidor todavía no corre). Si son el problema, primero bajarlos a una PC y confirmar que se pueden leer; después borrar solo los más viejos.
4. Si la base o la app se detuvieron por el disco, levantarlas (secciones 3.1 y 3.2) y revisar el log de la base.

### 3.4 No salen los correos (Resend)

Síntoma: no llega «olvidé mi contraseña», la verificación de cuenta o el dictamen por correo. El usuario ve el mensaje de siempre, así que el aviso suele venir de una queja.

1. `docker logs valuos-app 2>&1 | grep -E "Resend email delivery failed|PASSWORD_RESET_EMAIL|DICTAMEN_EMAIL" | tail -20`. Trae el código HTTP y el motivo que da Resend (dominio no verificado, llave inválida, límite).
2. Revisar en el panel de Resend el estado del dominio y del envío.
3. Correo de prueba y configuración: [OPERACION.md](OPERACION.md), sección 12.
4. Si Resend está caído o la llave se revocó y no hay reemplazo: SES está como respaldo (`EMAIL_PROVIDER=ses`), pero sigue en *sandbox* y solo entrega a direcciones verificadas, así que no sirve para los usuarios ([ADR 0001](adr/0001-correo-con-resend.md)).

### 3.5 Errores con fotos y documentos (S3)

Síntoma: no se suben imágenes, no se ven, o el PDF sale sin fotos.

1. `docker logs --since 30m valuos-app 2>&1 | grep -iE "s3|AccessDenied|NoSuchKey|SignatureDoesNotMatch|ExpiredToken" | tail -20`.
2. `AccessDenied` o `SignatureDoesNotMatch` en todo: la llave IAM de la app se revocó, venció o cambió. Revisarla en la consola de AWS y en `production.env` ([ACCESOS.md](ACCESOS.md), sección 4).
3. `NoSuchKey` en archivos sueltos: el registro existe pero el archivo no está en el bucket de `AWS_S3_BUCKET`. Si se borró, recuperar la versión anterior desde la consola de AWS (el bucket tiene versionado). Si nunca existió, es un dato roto previo: anotarlo y avisar al despacho.
4. Las URL firmadas duran 15 minutos: una imagen que «deja de verse» en una pestaña abierta mucho tiempo se arregla recargando.

### 3.6 Sospecha de acceso indebido

Señales: una llave perdida o robada, un inicio de sesión raro en `last`, procesos o contenedores que nadie reconoce, cargos extraños en AWS o Backblaze. Es S1.

**Primeros 15 minutos:**

1. **No apagar ni borrar nada**: se pierde la evidencia.
2. Snapshot del VPS en hPanel.
3. Guardar evidencia en un archivo y bajarlo a una PC:

   ```bash
   { date; last -a | head -50; journalctl -u ssh --since -7d; docker ps -a; ps auxf; ss -tlnp; } > /root/incidente-$(date +%Y%m%d-%H%M).txt
   ```

4. Cortar el acceso: quitar la llave sospechosa de `authorized_keys` y, si hace falta, limitar SSH desde el firewall de hPanel dejando solo la consola web.
5. Avisar al dueño de inmediato.

**Después, rotar todo** ([ACCESOS.md](ACCESOS.md), sección 4):

- Llave IAM de la app (S3 y SES) y revisar en AWS qué se hizo con ella.
- Llave de subida de B2 del servidor (cuando exista). Los respaldos ya subidos siguen seguros: el servidor no puede leerlos ni borrarlos.
- Secretos de `production.env`: base de datos, sesiones, Resend, Google, Twilio, Facturapi. **Stripe la rota el dueño** (cuenta compartida con su tienda). `ACCREDITATION_HASH_SECRET` solo si se expuso: cambiarla invalida los hashes guardados.
- Contraseña del panel del proxy y las sesiones de la app.
- Llaves SSH de todos los usuarios.

Si se sospecha que se leyeron datos personales, la LFPDPPP pide informar sin demora a los titulares afectados: lo decide el dueño con su abogado. Si el servidor no es confiable, reconstruirlo ([RESPALDOS.md](RESPALDOS.md), sección 4) en lugar de limpiarlo.

### 3.7 Se borraron o dañaron datos

1. Dejar de escribir: `docker stop valuos-app`.
2. Ubicar el último volcado bueno en `/srv/backups/valuos/database/daily/` (o el `predeploy-*` previo a un despliegue).
3. Restaurarlo **primero en una base temporal** y comparar ([RESPALDOS.md](RESPALDOS.md), sección 2).
4. Antes de restaurar en producción, volcar el estado actual (`systemctl start valuaxis-db-backup.service`) para no perder lo que sí estaba bien.
5. Avisar a los valuadores qué periodo se perdió.

### 3.8 Se perdió el servidor

Seguir [RESPALDOS.md](RESPALDOS.md), sección 4. Hoy el único camino es restaurar el respaldo semanal de Hostinger (~1 h 10 min) y se pueden perder hasta unos siete días de la base.

### 3.9 Falló el respaldo diario

```bash
journalctl -u valuaxis-db-backup -n 30
systemctl start valuaxis-db-backup.service     # correrlo a mano el mismo día
ls -lt /srv/backups/valuos/database/daily/ | head -3
```

## 4. A quién avisar

| Rol | Cuándo | Para qué |
|---|---|---|
| **Operador de infraestructura (DevpWare)** | Siempre; es quien atiende servidor, base, respaldos, correo y almacenamiento | Diagnóstico y recuperación |
| **imSoft (aplicación)** | Si la causa está en el código, un despliegue o una migración | Corrección por PR y, si hace falta, nueva versión |
| **El dueño de las cuentas** | S1 y S2 al confirmarlos; siempre en sospecha de acceso indebido | Decisiones, acceso a las cuentas (Hostinger, AWS, B2, Stripe), aviso a los despachos y, si aplica, a los titulares de datos |
| Soporte del proveedor | Si la falla es suya | Hostinger (hPanel → Ayuda, 24/7), AWS, Backblaze y Resend desde sus consolas |

Los datos de contacto no se escriben en el repositorio: los tiene el dueño. Se avisa al confirmar el incidente, en cada cambio de estado y al cerrarlo, aunque no haya causa todavía.

## 5. Nota posterior al incidente

Para todo S1 y S2, dentro de los dos días hábiles siguientes. Va en la bitácora de operación; si deja trabajo pendiente, también como issue en GitHub. Sin culpables: se busca qué falló en el sistema, no quién.

```markdown
## Incidente AAAA-MM-DD: <título corto>

- **Nivel:** S1 / S2 / S3
- **Inicio / detección / fin (hora del centro de México):**
- **Quién atendió:** (roles)
- **Impacto:** qué no pudieron hacer los valuadores, cuántos despachos, si hubo pérdida de datos y de qué periodo
- **Cronología:** hora, qué se vio, qué se hizo
- **Causa raíz:**
- **Qué funcionó y qué no** (avisos, respaldos, este procedimiento)
- **Acciones:** qué se cambia para que no vuelva a pasar, con responsable, fecha e issue
- **Llaves rotadas** (si aplica):
- **¿Se avisó a los titulares de datos?** (solo si hubo acceso indebido; decisión del dueño)
```

## 6. Pendientes que acortarían un incidente

1. Ruta `GET /api/health` con `SELECT 1` y su `healthcheck` en compose.
2. Monitoreo externo de esa ruta cada 5 minutos con aviso al operador y al dueño.
3. Copia de la base fuera del servidor con aviso de falla ([RESPALDOS.md](RESPALDOS.md)).
4. Usuario de emergencia del dueño en el servidor ([ACCESOS.md](ACCESOS.md), sección 5).
5. Compose de producción en el repositorio (hoy solo vive en el servidor).
