-- Migracion 004_roles_permisos
-- Roles, permisos, membresias, sesiones e intentos de acceso.

CREATE TABLE "devpware_roles" (
    "IdRol" SERIAL NOT NULL,
    "SClave" VARCHAR(80) NOT NULL,
    "SNombre" VARCHAR(160) NOT NULL,
    "SDescripcion" VARCHAR(500),
    "BEsSistema" BOOLEAN NOT NULL DEFAULT false,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_roles_pkey" PRIMARY KEY ("IdRol"),
    CONSTRAINT "devpware_roles_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_roles_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_roles_SNombre_check" CHECK (btrim("SNombre") <> '')
);

CREATE TABLE "devpware_permisos" (
    "IdPermiso" SERIAL NOT NULL,
    "SClave" VARCHAR(100) NOT NULL,
    "SNombre" VARCHAR(180) NOT NULL,
    "SDescripcion" VARCHAR(500),
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_permisos_pkey" PRIMARY KEY ("IdPermiso"),
    CONSTRAINT "devpware_permisos_SClave_key" UNIQUE ("SClave"),
    CONSTRAINT "devpware_permisos_SClave_check" CHECK (btrim("SClave") <> ''),
    CONSTRAINT "devpware_permisos_SNombre_check" CHECK (btrim("SNombre") <> '')
);

CREATE TABLE "devpware_permisos_roles" (
    "IdPermisoRol" SERIAL NOT NULL,
    "IdRol" INTEGER NOT NULL,
    "IdPermiso" INTEGER NOT NULL,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_permisos_roles_pkey" PRIMARY KEY ("IdPermisoRol"),
    CONSTRAINT "devpware_permisos_roles_IdRol_IdPermiso_key" UNIQUE ("IdRol", "IdPermiso"),
    CONSTRAINT "devpware_permisos_roles_IdRol_fkey" FOREIGN KEY ("IdRol") REFERENCES "devpware_roles" ("IdRol") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_permisos_roles_IdPermiso_fkey" FOREIGN KEY ("IdPermiso") REFERENCES "devpware_permisos" ("IdPermiso") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_permisos_roles_IdRol_idx" ON "devpware_permisos_roles" ("IdRol");
CREATE INDEX "devpware_permisos_roles_IdPermiso_idx" ON "devpware_permisos_roles" ("IdPermiso");

CREATE TABLE "devpware_miembros_organizaciones" (
    "IdMiembroOrganizacion" SERIAL NOT NULL,
    "IdOrganizacion" INTEGER NOT NULL,
    "IdUsuario" INTEGER NOT NULL,
    "IdRol" INTEGER NOT NULL,
    "BActivo" BOOLEAN NOT NULL DEFAULT true,
    "DFechaIngreso" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "devpware_miembros_organizaciones_pkey" PRIMARY KEY ("IdMiembroOrganizacion"),
    CONSTRAINT "devpware_miembros_organizaciones_IdOrganizacion_IdUsuario_key" UNIQUE ("IdOrganizacion", "IdUsuario"),
    CONSTRAINT "devpware_miembros_organizaciones_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_miembros_organizaciones_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "devpware_miembros_organizaciones_IdRol_fkey" FOREIGN KEY ("IdRol") REFERENCES "devpware_roles" ("IdRol") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "devpware_miembros_organizaciones_IdOrganizacion_idx" ON "devpware_miembros_organizaciones" ("IdOrganizacion");
CREATE INDEX "devpware_miembros_organizaciones_IdUsuario_idx" ON "devpware_miembros_organizaciones" ("IdUsuario");
CREATE INDEX "devpware_miembros_organizaciones_IdRol_idx" ON "devpware_miembros_organizaciones" ("IdRol");
CREATE INDEX "devpware_miembros_organizaciones_BActivo_idx" ON "devpware_miembros_organizaciones" ("BActivo");

CREATE TABLE "devpware_sesiones" (
    "IdSesion" SERIAL NOT NULL,
    "IdUsuario" INTEGER NOT NULL,
    "IdOrganizacion" INTEGER NOT NULL,
    "STokenHash" VARCHAR(255) NOT NULL,
    "SDireccionIP" VARCHAR(64),
    "SAgenteUsuario" TEXT,
    "BRevocada" BOOLEAN NOT NULL DEFAULT false,
    "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
    "DFechaRevocacion" TIMESTAMPTZ(3),
    CONSTRAINT "devpware_sesiones_pkey" PRIMARY KEY ("IdSesion"),
    CONSTRAINT "devpware_sesiones_STokenHash_key" UNIQUE ("STokenHash"),
    CONSTRAINT "devpware_sesiones_STokenHash_check" CHECK (btrim("STokenHash") <> ''),
    CONSTRAINT "devpware_sesiones_DFechaExpiracion_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
    CONSTRAINT "devpware_sesiones_revocacion_check" CHECK (("BRevocada" = false) OR ("DFechaRevocacion" IS NOT NULL)),
    CONSTRAINT "devpware_sesiones_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "devpware_sesiones_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "devpware_sesiones_IdUsuario_idx" ON "devpware_sesiones" ("IdUsuario");
CREATE INDEX "devpware_sesiones_IdOrganizacion_idx" ON "devpware_sesiones" ("IdOrganizacion");
CREATE INDEX "devpware_sesiones_BRevocada_idx" ON "devpware_sesiones" ("BRevocada");
CREATE INDEX "devpware_sesiones_DFechaExpiracion_idx" ON "devpware_sesiones" ("DFechaExpiracion");

CREATE TABLE "devpware_intentos_acceso" (
    "IdIntentoAcceso" BIGSERIAL NOT NULL,
    "IdUsuario" INTEGER,
    "SCorreoIntentado" VARCHAR(180) NOT NULL,
    "SDireccionIP" VARCHAR(64),
    "BExitoso" BOOLEAN NOT NULL DEFAULT false,
    "SMotivoFallo" VARCHAR(500),
    "DFechaIntento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devpware_intentos_acceso_pkey" PRIMARY KEY ("IdIntentoAcceso"),
    CONSTRAINT "devpware_intentos_acceso_SCorreoIntentado_check" CHECK (btrim("SCorreoIntentado") <> ''),
    CONSTRAINT "devpware_intentos_acceso_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "devpware_intentos_acceso_IdUsuario_idx" ON "devpware_intentos_acceso" ("IdUsuario");
CREATE INDEX "devpware_intentos_acceso_SCorreoIntentado_idx" ON "devpware_intentos_acceso" ("SCorreoIntentado");
CREATE INDEX "devpware_intentos_acceso_SDireccionIP_idx" ON "devpware_intentos_acceso" ("SDireccionIP");
CREATE INDEX "devpware_intentos_acceso_BExitoso_idx" ON "devpware_intentos_acceso" ("BExitoso");
CREATE INDEX "devpware_intentos_acceso_DFechaIntento_idx" ON "devpware_intentos_acceso" ("DFechaIntento");

INSERT INTO "devpware_roles" ("SClave", "SNombre", "SDescripcion", "BEsSistema", "BActivo", "DFechaCreacion", "DFechaModificacion") VALUES
    ('ADMINISTRADOR', 'Administrador', 'Acceso administrativo completo.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('VALUADOR', 'Valuador', 'Usuario responsable de crear y editar avaluos.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('REVISOR', 'Revisor', 'Usuario responsable de revisar avaluos.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CONSULTA', 'Consulta', 'Usuario con acceso de consulta.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BEsSistema" = EXCLUDED."BEsSistema",
    "BActivo" = EXCLUDED."BActivo",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_permisos" ("SClave", "SNombre", "SDescripcion", "BActivo", "DFechaCreacion", "DFechaModificacion") VALUES
    ('AVALUO_VER', 'Ver avaluos', 'Permite consultar avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_CREAR', 'Crear avaluos', 'Permite crear avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_EDITAR', 'Editar avaluos', 'Permite editar avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_REVISAR', 'Revisar avaluos', 'Permite revisar avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_CONCLUIR', 'Concluir avaluos', 'Permite concluir avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_REABRIR', 'Reabrir avaluos', 'Permite reabrir avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_DUPLICAR', 'Duplicar avaluos', 'Permite duplicar avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('AVALUO_EXPORTAR', 'Exportar avaluos', 'Permite exportar avaluos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CATALOGO_ADMINISTRAR', 'Administrar catalogos', 'Permite administrar catalogos.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('USUARIO_ADMINISTRAR', 'Administrar usuarios', 'Permite administrar usuarios.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('COMPARABLE_ADMINISTRAR', 'Administrar comparables', 'Permite administrar comparables.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('PLANTILLA_ADMINISTRAR', 'Administrar plantillas', 'Permite administrar plantillas.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
    "SNombre" = EXCLUDED."SNombre",
    "SDescripcion" = EXCLUDED."SDescripcion",
    "BActivo" = EXCLUDED."BActivo",
    "DFechaModificacion" = CURRENT_TIMESTAMP;

WITH asignaciones("SClaveRol", "SClavePermiso") AS (
    VALUES
        ('ADMINISTRADOR', 'AVALUO_VER'),
        ('ADMINISTRADOR', 'AVALUO_CREAR'),
        ('ADMINISTRADOR', 'AVALUO_EDITAR'),
        ('ADMINISTRADOR', 'AVALUO_REVISAR'),
        ('ADMINISTRADOR', 'AVALUO_CONCLUIR'),
        ('ADMINISTRADOR', 'AVALUO_REABRIR'),
        ('ADMINISTRADOR', 'AVALUO_DUPLICAR'),
        ('ADMINISTRADOR', 'AVALUO_EXPORTAR'),
        ('ADMINISTRADOR', 'CATALOGO_ADMINISTRAR'),
        ('ADMINISTRADOR', 'USUARIO_ADMINISTRAR'),
        ('ADMINISTRADOR', 'COMPARABLE_ADMINISTRAR'),
        ('ADMINISTRADOR', 'PLANTILLA_ADMINISTRAR'),
        ('VALUADOR', 'AVALUO_VER'),
        ('VALUADOR', 'AVALUO_CREAR'),
        ('VALUADOR', 'AVALUO_EDITAR'),
        ('VALUADOR', 'AVALUO_CONCLUIR'),
        ('VALUADOR', 'AVALUO_REABRIR'),
        ('VALUADOR', 'AVALUO_DUPLICAR'),
        ('VALUADOR', 'AVALUO_EXPORTAR'),
        ('VALUADOR', 'COMPARABLE_ADMINISTRAR'),
        ('REVISOR', 'AVALUO_VER'),
        ('REVISOR', 'AVALUO_REVISAR'),
        ('REVISOR', 'AVALUO_CONCLUIR'),
        ('REVISOR', 'AVALUO_EXPORTAR'),
        ('CONSULTA', 'AVALUO_VER'),
        ('CONSULTA', 'AVALUO_EXPORTAR')
)
INSERT INTO "devpware_permisos_roles" ("IdRol", "IdPermiso", "DFechaCreacion")
SELECT r."IdRol", p."IdPermiso", CURRENT_TIMESTAMP
FROM asignaciones a
JOIN "devpware_roles" r ON r."SClave" = a."SClaveRol"
JOIN "devpware_permisos" p ON p."SClave" = a."SClavePermiso"
ON CONFLICT ("IdRol", "IdPermiso") DO NOTHING;
