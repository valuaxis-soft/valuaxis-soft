-- Migracion 003_organizaciones_usuarios
-- Tablas base de organizaciones y usuarios.

CREATE TABLE "devpware_organizaciones" (
    "IdOrganizacion" SERIAL NOT NULL,
    "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
    "IdEstadoOrganizacion" INTEGER NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SSlug" VARCHAR(180) NOT NULL,
    "SRazonSocial" VARCHAR(220),
    "SRFC" VARCHAR(20),
    "SCorreo" VARCHAR(180),
    "STelefono" VARCHAR(30),
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMP(3),
    CONSTRAINT "devpware_organizaciones_pkey" PRIMARY KEY ("IdOrganizacion"),
    CONSTRAINT "devpware_organizaciones_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
    CONSTRAINT "devpware_organizaciones_SSlug_key" UNIQUE ("SSlug"),
    CONSTRAINT "devpware_organizaciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_organizaciones_SSlug_check" CHECK (btrim("SSlug") <> ''),
    CONSTRAINT "devpware_organizaciones_IdEstadoOrganizacion_fkey" FOREIGN KEY ("IdEstadoOrganizacion") REFERENCES "devpware_estados_organizaciones" ("IdEstadoOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_organizaciones_IdEstadoOrganizacion_idx" ON "devpware_organizaciones" ("IdEstadoOrganizacion");
CREATE INDEX "devpware_organizaciones_BActivo_idx" ON "devpware_organizaciones" ("BActivo");
CREATE INDEX "devpware_organizaciones_DFechaEliminacion_idx" ON "devpware_organizaciones" ("DFechaEliminacion");

CREATE TABLE "devpware_usuarios" (
    "IdUsuario" SERIAL NOT NULL,
    "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
    "IdEstadoUsuario" INTEGER NOT NULL,
    "SNombre" VARCHAR(120) NOT NULL,
    "SApellidoPaterno" VARCHAR(120),
    "SApellidoMaterno" VARCHAR(120),
    "SCorreo" VARCHAR(180) NOT NULL,
    "SContrasenaHash" VARCHAR(255) NOT NULL,
    "STelefono" VARCHAR(30),
    "SImagenPerfil" VARCHAR(500),
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaUltimoAcceso" TIMESTAMP(3),
    "DFechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMP(3) NOT NULL,
    "DFechaEliminacion" TIMESTAMP(3),
    CONSTRAINT "devpware_usuarios_pkey" PRIMARY KEY ("IdUsuario"),
    CONSTRAINT "devpware_usuarios_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
    CONSTRAINT "devpware_usuarios_SCorreo_key" UNIQUE ("SCorreo"),
    CONSTRAINT "devpware_usuarios_SNombre_check" CHECK (btrim("SNombre") <> ''),
    CONSTRAINT "devpware_usuarios_SCorreo_check" CHECK (btrim("SCorreo") <> ''),
    CONSTRAINT "devpware_usuarios_IdEstadoUsuario_fkey" FOREIGN KEY ("IdEstadoUsuario") REFERENCES "devpware_estados_usuarios" ("IdEstadoUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_usuarios_IdEstadoUsuario_idx" ON "devpware_usuarios" ("IdEstadoUsuario");
CREATE INDEX "devpware_usuarios_BActivo_idx" ON "devpware_usuarios" ("BActivo");
CREATE INDEX "devpware_usuarios_DFechaEliminacion_idx" ON "devpware_usuarios" ("DFechaEliminacion");
