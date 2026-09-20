-- Migracion 023_autenticacion_identidades
-- Autenticacion local, Google/OAuth, verificacion de correo, recuperacion de contrasena y sesiones seguras.
-- Requiere migraciones 001 a 022 aplicadas.
BEGIN;

-- Los usuarios registrados solo con Google pueden no tener contrasena local.
ALTER TABLE "devpware_usuarios"
  ALTER COLUMN "SContrasenaHash" DROP NOT NULL;

ALTER TABLE "devpware_usuarios"
  ADD COLUMN "BCorreoVerificado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "DFechaVerificacionCorreo" TIMESTAMPTZ(3),
  ADD COLUMN "DFechaCambioContrasena" TIMESTAMPTZ(3),
  ADD COLUMN "IReintentosConsecutivos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "DFechaBloqueoTemporal" TIMESTAMPTZ(3);

ALTER TABLE "devpware_usuarios"
  ADD CONSTRAINT "devpware_usuarios_verificacion_correo_check"
    CHECK (("BCorreoVerificado" = false) OR ("DFechaVerificacionCorreo" IS NOT NULL)),
  ADD CONSTRAINT "devpware_usuarios_reintentos_check"
    CHECK ("IReintentosConsecutivos" >= 0);

CREATE TABLE "devpware_proveedores_identidad" (
  "IdProveedorIdentidad" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BTipoLocal" BOOLEAN NOT NULL DEFAULT false,
  "BUsaOAuth" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteRegistro" BOOLEAN NOT NULL DEFAULT true,
  "BPermiteInicioSesion" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_proveedores_identidad_pkey" PRIMARY KEY ("IdProveedorIdentidad"),
  CONSTRAINT "devpware_proveedores_identidad_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_proveedores_identidad_clave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_proveedores_identidad_nombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_proveedores_identidad_tipo_check" CHECK (NOT ("BTipoLocal" AND "BUsaOAuth")),
  CONSTRAINT "devpware_proveedores_identidad_orden_check" CHECK ("IOrden" >= 0)
);

CREATE TABLE "devpware_identidades_usuarios" (
  "IdIdentidadUsuario" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdUsuario" INTEGER NOT NULL,
  "IdProveedorIdentidad" INTEGER NOT NULL,
  "SIdentificadorProveedor" VARCHAR(255) NOT NULL,
  "SCorreoProveedor" VARCHAR(180),
  "SNombreProveedor" VARCHAR(220),
  "SImagenProveedor" VARCHAR(1000),
  "BCorreoVerificadoProveedor" BOOLEAN NOT NULL DEFAULT false,
  "BPrincipal" BOOLEAN NOT NULL DEFAULT false,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaUltimoAcceso" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaDesvinculacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_identidades_usuarios_pkey" PRIMARY KEY ("IdIdentidadUsuario"),
  CONSTRAINT "devpware_identidades_usuarios_UIdentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_identidades_usuarios_proveedor_externo_key" UNIQUE ("IdProveedorIdentidad", "SIdentificadorProveedor"),
  CONSTRAINT "devpware_identidades_usuarios_usuario_proveedor_key" UNIQUE ("IdUsuario", "IdProveedorIdentidad"),
  CONSTRAINT "devpware_identidades_usuarios_identificador_check" CHECK (btrim("SIdentificadorProveedor") <> ''),
  CONSTRAINT "devpware_identidades_usuarios_desvinculacion_check" CHECK (("BActiva" = true) OR ("DFechaDesvinculacion" IS NOT NULL)),
  CONSTRAINT "devpware_identidades_usuarios_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_identidades_usuarios_proveedor_fkey" FOREIGN KEY ("IdProveedorIdentidad") REFERENCES "devpware_proveedores_identidad" ("IdProveedorIdentidad") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "devpware_identidades_usuarios_principal_key"
  ON "devpware_identidades_usuarios" ("IdUsuario")
  WHERE "BPrincipal" = true AND "BActiva" = true;

CREATE TABLE "devpware_tokens_verificacion_correos" (
  "IdTokenVerificacionCorreo" BIGSERIAL NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "STokenHash" VARCHAR(255) NOT NULL,
  "SCorreoDestino" VARCHAR(180) NOT NULL,
  "IIntentos" INTEGER NOT NULL DEFAULT 0,
  "BUtilizado" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaUtilizacion" TIMESTAMPTZ(3),
  "DFechaRevocacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_tokens_verificacion_correos_pkey" PRIMARY KEY ("IdTokenVerificacionCorreo"),
  CONSTRAINT "devpware_tokens_verificacion_correos_hash_key" UNIQUE ("STokenHash"),
  CONSTRAINT "devpware_tokens_verificacion_correos_hash_check" CHECK (btrim("STokenHash") <> ''),
  CONSTRAINT "devpware_tokens_verificacion_correos_correo_check" CHECK (btrim("SCorreoDestino") <> ''),
  CONSTRAINT "devpware_tokens_verificacion_correos_intentos_check" CHECK ("IIntentos" >= 0),
  CONSTRAINT "devpware_tokens_verificacion_correos_expiracion_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
  CONSTRAINT "devpware_tokens_verificacion_correos_uso_check" CHECK (("BUtilizado" = false) OR ("DFechaUtilizacion" IS NOT NULL)),
  CONSTRAINT "devpware_tokens_verificacion_correos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_tokens_recuperaciones_contrasenas" (
  "IdTokenRecuperacionContrasena" BIGSERIAL NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "STokenHash" VARCHAR(255) NOT NULL,
  "IIntentos" INTEGER NOT NULL DEFAULT 0,
  "BUtilizado" BOOLEAN NOT NULL DEFAULT false,
  "SDireccionIPSolicitud" VARCHAR(64),
  "SAgenteUsuarioSolicitud" TEXT,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaUtilizacion" TIMESTAMPTZ(3),
  "DFechaRevocacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_pkey" PRIMARY KEY ("IdTokenRecuperacionContrasena"),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_hash_key" UNIQUE ("STokenHash"),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_hash_check" CHECK (btrim("STokenHash") <> ''),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_intentos_check" CHECK ("IIntentos" >= 0),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_expira_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_uso_check" CHECK (("BUtilizado" = false) OR ("DFechaUtilizacion" IS NOT NULL)),
  CONSTRAINT "devpware_tokens_recuperaciones_contrasenas_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_solicitudes_oauth" (
  "IdSolicitudOAuth" BIGSERIAL NOT NULL,
  "IdProveedorIdentidad" INTEGER NOT NULL,
  "IdUsuario" INTEGER,
  "SStateHash" VARCHAR(255) NOT NULL,
  "SNonceHash" VARCHAR(255),
  "SCodeVerifierHash" VARCHAR(255),
  "SURLRetorno" VARCHAR(1000),
  "SDireccionIP" VARCHAR(64),
  "SAgenteUsuario" TEXT,
  "BCompletada" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_solicitudes_oauth_pkey" PRIMARY KEY ("IdSolicitudOAuth"),
  CONSTRAINT "devpware_solicitudes_oauth_state_key" UNIQUE ("SStateHash"),
  CONSTRAINT "devpware_solicitudes_oauth_state_check" CHECK (btrim("SStateHash") <> ''),
  CONSTRAINT "devpware_solicitudes_oauth_expiracion_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
  CONSTRAINT "devpware_solicitudes_oauth_finalizacion_check" CHECK (("BCompletada" = false) OR ("DFechaFinalizacion" IS NOT NULL)),
  CONSTRAINT "devpware_solicitudes_oauth_proveedor_fkey" FOREIGN KEY ("IdProveedorIdentidad") REFERENCES "devpware_proveedores_identidad" ("IdProveedorIdentidad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_solicitudes_oauth_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "devpware_sesiones"
  ADD COLUMN "IdIdentidadUsuario" BIGINT,
  ADD COLUMN "STokenRenovacionHash" VARCHAR(255),
  ADD COLUMN "SIdentificadorDispositivo" VARCHAR(180),
  ADD COLUMN "SNombreDispositivo" VARCHAR(220),
  ADD COLUMN "DFechaUltimaActividad" TIMESTAMPTZ(3),
  ADD COLUMN "DFechaRotacion" TIMESTAMPTZ(3);

ALTER TABLE "devpware_sesiones"
  ADD CONSTRAINT "devpware_sesiones_identidad_fkey" FOREIGN KEY ("IdIdentidadUsuario") REFERENCES "devpware_identidades_usuarios" ("IdIdentidadUsuario") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "devpware_sesiones_token_renovacion_key"
  ON "devpware_sesiones" ("STokenRenovacionHash") WHERE "STokenRenovacionHash" IS NOT NULL;

INSERT INTO "devpware_proveedores_identidad" ("SClave", "SNombre", "SDescripcion", "BTipoLocal", "BUsaOAuth", "BPermiteRegistro", "BPermiteInicioSesion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('LOCAL', 'Correo y contrasena', 'Autenticacion local mediante correo y contrasena.', true, false, true, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GOOGLE', 'Google', 'Autenticacion mediante Google OAuth 2.0 / OpenID Connect.', false, true, true, true, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BTipoLocal" = EXCLUDED."BTipoLocal",
  "BUsaOAuth" = EXCLUDED."BUsaOAuth",
  "BPermiteRegistro" = EXCLUDED."BPermiteRegistro",
  "BPermiteInicioSesion" = EXCLUDED."BPermiteInicioSesion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

COMMIT;
