-- Notificaciones dentro de la aplicación (campana del encabezado y página
-- «Notificaciones», docs/ROUTES.md).
--
-- Una fila por aviso y por persona. IdOrganizacion es el despacho en que
-- ocurrió (se ve solo con ese despacho abierto); NULL es un aviso de la
-- persona misma, como su acreditación, y se ve en cualquier despacho.
-- DFechaLectura NULL quiere decir «no leída». Los avisos de más de 90 días
-- se borran solos al emitir uno nuevo para esa persona.
--
-- Solo crea una tabla nueva con sus índices; no altera ninguna tabla ni
-- restricción existente. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_notificaciones" (
  "IdNotificacion" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdUsuario" INTEGER NOT NULL,
  "IdOrganizacion" INTEGER,
  "STipo" VARCHAR(40) NOT NULL,
  "STitulo" VARCHAR(200) NOT NULL,
  "STexto" VARCHAR(1000),
  "SEnlace" VARCHAR(500),
  "DFechaLectura" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_notificaciones_pkey" PRIMARY KEY ("IdNotificacion"),
  CONSTRAINT "devpware_notificaciones_IdUsuario_fkey" FOREIGN KEY ("IdUsuario")
    REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_notificaciones_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion")
    REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_notificaciones_UIdentificadorPublico_key"
  ON "devpware_notificaciones" ("UIdentificadorPublico");
-- La campana: los avisos más recientes de una persona.
CREATE INDEX IF NOT EXISTS "devpware_notificaciones_IdUsuario_DFechaCreacion_idx"
  ON "devpware_notificaciones" ("IdUsuario", "DFechaCreacion" DESC);
-- El contador de no leídas, que se consulta cada minuto.
CREATE INDEX IF NOT EXISTS "devpware_notificaciones_no_leidas_idx"
  ON "devpware_notificaciones" ("IdUsuario", "IdOrganizacion")
  WHERE "DFechaLectura" IS NULL;
CREATE INDEX IF NOT EXISTS "devpware_notificaciones_IdOrganizacion_idx"
  ON "devpware_notificaciones" ("IdOrganizacion");
