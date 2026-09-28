-- Invitaciones para unirse a una organizacion (equipos del despacho).
--
-- El administrador invita un correo con un rol; la persona acepta desde el
-- enlace del correo o desde su tablero, con una cuenta de ese mismo correo.
-- Solo se guarda el hash del token. Una invitacion pendiente por correo y
-- organizacion; al reenviar se revoca la anterior.
--
-- Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_invitaciones_organizaciones" (
  "IdInvitacionOrganizacion" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdRol" INTEGER NOT NULL,
  "IdUsuarioInvitador" INTEGER NOT NULL,
  "IdUsuarioAceptante" INTEGER,
  "SCorreo" VARCHAR(180) NOT NULL,
  "STokenHash" VARCHAR(255) NOT NULL,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaAceptacion" TIMESTAMPTZ(3),
  "DFechaRevocacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_invitaciones_organizaciones_pkey" PRIMARY KEY ("IdInvitacionOrganizacion"),
  CONSTRAINT "devpware_invitaciones_organizaciones_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_invitaciones_organizaciones_STokenHash_key" UNIQUE ("STokenHash"),
  CONSTRAINT "devpware_invitaciones_organizaciones_correo_check" CHECK (btrim("SCorreo") <> '' AND "SCorreo" = lower("SCorreo")),
  CONSTRAINT "devpware_invitaciones_organizaciones_fechas_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
  CONSTRAINT "devpware_invitaciones_organizaciones_estado_check" CHECK ("DFechaAceptacion" IS NULL OR "DFechaRevocacion" IS NULL),
  CONSTRAINT "devpware_invitaciones_organizaciones_aceptante_check" CHECK (("DFechaAceptacion" IS NULL) = ("IdUsuarioAceptante" IS NULL)),
  CONSTRAINT "devpware_invitaciones_organizaciones_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_invitaciones_organizaciones_IdRol_fkey" FOREIGN KEY ("IdRol") REFERENCES "devpware_roles" ("IdRol") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_invitaciones_organizaciones_IdUsuarioInvitador_fkey" FOREIGN KEY ("IdUsuarioInvitador") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_invitaciones_organizaciones_IdUsuarioAceptante_fkey" FOREIGN KEY ("IdUsuarioAceptante") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "devpware_invitaciones_organizaciones_IdOrganizacion_idx" ON "devpware_invitaciones_organizaciones" ("IdOrganizacion");
CREATE INDEX IF NOT EXISTS "devpware_invitaciones_organizaciones_SCorreo_idx" ON "devpware_invitaciones_organizaciones" ("SCorreo");
CREATE UNIQUE INDEX IF NOT EXISTS "devpware_invitaciones_organizaciones_pendiente_key"
  ON "devpware_invitaciones_organizaciones" ("IdOrganizacion", "SCorreo")
  WHERE "DFechaAceptacion" IS NULL AND "DFechaRevocacion" IS NULL;
