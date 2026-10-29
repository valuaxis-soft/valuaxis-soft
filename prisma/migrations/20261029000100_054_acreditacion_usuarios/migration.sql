-- Acreditacion profesional de usuarios (docs/ACREDITACION.md).
--
-- Un usuario se acredita al subir su Constancia de Situacion Profesional (o
-- solo la imagen de su codigo QR). Mientras quien emite un avaluo no este
-- acreditado, el dictamen y la memoria de calculo imprimen el aviso "DOCUMENTO
-- SIN VALIDEZ OFICIAL".
--
-- Una fila por usuario. No guarda la CURP en claro: solo su hash (HMAC-SHA256
-- con ACCREDITATION_HASH_SECRET, o SHA-256 con prefijo si falta el secreto).
-- La URL de verificacion de la SEP solo se conserva mientras la solicitud esta
-- EN_REVISION; al aprobar o rechazar se borra. El archivo subido no se guarda.
--
-- Solo crea una tabla nueva con sus restricciones propias; no altera
-- devpware_usuarios ni ninguna restriccion existente. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_acreditaciones_usuarios" (
  "IdAcreditacionUsuario" SERIAL NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "SEstado" VARCHAR(20) NOT NULL DEFAULT 'NO_ACREDITADO',
  "SFolio" VARCHAR(20),
  "SCurpHash" VARCHAR(80),
  "SNumeroCedula" VARCHAR(30),
  "SNombreSep" VARCHAR(300),
  "SUrlVerificacion" VARCHAR(500),
  "SResultadoAutomatico" VARCHAR(30),
  "SMotivo" VARCHAR(500),
  "SResueltoPor" VARCHAR(180),
  "DFechaSolicitud" TIMESTAMPTZ(3),
  "DFechaVerificacion" TIMESTAMPTZ(3),
  "DFechaRevocacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_acreditaciones_usuarios_pkey" PRIMARY KEY ("IdAcreditacionUsuario"),
  CONSTRAINT "devpware_acreditaciones_usuarios_IdUsuario_fkey" FOREIGN KEY ("IdUsuario")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_acreditaciones_usuarios_estado_check"
    CHECK ("SEstado" IN ('NO_ACREDITADO', 'EN_REVISION', 'ACREDITADO', 'RECHAZADO'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_acreditaciones_usuarios_IdUsuario_key"
  ON "devpware_acreditaciones_usuarios" ("IdUsuario");
CREATE INDEX IF NOT EXISTS "devpware_acreditaciones_usuarios_SEstado_idx"
  ON "devpware_acreditaciones_usuarios" ("SEstado");
CREATE INDEX IF NOT EXISTS "devpware_acreditaciones_usuarios_SCurpHash_idx"
  ON "devpware_acreditaciones_usuarios" ("SCurpHash");
