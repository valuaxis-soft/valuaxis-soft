# Baja, suspensión de cuentas y guarda de los avalúos

Lo que pide la matriz de implementación del abogado (secciones 1.11, 1.12 y 3.4, «Avisos por correo») con base en los Términos y condiciones de uso (14.1, 14.2 y 14.3), las Políticas comerciales (3.2, 6.4 y 7.2), la Licencia de uso del software (17.10) y el Aviso de privacidad integral (7.3 y 8.3), en sus versiones del 15 de noviembre de 2026. Los textos que ve la persona y los correos siguen la redacción de esos documentos.

**Nada de esto toca el saldo.** Ni la baja ni la suspensión ni la guarda de los avalúos escriben en `devpware_movimientos_creditos`; una prueba revisa que el código de estas funciones no lo mencione. **Todo lo automático está apagado** (`ACCOUNT_INACTIVITY_ENABLED`, `VALUATION_RETENTION_ENABLED`) y sin `--apply` los scripts solo cuentan.

Código: `src/features/account/standing/` (reglas, servicio, correos con bitácora, inactividad) y `src/features/valuations/retention/` (guarda). Migración 066.

## Estados de una cuenta

Una cuenta puede tener abiertos renglones en `devpware_suspensiones_cuentas`. Cada renglón guarda toda su historia: tipo, causa, detalle, origen (`USUARIO`, `CORREO`, `OPERADOR`, `PROCESO`), fecha de solicitud, de aviso, límite para aclarar, respuesta y su fecha, inicio, fin y motivo del fin (`REACTIVACION`, `ACLARADA`, `ACTIVIDAD`), y quién lo abrió y lo cerró. Nunca se borran.

| Tipo | Qué impide | Entra | Sale |
|---|---|---|---|
| `BAJA` | **Todo el acceso** («si da de baja su Cuenta, deja de tener acceso a ella», Términos 14.3) | Al confirmar «Dar de baja mi cuenta» o cuando el operador registra una baja pedida por correo | «Reactivar» del operador, a solicitud por correo |
| `INACTIVIDAD` | Elaborar y concluir avalúos. Sigue entrando a consultar y descargar sus concluidos | La tarea diaria, 30 días después del correo de inactividad | «Reactivar» del operador (Términos: máximo doce horas naturales) |
| `OTRA` | Elaborar y concluir. Con suplantación y «bloquear el acceso», todo el acceso mientras se verifica la identidad | El operador, con aviso previo y cinco días hábiles para aclarar; en casos urgentes, al avisar | «Levantar» (aclarada) o «Reactivar» |

Un renglón sin `DFechaInicio` es solo un aviso: la cuenta funciona igual.

**Dónde se aplica:**

- `getCurrentSession` no reconoce la sesión de una cuenta con una baja o un bloqueo de acceso en vigor; el inicio de sesión con contraseña responde «Esta cuenta está dada de baja…» (después de comprobar la contraseña, para no revelar la baja a quien solo escribe el correo) y el de Google, `oauth_account_closed`.
- `POST /api/avaluos` (crear), `POST /api/avaluos/[id]/duplicar` y `POST /api/avaluos/[id]/conclude` responden 403 `ACCOUNT_SUSPENDED` mientras la cuenta no puede producir (`accountSuspendedResponse`). Consultar, abrir la vista previa y descargar el PDF, la memoria y el .zip de los concluidos sigue igual.
- En todas las páginas privadas, un aviso abajo a la izquierda dice si la cuenta está suspendida o si tiene un aviso previo con su límite para aclarar.

**Suspensión e inhabilitación.** Los Términos usan «inhabilitar temporalmente» solo para la inactividad (14.1, punto 1) y «suspender» para las demás causas; las Políticas comerciales (3.2) hablan de «una Cuenta suspendida por inactividad». En la app tienen el mismo efecto (no elaborar ni concluir; sí consultar y descargar; el saldo intacto) y se distinguen por el tipo y por cómo se sale: la inhabilitación por inactividad se levanta a solicitud, sin más; la suspensión por otra causa, cuando la persona aclara la causa.

## Baja voluntaria

«Mi cuenta» › «Baja de la cuenta» › «Dar de baja mi cuenta». Antes de confirmar, la ventana muestra los efectos (`closure-effects.ts`): el saldo (Políticas 3.2, el aviso que ya estaba), la Licencia (17.10), los datos personales (Aviso de privacidad 7.3 y 8.3) y la reactivación. Al lado se ofrece pedirla por correo a `EMAIL_REPLY_TO` (el correo de atención; si falta, `contacto@valuaxissoft.com`).

Al confirmar (`POST /api/cuenta/baja`):

1. Se registra la solicitud con fecha, hora e IP (`STipo = BAJA`, `SOrigen = USUARIO`).
2. Se bloquea el acceso: se revocan todas las sesiones y la página lleva al inicio de sesión con el aviso «Registramos la baja de tu cuenta…».
3. Se programa el trámite de los datos: la baja se tramita como solicitud de cancelación (Aviso de privacidad 7.3); `DFechaSupresionProgramada` es el fin del bloqueo (hoy, diez años: `ACCOUNT_DATA_BLOCKING_YEARS`, **por confirmar con el abogado**). **Nada borra los datos de la cuenta**: es un estado que el operador ve. Los datos necesarios para respetar el saldo y reactivar la cuenta se conservan (art. 25 de la Ley).
4. Se manda el correo `BAJA` con los efectos.

Los avalúos concluidos se conservan (abajo): si la persona reactiva su cuenta, los vuelve a consultar.

Una baja pedida por correo la registra el operador en `/operador/cuentas` con «Registrar la baja»: mismo efecto, `SOrigen = CORREO`.

## Inactividad

`pnpm accounts:inactivity` (OPERACION.md §20), una vez al día:

1. **Aviso.** Cuenta activa, con el correo verificado y que no es del operador, sin avalúos creados en tres meses (desde el último avalúo que creó, su alta o su última reactivación, lo más reciente): se manda el correo `INACTIVIDAD` para que descargue sus reportes y se abre un renglón `INACTIVIDAD` sin inicio. Si el correo falla no se abre el renglón y se intenta al día siguiente.
2. **Inhabilitación.** 30 días después del aviso (`INACTIVITY_DISABLE_AFTER_NOTICE_DAYS`; eran 15, el cliente pidió 30 el 26 nov 2026 y el abogado actualiza los Términos, que solo dicen «puede inhabilitar»), si no creó avalúos, el renglón toma su inicio y se manda el correo `INHABILITACION` con la forma de pedir la reactivación.
3. **Retiro.** Si crea un avalúo después del aviso, el renglón se cierra con `SMotivoFin = ACTIVIDAD`, sin correo.

La reactivación la hace el operador con «Reactivar» cuando la persona la pide por correo (máximo doce horas). Se registran la fecha del aviso (`DFechaAviso`), de la inhabilitación (`DFechaInicio`) y de la reactivación (`DFechaFin`).

## Otras suspensiones

El operador (Álvaro decide) usa «Aviso de suspensión» en `/operador/cuentas`: correo de la cuenta, causa (Términos 14.1, puntos 2 a 5: suplantación, préstamo, uso ilícito o incumplimiento grave, cancelación o contracargo), detalle que se le comunica, «Urgente» y, solo con suplantación, «Bloquear el acceso mientras se verifica la identidad».

- **Normal:** correo `SUSPENSION_AVISO` con la causa y el límite: el fin del quinto día hábil siguiente, en hora de la Ciudad de México (`businessDaysDeadline`; días hábiles de lunes a viernes sin los descansos del artículo 74 de la LFT; los días de elecciones no se conocen de antemano y se cuentan a mano). Vencido el plazo, «Aplicar suspensión» la pone en vigor y manda `SUSPENSION`.
- **Urgente:** la suspensión empieza al avisar y los cinco días corren desde ese aviso (correo `SUSPENSION`).
- **Respuesta:** lo que la persona contesta por correo se registra con «Registrar respuesta» (texto y fecha).
- **Fin:** «Levantar» si aclaró (`ACLARADA`) o «Retirar aviso» si no llegó a aplicarse. Si estaba en vigor, se manda `REACTIVACION`.

Cada paso queda además en la auditoría (`ACCOUNT_SUSPENSION_NOTICE`, `ACCOUNT_SUSPENDED`, `ACCOUNT_SUSPENSION_RESPONSE`, `ACCOUNT_SUSPENSION_LIFTED`, `ACCOUNT_REACTIVATED`, `ACCOUNT_CLOSURE_REQUESTED`, `ACCOUNT_CLOSURE_RECORDED`).

## Guarda de los avalúos concluidos

**Un avalúo concluido nunca se borra** (decisión del cliente del 26 nov 2026: «los avalúos concluidos nunca se borran»; antes la tarea suprimía el avalúo al vencer su vigencia). El abogado actualiza los Términos 14.3 y el Aviso de privacidad 8.3, y **debe confirmar esta regla antes de encender la tarea**.

`pnpm valuations:retention` (OPERACION.md §21), una vez al día, apagada por omisión:

- **Qué se quita:** doce meses después de la conclusión (sin importar la vigencia de la carátula; `exportCopiesDue`), solo las copias pesadas: los PDF del dictamen y de la memoria que se guardaron en el almacenamiento al descargarlos (`devpware_exportaciones_avaluos` con su archivo). Se borran el archivo en la base y en S3 (después de confirmar la transacción). El renglón de la exportación se queda como historial, sin archivo y con `DFechaExpiracion` (el día en que se quitó la copia).
- **Qué se conserva:** todo lo demás: el avalúo con sus versiones, secciones, cálculos, comparables, imágenes, carátula y conclusión; su historial de estados, la auditoría, los movimientos de saldo y las facturas. El avalúo se sigue consultando y su PDF y su .zip se vuelven a generar cuando se piden (el .zip se arma al descargarlo y no se guarda).
- **Sin correo:** como no se pierde nada del avalúo, ya no se manda el aviso «descarga o respalda tu reporte» 30 días antes.
- El código que suprimía el avalúo completo (`valuation-suppression.ts`, PR #168) se quitó; si el abogado pidiera volver a suprimir, está en el historial de git.

## Bitácora de avisos por correo

`devpware_avisos_correo` (matriz 3.4): cada aviso de baja, inactividad, inhabilitación, suspensión y reactivación (y los de vencimiento de la guarda que se hubieran mandado antes del 26 nov 2026), con fecha de envío, destinatario, asunto, el texto tal como se envió, la versión de la redacción (`ACCOUNT_NOTICE_VERSION`), a qué se refiere (`SEntidad`, `SIdentificadorEntidad`) y si salió o el error. Solo se insertan renglones; una prueba revisa que ningún código los modifique o borre. Al cambiar un texto de `account-notice.ts`, cambiar también la versión.

```sql
select "DFechaEnvio", "STipo", "SVersion", "SDestinatario", "BEnviado", "SError"
from devpware_avisos_correo order by "DFechaEnvio" desc limit 50;
```

## Pendientes y preguntas al cliente

- El correo de atención de los Términos 1.1 está en blanco; la app usa `EMAIL_REPLY_TO`.
- El plazo de bloqueo de los datos de una cuenta dada de baja (prescripción): hoy diez años, por confirmar con el abogado.
- Los 30 días entre el correo de inactividad y la inhabilitación (pedidos por el cliente el 26 nov 2026; el abogado actualiza los Términos).
- Que un avalúo concluido nunca se borre y a los doce meses solo se quiten las copias de PDF: lo confirma el abogado antes de encender la guarda. Los correos de baja, inactividad y suspensión todavía dicen «mientras dure su guarda» (texto del abogado; se cambia cuando mande el nuevo y con `ACCOUNT_NOTICE_VERSION`).
- «Elaborar» avalúos: hoy la suspensión impide crear, duplicar y concluir; editar un avalúo ya abierto sigue permitido para no perder trabajo a medias.
- Los avalúos que nunca se concluyen no tienen guarda: sus copias de PDF no se quitan.
