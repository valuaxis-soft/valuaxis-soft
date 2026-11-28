# Accesos, cuentas y llaves de la operación

Quién tiene qué acceso a la infraestructura (servidor, AWS, Backblaze, Hostinger, correo) y cómo se guardan y rotan las llaves. No trata de las cuentas de los usuarios de la app: eso está en [CUENTAS.md](CUENTAS.md). Quién es dueño de cada cuenta está en [INFRAESTRUCTURA.md](INFRAESTRUCTURA.md), «Propiedad de las cuentas».

Este documento nombra roles, no personas: **el dueño** (dueño de las cuentas y de la empresa), **el operador** (operador de infraestructura, hoy DevpWare) e **imSoft** (desarrollo de la aplicación). Nunca se escriben aquí, en el repositorio ni en un chat contraseñas, llaves, códigos de respaldo ni correos de recuperación.

## 1. Reglas

1. **Las cuentas son de la empresa.** Se registran con el correo de la empresa, nunca con un correo personal ni con uno del operador.
2. **El correo raíz es la llave de todo.** Casi todas las cuentas se recuperan por correo, y quien controle la cuenta de Hostinger controla el buzón, el VPS, sus respaldos y el dominio. Las dos llevan verificación en dos pasos por app (TOTP) y códigos de respaldo impresos.
3. **El dueño guarda todas las llaves.** El operador e imSoft reciben solo lo que necesitan para su tarea, con su propio usuario, y se les retira al terminar.
4. **El servidor no guarda nada que abra o borre respaldos.** Solo la llave pública de `age` y una llave de B2 que solo sube archivos ([RESPALDOS.md](RESPALDOS.md)).
5. **Cada persona, su usuario y su llave.** Nada de llaves compartidas: usuarios IAM nominales con MFA en AWS, una llave SSH por persona en el servidor.
6. **Mínimo privilegio en las llaves de servicio.** La llave de la app en S3 no puede borrar versiones ni cambiar el versionado o las políticas; la de B2 del servidor solo tiene `writeFiles`; la de Resend solo envía, limitada al dominio.
7. **Lo que no se puede perder, en papel y en dos lugares.** La llave privada de respaldos y los códigos de recuperación van en dos hojas impresas: una en la oficina (bajo llave) y otra fuera.

## 2. Cuentas y quién entra

| Cuenta o recurso | Dueño | Operador durante el proyecto | imSoft | Al terminar el proyecto |
|---|---|---|---|---|
| Correo raíz de la empresa | Dueño | Sin acceso | Sin acceso | — |
| Hostinger (hPanel: VPS, dominio, correo) | Dueño | Acceso delegado o usuario propio; llave SSH propia | Según lo que otorgue el dueño | Retirar el acceso y sus llaves SSH |
| Servidor (SSH) | Dueño (usuario de emergencia, pendiente) | Usuario propio con `sudo` | Según lo que otorgue el dueño | Borrar sus llaves de `authorized_keys` |
| AWS (S3; SES de respaldo) | Dueño (usuario raíz) | Usuario IAM nominal con MFA | Usuario IAM nominal con MFA | Eliminar los usuarios IAM; rotar la llave de la app |
| Backblaze B2 | Dueño | **Sin acceso a la consola** (acompaña por pantalla compartida) | Sin acceso | Rotar la llave de subida del servidor |
| healthchecks.io | Dueño | Recibe las alertas | — | Quitar su correo de las alertas |
| Resend, Stripe, Google, Twilio, Facturapi | Dueño | Lo que requiera la tarea | Lo que requiera la tarea | Rotar las llaves que conocieron |
| GitHub (organización) | Valuaxis | Miembro | Miembro | Según contrato |

Lo que exige la consola de B2 (crear el bucket, la retención y las llaves) lo hace el dueño, acompañado por el operador.

## 3. Inventario de secretos

| Secreto | Para qué | Dónde vive | ¿En el servidor? | Rotación |
|---|---|---|---|---|
| Llave privada `age` | Abrir los respaldos | Gestor del dueño + dos hojas | **Nunca** | Solo si se expone |
| Llave pública `age` | Que el servidor cifre | `/etc/valuaxis/age-recipients.txt` + hojas | Sí (no es secreta) | Con la privada |
| Correo raíz: contraseña y códigos 2FA | Recuperar todas las cuentas | Gestor + hojas | No | Si hay sospecha |
| Hostinger: contraseña y códigos 2FA | VPS, respaldos de Hostinger, dominio, buzones | Gestor + hojas | No | Anual |
| B2: contraseña y códigos 2FA | Consola de B2 | Gestor + hojas | No | Anual |
| Llave maestra de B2 | Crear llaves | **No se guarda**: se genera para la tarea | No | Cada uso |
| Llave de subida de B2 (solo `writeFiles`) | Que el servidor suba respaldos | `/etc/valuaxis/offsite.env` (600) | Sí: solo sube | Anual y al terminar el proyecto |
| Llave de lectura de B2 (opcional) | Prueba de restauración por línea de comandos | Solo el gestor del dueño | **Nunca** | Anual |
| AWS raíz: contraseña y MFA | Cuenta de AWS | Gestor + hojas | No | Anual |
| Llave IAM de la app (S3) | La app en producción | `production.env` | Sí | 90 días y al terminar el proyecto |
| `production.env` completo (base, sesiones, APIs) | Reconstruir la app | Servidor (+ copia cifrada en B2, cuando exista) | Sí | Con cada secreto que contiene |
| Llaves SSH | Entrar al servidor | La privada, cada persona en su equipo | Solo las públicas | Al salir alguien |
| URL de ping de healthchecks | Avisar que el respaldo corrió | Servidor | Sí (no abre ni borra nada) | Si se abusa |

**Gestor de contraseñas:** el que el dueño ya use, con su propia verificación en dos pasos. Si el operador necesita un secreto, el dueño lo comparte para la tarea y se rota al terminar.

**Las dos hojas impresas** (firmadas y fechadas): llave privada y pública de `age`, nombre del bucket de B2, códigos de respaldo 2FA del correo raíz, su correo de recuperación, Hostinger, B2 y AWS raíz, y una línea: «Para restaurar: docs/RESPALDOS.md, o llamar al proveedor técnico vigente». Las contraseñas no van en las hojas: van en el gestor.

## 4. Rotar una llave

Regla general: crear la nueva, ponerla en `production.env`, recrear la app (`docker compose … up -d valuos-app`; `docker restart` no relee el archivo), probar y **solo entonces** revocar la vieja.

| Llave | Dónde se rota | Cuidado |
|---|---|---|
| IAM de la app (S3) | Consola de AWS → IAM → el usuario de la app → *Security credentials* | Mientras no se separen las llaves por servicio, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` también sirven a SES: no borrarlas |
| Resend | Panel de Resend (permiso solo de envío) | [OPERACION.md](OPERACION.md), sección 12 |
| Stripe | Lo hace el dueño: la cuenta es compartida con su tienda | No tocar sus otras llaves ni su configuración ([OPERACION.md](OPERACION.md), sección 8) |
| `ACCREDITATION_HASH_SECRET` | `production.env` | Cambiarla invalida los hashes guardados: solo si se expuso |
| Llave de subida de B2 | CLI `b2` en la PC del dueño | Crear la nueva con solo `writeFiles`, cambiar `offsite.env`, probar, borrar la vieja |
| SSH | `authorized_keys` del usuario | Tener otra sesión abierta mientras se cambia |

## 5. Acceso de emergencia (pendiente)

Hoy el dueño **no tiene** un usuario propio en el servidor: su única vía es la consola web de hPanel. El plan, previsto para una ventana de mantenimiento:

1. El dueño genera en **su** PC una llave `ssh-keygen -t ed25519 -C valuaxis-admin -f ~/.ssh/valuaxis-admin`, con frase de paso, y entrega solo el `.pub`. La llave privada nunca pasa por el operador.
2. En el servidor se crea el usuario `valuaxis-admin` en los grupos `sudo` y `ssh-users`, con esa llave pública. La contraseña de `sudo` la teclea el dueño y la guarda en su gestor y en las hojas.
3. Se prueba con el dueño presente: `ssh -i ~/.ssh/valuaxis-admin valuaxis-admin@<ip-del-servidor>` y `sudo -v`.
4. Después se cierra el acceso SSH de root y se limita SSH al grupo `ssh-users`, cuidando que la terminal web de hPanel siga funcionando (decisión del dueño). Antes de recargar `sshd`: `sshd -t` y una segunda sesión abierta.

Reversa: `deluser --remove-home valuaxis-admin`.

## 6. Al terminar el proyecto (salida del operador)

- [ ] `age`: si hubo un segundo destinatario del operador, borrar su línea de `age-recipients.txt` (lo ya subido con esa llave caduca solo en ~36 días).
- [ ] B2: borrar la llave de subida, crear una nueva igual y actualizar `offsite.env`.
- [ ] AWS: eliminar el usuario IAM del operador y rotar la llave de la app.
- [ ] Hostinger: retirar el acceso delegado y borrar sus llaves SSH del VPS.
- [ ] healthchecks: quitar su correo de las alertas.
- [ ] `production.env`: rotar los secretos que el operador conoció (base de datos, sesiones, APIs).
- [ ] Prueba de restauración hecha por el dueño o el nuevo proveedor, sin ayuda del operador.
- [ ] Acta de entrega firmada con la fecha de cada paso.

## 7. Si se pierde algo

| Si se pierde… | Qué pasa | Qué hacer |
|---|---|---|
| La llave privada `age` (las tres copias) | Los respaldos de B2 ya no se pueden abrir | Generar un par nuevo y cambiar la llave pública en el servidor ese día. Mientras, quedan el respaldo semanal de Hostinger y los volcados locales |
| Una copia de la llave privada | Nada, si quedan las otras | Reimprimir. Si pudo verse (robo), tratarla como expuesta: par nuevo, y conservar la vieja hasta que caduquen los ~36 días |
| El acceso al correo raíz | Se pierde la vía de recuperación de todo | Códigos de las hojas; su correo de recuperación; desde hPanel, el dueño puede quitar el 2FA del buzón y cambiar su contraseña |
| El teléfono con la app 2FA | No se entra a las cuentas con 2FA | Entrar con los códigos impresos, registrar el teléfono nuevo y reimprimir códigos. Si fue robo, cambiar contraseñas |
| El servidor comprometido | El atacante ve la base viva y los volcados locales | [INCIDENTES.md](INCIDENTES.md), «Sospecha de acceso indebido» |
| La cuenta de B2 tomada | Puede descargar archivos, pero siguen cifrados; no puede acortar el bloqueo, sí cerrar la cuenta | Soporte de Backblaze; cambiar contraseña y 2FA |
| La cuenta de Hostinger tomada | Controla VPS, respaldos de Hostinger, dominio y correo | Soporte de Hostinger; los respaldos de B2 siguen fuera de su alcance |

## 8. Calendario

| Frecuencia | Actividad | Quién |
|---|---|---|
| Diario (automático) | Aviso si el respaldo no llegó | Servidor → correo |
| Mensual | Prueba de restauración ([RESPALDOS.md](RESPALDOS.md)); confirmar que las hojas siguen en su lugar | Dueño + operador |
| Trimestral | Teclear la llave privada desde una hoja; revisar usuarios y llaves en B2, AWS y Hostinger | Dueño |
| Anual | Contraseñas de B2, AWS raíz y Hostinger; llave de subida de B2; revisar este documento | Dueño |
| Por evento | Salida de una persona, hoja expuesta, sospecha de compromiso, fin del proyecto | Dueño |

## 9. Pendientes

1. Verificación en dos pasos por app, con códigos impresos, en el correo raíz, su correo de recuperación y la cuenta de Hostinger.
2. Usuario de emergencia `valuaxis-admin` (sección 5) y cierre del SSH de root.
3. MFA en todos los usuarios IAM y una sola llave activa por usuario.
4. Separar las llaves de S3 y SES de la app (hoy comparten `AWS_ACCESS_KEY_ID`).
5. Cuenta de B2 y llaves de respaldo, al instalar la copia fuera del servidor.
6. Quitar de `production.env` las variables que no se usan y las copias viejas del archivo que guardan secretos antiguos.
