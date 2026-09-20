-- Migracion 011_archivos
-- Metadatos de archivos para almacenamiento externo en S3. No guarda binarios.

CREATE TABLE "devpware_tipos_relaciones_archivos" (
  "IdTipoRelacionArchivo" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_relaciones_archivos_pkey" PRIMARY KEY ("IdTipoRelacionArchivo"),
  CONSTRAINT "devpware_tipos_relaciones_archivos_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_relaciones_archivos_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_relaciones_archivos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_relaciones_archivos_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_relaciones_archivos_BActivo_idx" ON "devpware_tipos_relaciones_archivos" ("BActivo");
CREATE INDEX "devpware_tipos_relaciones_archivos_IOrden_idx" ON "devpware_tipos_relaciones_archivos" ("IOrden");

CREATE TABLE "devpware_archivos" (
  "IdArchivo" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdUsuarioCarga" INTEGER NOT NULL,
  "IdTipoArchivo" INTEGER NOT NULL,
  "SBucket" VARCHAR(180) NOT NULL,
  "SClaveObjeto" VARCHAR(1024) NOT NULL,
  "SNombreOriginal" VARCHAR(500) NOT NULL,
  "SNombreAlmacenado" VARCHAR(500),
  "STipoMime" VARCHAR(180) NOT NULL,
  "SExtension" VARCHAR(30),
  "ITamanoBytes" BIGINT NOT NULL,
  "SChecksum" VARCHAR(256) NOT NULL,
  "BPrivado" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "JMetadatos" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_archivos_pkey" PRIMARY KEY ("IdArchivo"),
  CONSTRAINT "devpware_archivos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_archivos_SBucket_SClaveObjeto_key" UNIQUE ("SBucket", "SClaveObjeto"),
  CONSTRAINT "devpware_archivos_SBucket_check" CHECK (btrim("SBucket") <> ''),
  CONSTRAINT "devpware_archivos_SClaveObjeto_check" CHECK (btrim("SClaveObjeto") <> ''),
  CONSTRAINT "devpware_archivos_SNombreOriginal_check" CHECK (btrim("SNombreOriginal") <> ''),
  CONSTRAINT "devpware_archivos_STipoMime_check" CHECK (btrim("STipoMime") <> ''),
  CONSTRAINT "devpware_archivos_SChecksum_check" CHECK (btrim("SChecksum") <> ''),
  CONSTRAINT "devpware_archivos_ITamanoBytes_check" CHECK ("ITamanoBytes" >= 0),
  CONSTRAINT "devpware_archivos_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_archivos_IdUsuarioCarga_fkey" FOREIGN KEY ("IdUsuarioCarga") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_archivos_IdTipoArchivo_fkey" FOREIGN KEY ("IdTipoArchivo") REFERENCES "devpware_tipos_archivos" ("IdTipoArchivo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_archivos_IdOrganizacion_idx" ON "devpware_archivos" ("IdOrganizacion");
CREATE INDEX "devpware_archivos_IdUsuarioCarga_idx" ON "devpware_archivos" ("IdUsuarioCarga");
CREATE INDEX "devpware_archivos_IdTipoArchivo_idx" ON "devpware_archivos" ("IdTipoArchivo");
CREATE INDEX "devpware_archivos_SChecksum_idx" ON "devpware_archivos" ("SChecksum");
CREATE INDEX "devpware_archivos_BActivo_idx" ON "devpware_archivos" ("BActivo");
CREATE INDEX "devpware_archivos_BPrivado_idx" ON "devpware_archivos" ("BPrivado");
CREATE INDEX "devpware_archivos_DFechaCreacion_idx" ON "devpware_archivos" ("DFechaCreacion");
CREATE INDEX "devpware_archivos_DFechaEliminacion_idx" ON "devpware_archivos" ("DFechaEliminacion");

CREATE TABLE "devpware_relaciones_archivos" (
  "IdRelacionArchivo" BIGSERIAL NOT NULL,
  "IdArchivo" BIGINT NOT NULL,
  "IdTipoRelacionArchivo" INTEGER NOT NULL,
  "SEntidad" VARCHAR(160) NOT NULL,
  "SIdentificadorEntidad" VARCHAR(180) NOT NULL,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "BPrincipal" BOOLEAN NOT NULL DEFAULT false,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_relaciones_archivos_pkey" PRIMARY KEY ("IdRelacionArchivo"),
  CONSTRAINT "devpware_rel_archivos_archivo_tipo_entidad_key" UNIQUE ("IdArchivo", "IdTipoRelacionArchivo", "SEntidad", "SIdentificadorEntidad"),
  CONSTRAINT "devpware_relaciones_archivos_SEntidad_check" CHECK (btrim("SEntidad") <> ''),
  CONSTRAINT "devpware_relaciones_archivos_SIdentificadorEntidad_check" CHECK (btrim("SIdentificadorEntidad") <> ''),
  CONSTRAINT "devpware_relaciones_archivos_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_relaciones_archivos_IdArchivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_rel_archivos_tipo_relacion_fkey" FOREIGN KEY ("IdTipoRelacionArchivo") REFERENCES "devpware_tipos_relaciones_archivos" ("IdTipoRelacionArchivo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_relaciones_archivos_IdArchivo_idx" ON "devpware_relaciones_archivos" ("IdArchivo");
CREATE INDEX "devpware_rel_archivos_IdTipoRelacionArchivo_idx" ON "devpware_relaciones_archivos" ("IdTipoRelacionArchivo");
CREATE INDEX "devpware_rel_archivos_SEntidad_SIdentificadorEntidad_idx" ON "devpware_relaciones_archivos" ("SEntidad", "SIdentificadorEntidad");
CREATE INDEX "devpware_relaciones_archivos_BPrincipal_idx" ON "devpware_relaciones_archivos" ("BPrincipal");
CREATE INDEX "devpware_relaciones_archivos_IOrden_idx" ON "devpware_relaciones_archivos" ("IOrden");

CREATE TABLE "devpware_versiones_archivos" (
  "IdVersionArchivo" BIGSERIAL NOT NULL,
  "IdArchivo" BIGINT NOT NULL,
  "INumeroVersion" INTEGER NOT NULL,
  "SBucket" VARCHAR(180) NOT NULL,
  "SClaveObjeto" VARCHAR(1024) NOT NULL,
  "SChecksum" VARCHAR(256) NOT NULL,
  "ITamanoBytes" BIGINT NOT NULL,
  "JMetadatos" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_versiones_archivos_pkey" PRIMARY KEY ("IdVersionArchivo"),
  CONSTRAINT "devpware_versiones_archivos_IdArchivo_INumeroVersion_key" UNIQUE ("IdArchivo", "INumeroVersion"),
  CONSTRAINT "devpware_versiones_archivos_SBucket_SClaveObjeto_key" UNIQUE ("SBucket", "SClaveObjeto"),
  CONSTRAINT "devpware_versiones_archivos_INumeroVersion_check" CHECK ("INumeroVersion" >= 1),
  CONSTRAINT "devpware_versiones_archivos_SBucket_check" CHECK (btrim("SBucket") <> ''),
  CONSTRAINT "devpware_versiones_archivos_SClaveObjeto_check" CHECK (btrim("SClaveObjeto") <> ''),
  CONSTRAINT "devpware_versiones_archivos_SChecksum_check" CHECK (btrim("SChecksum") <> ''),
  CONSTRAINT "devpware_versiones_archivos_ITamanoBytes_check" CHECK ("ITamanoBytes" >= 0),
  CONSTRAINT "devpware_versiones_archivos_IdArchivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_versiones_archivos_IdArchivo_idx" ON "devpware_versiones_archivos" ("IdArchivo");
CREATE INDEX "devpware_versiones_archivos_SChecksum_idx" ON "devpware_versiones_archivos" ("SChecksum");
CREATE INDEX "devpware_versiones_archivos_DFechaCreacion_idx" ON "devpware_versiones_archivos" ("DFechaCreacion");

CREATE TABLE "devpware_cargas_archivos" (
  "IdCargaArchivo" BIGSERIAL NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdOrganizacion" INTEGER NOT NULL,
  "IdArchivo" BIGINT,
  "SIdentificadorCarga" VARCHAR(180) NOT NULL,
  "SClaveObjetoTemporal" VARCHAR(1024),
  "STipoMimeEsperado" VARCHAR(180),
  "ITamanoEsperadoBytes" BIGINT,
  "BCompletada" BOOLEAN NOT NULL DEFAULT false,
  "BCancelada" BOOLEAN NOT NULL DEFAULT false,
  "SMensajeError" TEXT,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  "DFechaExpiracion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_cargas_archivos_pkey" PRIMARY KEY ("IdCargaArchivo"),
  CONSTRAINT "devpware_cargas_archivos_SIdentificadorCarga_key" UNIQUE ("SIdentificadorCarga"),
  CONSTRAINT "devpware_cargas_archivos_SIdentificadorCarga_check" CHECK (btrim("SIdentificadorCarga") <> ''),
  CONSTRAINT "devpware_cargas_archivos_ITamanoEsperadoBytes_check" CHECK ("ITamanoEsperadoBytes" IS NULL OR "ITamanoEsperadoBytes" >= 0),
  CONSTRAINT "devpware_cargas_archivos_estado_check" CHECK (NOT ("BCompletada" = true AND "BCancelada" = true)),
  CONSTRAINT "devpware_cargas_archivos_completada_check" CHECK ("BCompletada" = false OR ("IdArchivo" IS NOT NULL AND "DFechaFinalizacion" IS NOT NULL)),
  CONSTRAINT "devpware_cargas_archivos_cancelada_check" CHECK ("BCancelada" = false OR "DFechaFinalizacion" IS NOT NULL),
  CONSTRAINT "devpware_cargas_archivos_expiracion_check" CHECK ("DFechaExpiracion" IS NULL OR "DFechaExpiracion" > "DFechaInicio"),
  CONSTRAINT "devpware_cargas_archivos_IdUsuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_cargas_archivos_IdOrganizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_cargas_archivos_IdArchivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_cargas_archivos_IdUsuario_idx" ON "devpware_cargas_archivos" ("IdUsuario");
CREATE INDEX "devpware_cargas_archivos_IdOrganizacion_idx" ON "devpware_cargas_archivos" ("IdOrganizacion");
CREATE INDEX "devpware_cargas_archivos_IdArchivo_idx" ON "devpware_cargas_archivos" ("IdArchivo");
CREATE INDEX "devpware_cargas_archivos_BCompletada_idx" ON "devpware_cargas_archivos" ("BCompletada");
CREATE INDEX "devpware_cargas_archivos_BCancelada_idx" ON "devpware_cargas_archivos" ("BCancelada");
CREATE INDEX "devpware_cargas_archivos_DFechaInicio_idx" ON "devpware_cargas_archivos" ("DFechaInicio");
CREATE INDEX "devpware_cargas_archivos_DFechaExpiracion_idx" ON "devpware_cargas_archivos" ("DFechaExpiracion");

INSERT INTO "devpware_tipos_relaciones_archivos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('ORGANIZACION', 'Organizacion', 'Archivo relacionado con una organizacion.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('USUARIO', 'Usuario', 'Archivo relacionado con un usuario.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('AVALUO', 'Avaluo', 'Archivo relacionado con un avaluo.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VERSION_AVALUO', 'Version de avaluo', 'Archivo relacionado con una version de avaluo.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('NODO_DOCUMENTO', 'Nodo de documento', 'Archivo relacionado con un nodo dinamico de documento.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROPIEDAD', 'Propiedad', 'Archivo relacionado con una propiedad.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PUBLICACION', 'Publicacion', 'Archivo relacionado con una publicacion.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COMPARABLE', 'Comparable', 'Archivo relacionado con un comparable.', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MAPA', 'Mapa', 'Archivo relacionado con un mapa.', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('NORMA', 'Norma', 'Archivo relacionado con una norma.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('IMPORTACION', 'Importacion', 'Archivo relacionado con un proceso de importacion.', true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRACCION', 'Extraccion', 'Archivo relacionado con un proceso de extraccion.', true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OTRO', 'Otro', 'Otro tipo de relacion de archivo.', true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
