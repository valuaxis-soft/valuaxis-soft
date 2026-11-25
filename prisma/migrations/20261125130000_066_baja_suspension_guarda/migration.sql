-- Baja, suspensión de cuentas, guarda de los avalúos y bitácora de avisos por
-- correo (docs/CUENTAS.md).
--
-- devpware_suspensiones_cuentas: una fila por cada baja o suspensión de una
-- cuenta, con su historia completa: la causa, el aviso previo, el plazo para
-- aclarar, la respuesta, el inicio y el fin (reactivación). Una fila sin
-- DFechaInicio es un aviso todavía sin efecto; con DFechaInicio y sin DFechaFin
-- está en vigor. Nunca se borran: el fin se escribe en DFechaFin.
--
-- devpware_avisos_correo: cada aviso que se manda por correo (inactividad,
-- vencimiento de la guarda, suspensión, baja, reactivación) con la fecha, el
-- destinatario, el asunto, el texto enviado y la versión del texto. Solo se
-- insertan renglones; el código nunca los modifica ni los borra.
--
-- devpware_avaluos."DFechaSupresion": cuándo se suprimió el contenido de un
-- avalúo al vencer su guarda. El renglón se conserva (folio, fechas y quién lo
-- hizo) porque los movimientos de saldo lo citan.
--
-- Solo crea tablas, índices y una columna nueva que admite NULL; no altera
-- ninguna tabla, columna ni restricción existente. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_suspensiones_cuentas" (
  "IdSuspensionCuenta" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdUsuario" INTEGER NOT NULL,
  -- BAJA (la pide el usuario), INACTIVIDAD (tres meses sin avalúos) u OTRA (la decide el operador).
  "STipo" VARCHAR(20) NOT NULL,
  -- Para OTRA: SUPLANTACION, PRESTAMO, USO_ILICITO o CONTRACARGO (Términos, sección 14.1).
  "SCausa" VARCHAR(40),
  "SDetalle" VARCHAR(2000),
  -- Quién la originó: USUARIO (botón de la app), CORREO (la pidió por correo), OPERADOR o PROCESO (tarea diaria).
  "SOrigen" VARCHAR(20) NOT NULL,
  -- Sin acceso a la cuenta (baja; verificación de identidad). Las demás dejan consultar y descargar.
  "BBloqueaAcceso" BOOLEAN NOT NULL DEFAULT false,
  "BUrgente" BOOLEAN NOT NULL DEFAULT false,
  "DFechaSolicitud" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaAviso" TIMESTAMPTZ(3),
  "DFechaLimiteAclaracion" TIMESTAMPTZ(3),
  "SRespuesta" VARCHAR(2000),
  "DFechaRespuesta" TIMESTAMPTZ(3),
  "DFechaInicio" TIMESTAMPTZ(3),
  "DFechaFin" TIMESTAMPTZ(3),
  -- REACTIVACION, ACLARADA o ACTIVIDAD (volvió a crear avalúos antes de inhabilitarse).
  "SMotivoFin" VARCHAR(40),
  -- Baja: fin del bloqueo de los datos de la cuenta, cuando tocaría suprimirlos (Aviso de privacidad, 7.3 y 8.3).
  "DFechaSupresionProgramada" TIMESTAMPTZ(3),
  "IdUsuarioOperador" INTEGER,
  "IdUsuarioOperadorFin" INTEGER,
  "SDireccionIP" VARCHAR(80),
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_suspensiones_cuentas_pkey" PRIMARY KEY ("IdSuspensionCuenta"),
  CONSTRAINT "devpware_suspensiones_cuentas_IdUsuario_fkey" FOREIGN KEY ("IdUsuario")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_suspensiones_cuentas_IdUsuarioOperador_fkey" FOREIGN KEY ("IdUsuarioOperador")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_suspensiones_cuentas_IdUsuarioOperadorFin_fkey" FOREIGN KEY ("IdUsuarioOperadorFin")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_suspensiones_cuentas_UIdentificadorPublico_key"
  ON "devpware_suspensiones_cuentas" ("UIdentificadorPublico");
-- Lo abierto de una persona (avisos y suspensiones sin fin), que se consulta en cada sesión.
CREATE INDEX IF NOT EXISTS "devpware_suspensiones_cuentas_abiertas_idx"
  ON "devpware_suspensiones_cuentas" ("IdUsuario")
  WHERE "DFechaFin" IS NULL;
CREATE INDEX IF NOT EXISTS "devpware_suspensiones_cuentas_IdUsuario_idx"
  ON "devpware_suspensiones_cuentas" ("IdUsuario", "DFechaSolicitud" DESC);

CREATE TABLE IF NOT EXISTS "devpware_avisos_correo" (
  "IdAvisoCorreo" SERIAL NOT NULL,
  "IdUsuario" INTEGER,
  -- INACTIVIDAD, INHABILITACION, GUARDA_POR_VENCER, SUSPENSION_AVISO, SUSPENSION, BAJA, REACTIVACION.
  "STipo" VARCHAR(40) NOT NULL,
  -- La versión del texto («2026-11-25»): qué redacción recibió.
  "SVersion" VARCHAR(40) NOT NULL,
  "SDestinatario" VARCHAR(180) NOT NULL,
  "SAsunto" VARCHAR(300) NOT NULL,
  "STexto" TEXT NOT NULL,
  -- A qué se refiere: «Avaluo» o «SuspensionCuenta» y su identificador público.
  "SEntidad" VARCHAR(60),
  "SIdentificadorEntidad" VARCHAR(80),
  "BEnviado" BOOLEAN NOT NULL,
  "SError" VARCHAR(500),
  "DFechaEnvio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_avisos_correo_pkey" PRIMARY KEY ("IdAvisoCorreo"),
  CONSTRAINT "devpware_avisos_correo_IdUsuario_fkey" FOREIGN KEY ("IdUsuario")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "devpware_avisos_correo_IdUsuario_idx"
  ON "devpware_avisos_correo" ("IdUsuario", "DFechaEnvio" DESC);
-- «¿Ya se avisó de este avalúo?»: la tarea diaria no repite un aviso enviado.
CREATE INDEX IF NOT EXISTS "devpware_avisos_correo_entidad_idx"
  ON "devpware_avisos_correo" ("STipo", "SIdentificadorEntidad");

ALTER TABLE "devpware_avaluos" ADD COLUMN IF NOT EXISTS "DFechaSupresion" TIMESTAMPTZ(3);
