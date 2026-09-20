-- Migracion 017_snapshots_auditoria

CREATE TABLE "devpware_tipos_eventos_auditoria" (
  "IdTipoEventoAuditoria" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_eventos_auditoria_pkey" PRIMARY KEY ("IdTipoEventoAuditoria"),
  CONSTRAINT "devpware_tipos_eventos_auditoria_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_eventos_auditoria_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_eventos_auditoria_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_eventos_auditoria_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_eventos_auditoria_BActivo_idx" ON "devpware_tipos_eventos_auditoria" ("BActivo");
CREATE INDEX "devpware_tipos_eventos_auditoria_IOrden_idx" ON "devpware_tipos_eventos_auditoria" ("IOrden");

CREATE TABLE "devpware_snapshots_versiones_avaluos" (
  "IdSnapshotVersionAvaluo" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuarioGeneracion" INTEGER NOT NULL,
  "IdArchivoPDF" BIGINT,
  "INumeroVersion" INTEGER NOT NULL,
  "SHashContenido" VARCHAR(128) NOT NULL,
  "SAlgoritmoHash" VARCHAR(40) NOT NULL DEFAULT 'SHA-256',
  "JDatosAvaluo" JSONB NOT NULL,
  "JDatosPropiedad" JSONB,
  "JDatosDocumento" JSONB NOT NULL,
  "JDatosTecnicos" JSONB,
  "JDatosEnfoques" JSONB,
  "JDatosComparables" JSONB,
  "JDatosArchivos" JSONB,
  "JMetadatosGeneracion" JSONB,
  "DFechaGeneracion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_snapshots_versiones_avaluos_pkey" PRIMARY KEY ("IdSnapshotVersionAvaluo"),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_UIdentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_IdVersion_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_SHash_key" UNIQUE ("SHashContenido"),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_numero_check" CHECK ("INumeroVersion" >= 1),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_hash_check" CHECK (btrim("SHashContenido") <> ''),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_algoritmo_check" CHECK (btrim("SAlgoritmoHash") <> ''),
  CONSTRAINT "devpware_snapshots_versiones_avaluos_json_check" CHECK (
    jsonb_typeof("JDatosAvaluo") <> 'null' AND
    jsonb_typeof("JDatosDocumento") <> 'null'
  ),
  CONSTRAINT "devpware_snapshots_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_snapshots_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_snapshots_usuario_fkey" FOREIGN KEY ("IdUsuarioGeneracion") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_snapshots_archivo_pdf_fkey" FOREIGN KEY ("IdArchivoPDF") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_snapshots_versiones_avaluos_IdAvaluo_idx" ON "devpware_snapshots_versiones_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_snapshots_versiones_avaluos_IdVersion_idx" ON "devpware_snapshots_versiones_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_snapshots_versiones_avaluos_IdUsuario_idx" ON "devpware_snapshots_versiones_avaluos" ("IdUsuarioGeneracion");
CREATE INDEX "devpware_snapshots_versiones_avaluos_IdArchivoPDF_idx" ON "devpware_snapshots_versiones_avaluos" ("IdArchivoPDF");
CREATE INDEX "devpware_snapshots_versiones_avaluos_INumero_idx" ON "devpware_snapshots_versiones_avaluos" ("INumeroVersion");
CREATE INDEX "devpware_snapshots_versiones_avaluos_DFecha_idx" ON "devpware_snapshots_versiones_avaluos" ("DFechaGeneracion");

CREATE TABLE "devpware_auditorias" (
  "IdAuditoria" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER,
  "IdUsuario" INTEGER,
  "IdTipoEventoAuditoria" INTEGER NOT NULL,
  "SEntidad" VARCHAR(160) NOT NULL,
  "SIdentificadorEntidad" VARCHAR(180) NOT NULL,
  "SAccion" VARCHAR(160) NOT NULL,
  "SResultado" VARCHAR(120),
  "SDireccionIP" VARCHAR(64),
  "SAgenteUsuario" TEXT,
  "SIdCorrelacion" VARCHAR(180),
  "JDatosAnteriores" JSONB,
  "JDatosNuevos" JSONB,
  "JMetadatos" JSONB,
  "DFechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_auditorias_pkey" PRIMARY KEY ("IdAuditoria"),
  CONSTRAINT "devpware_auditorias_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_auditorias_entidad_check" CHECK (btrim("SEntidad") <> ''),
  CONSTRAINT "devpware_auditorias_identificador_check" CHECK (btrim("SIdentificadorEntidad") <> ''),
  CONSTRAINT "devpware_auditorias_accion_check" CHECK (btrim("SAccion") <> ''),
  CONSTRAINT "devpware_auditorias_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_auditorias_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_auditorias_tipo_evento_fkey" FOREIGN KEY ("IdTipoEventoAuditoria") REFERENCES "devpware_tipos_eventos_auditoria" ("IdTipoEventoAuditoria") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_auditorias_IdOrganizacion_idx" ON "devpware_auditorias" ("IdOrganizacion");
CREATE INDEX "devpware_auditorias_IdUsuario_idx" ON "devpware_auditorias" ("IdUsuario");
CREATE INDEX "devpware_auditorias_IdTipoEvento_idx" ON "devpware_auditorias" ("IdTipoEventoAuditoria");
CREATE INDEX "devpware_auditorias_SEntidad_idx" ON "devpware_auditorias" ("SEntidad");
CREATE INDEX "devpware_auditorias_SIdentificador_idx" ON "devpware_auditorias" ("SIdentificadorEntidad");
CREATE INDEX "devpware_auditorias_SAccion_idx" ON "devpware_auditorias" ("SAccion");
CREATE INDEX "devpware_auditorias_SResultado_idx" ON "devpware_auditorias" ("SResultado");
CREATE INDEX "devpware_auditorias_SIdCorrelacion_idx" ON "devpware_auditorias" ("SIdCorrelacion");
CREATE INDEX "devpware_auditorias_DFechaEvento_idx" ON "devpware_auditorias" ("DFechaEvento");
CREATE INDEX "devpware_auditorias_entidad_ident_fecha_idx" ON "devpware_auditorias" ("SEntidad", "SIdentificadorEntidad", "DFechaEvento");

CREATE TABLE "devpware_cambios_auditorias" (
  "IdCambioAuditoria" BIGSERIAL NOT NULL,
  "IdAuditoria" BIGINT NOT NULL,
  "SCampo" VARCHAR(180) NOT NULL,
  "SValorAnterior" TEXT,
  "SValorNuevo" TEXT,
  "JValorAnterior" JSONB,
  "JValorNuevo" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_cambios_auditorias_pkey" PRIMARY KEY ("IdCambioAuditoria"),
  CONSTRAINT "devpware_cambios_auditorias_SCampo_check" CHECK (btrim("SCampo") <> ''),
  CONSTRAINT "devpware_cambios_auditorias_diferencia_check" CHECK (
    "SValorAnterior" IS DISTINCT FROM "SValorNuevo" OR
    "JValorAnterior" IS DISTINCT FROM "JValorNuevo"
  ),
  CONSTRAINT "devpware_cambios_auditorias_auditoria_fkey" FOREIGN KEY ("IdAuditoria") REFERENCES "devpware_auditorias" ("IdAuditoria") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_cambios_auditorias_IdAuditoria_idx" ON "devpware_cambios_auditorias" ("IdAuditoria");
CREATE INDEX "devpware_cambios_auditorias_SCampo_idx" ON "devpware_cambios_auditorias" ("SCampo");

CREATE TABLE "devpware_exportaciones_avaluos" (
  "IdExportacionAvaluo" BIGSERIAL NOT NULL,
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdArchivo" BIGINT,
  "STipoExportacion" VARCHAR(80) NOT NULL,
  "SFormato" VARCHAR(40) NOT NULL,
  "SEstado" VARCHAR(80) NOT NULL,
  "SHashContenido" VARCHAR(128),
  "JParametros" JSONB,
  "SMensajeError" TEXT,
  "DFechaSolicitud" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaInicio" TIMESTAMPTZ(3),
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  "DFechaExpiracion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_exportaciones_avaluos_pkey" PRIMARY KEY ("IdExportacionAvaluo"),
  CONSTRAINT "devpware_exportaciones_avaluos_tipo_check" CHECK (btrim("STipoExportacion") <> ''),
  CONSTRAINT "devpware_exportaciones_avaluos_formato_check" CHECK (btrim("SFormato") <> ''),
  CONSTRAINT "devpware_exportaciones_avaluos_estado_check" CHECK (btrim("SEstado") <> ''),
  CONSTRAINT "devpware_exportaciones_avaluos_fechas_check" CHECK (
    ("DFechaInicio" IS NULL OR "DFechaInicio" >= "DFechaSolicitud") AND
    ("DFechaFinalizacion" IS NULL OR "DFechaFinalizacion" >= "DFechaSolicitud") AND
    ("DFechaInicio" IS NULL OR "DFechaFinalizacion" IS NULL OR "DFechaFinalizacion" >= "DFechaInicio") AND
    ("IdArchivo" IS NULL OR "DFechaFinalizacion" IS NOT NULL) AND
    ("DFechaExpiracion" IS NULL OR "DFechaExpiracion" > "DFechaSolicitud")
  ),
  CONSTRAINT "devpware_exportaciones_avaluos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_exportaciones_avaluos_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_exportaciones_avaluos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_exportaciones_avaluos_archivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_exportaciones_avaluos_IdAvaluo_idx" ON "devpware_exportaciones_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_exportaciones_avaluos_IdVersion_idx" ON "devpware_exportaciones_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_exportaciones_avaluos_IdUsuario_idx" ON "devpware_exportaciones_avaluos" ("IdUsuario");
CREATE INDEX "devpware_exportaciones_avaluos_IdArchivo_idx" ON "devpware_exportaciones_avaluos" ("IdArchivo");
CREATE INDEX "devpware_exportaciones_avaluos_STipo_idx" ON "devpware_exportaciones_avaluos" ("STipoExportacion");
CREATE INDEX "devpware_exportaciones_avaluos_SFormato_idx" ON "devpware_exportaciones_avaluos" ("SFormato");
CREATE INDEX "devpware_exportaciones_avaluos_SEstado_idx" ON "devpware_exportaciones_avaluos" ("SEstado");
CREATE INDEX "devpware_exportaciones_avaluos_DSolicitud_idx" ON "devpware_exportaciones_avaluos" ("DFechaSolicitud");
CREATE INDEX "devpware_exportaciones_avaluos_DFinalizacion_idx" ON "devpware_exportaciones_avaluos" ("DFechaFinalizacion");

CREATE TABLE "devpware_bloqueos_versiones_avaluos" (
  "IdBloqueoVersionAvaluo" BIGSERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "STokenBloqueoHash" VARCHAR(255) NOT NULL,
  "SMotivo" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExpiracion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaLiberacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_pkey" PRIMARY KEY ("IdBloqueoVersionAvaluo"),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_token_hash_key" UNIQUE ("STokenBloqueoHash"),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_token_hash_check" CHECK (btrim("STokenBloqueoHash") <> ''),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_expiracion_check" CHECK ("DFechaExpiracion" > "DFechaCreacion"),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_activo_check" CHECK ("BActivo" = true OR "DFechaLiberacion" IS NOT NULL),
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_bloqueos_versiones_avaluos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devpware_bloqueos_versiones_avaluos_activo_key" ON "devpware_bloqueos_versiones_avaluos" ("IdVersionAvaluo") WHERE "BActivo" = true;
CREATE INDEX "devpware_bloqueos_versiones_avaluos_IdVersion_idx" ON "devpware_bloqueos_versiones_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_bloqueos_versiones_avaluos_IdUsuario_idx" ON "devpware_bloqueos_versiones_avaluos" ("IdUsuario");
CREATE INDEX "devpware_bloqueos_versiones_avaluos_BActivo_idx" ON "devpware_bloqueos_versiones_avaluos" ("BActivo");
CREATE INDEX "devpware_bloqueos_versiones_avaluos_DExpiracion_idx" ON "devpware_bloqueos_versiones_avaluos" ("DFechaExpiracion");

CREATE OR REPLACE FUNCTION "devpware_fn_impedir_modificacion_inmutable"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es inmutable para UPDATE o DELETE desde operaciones normales.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "devpware_snapshots_versiones_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_snapshots_versiones_avaluos"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

CREATE TRIGGER "devpware_auditorias_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_auditorias"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

CREATE TRIGGER "devpware_cambios_auditorias_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_cambios_auditorias"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

INSERT INTO "devpware_tipos_eventos_auditoria" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('CREACION', 'Creacion', 'Creacion de registro.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MODIFICACION', 'Modificacion', 'Modificacion de registro.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ELIMINACION_LOGICA', 'Eliminacion logica', 'Eliminacion logica de registro.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RESTAURACION', 'Restauracion', 'Restauracion de registro.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CAMBIO_ESTADO', 'Cambio de estado', 'Cambio de estado de una entidad.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FINALIZACION', 'Finalizacion', 'Finalizacion de una version o proceso.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('REAPERTURA', 'Reapertura', 'Reapertura de una version o proceso.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXPORTACION', 'Exportacion', 'Exportacion de informacion o documento.', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INICIO_SESION', 'Inicio de sesion', 'Inicio de sesion de usuario.', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CIERRE_SESION', 'Cierre de sesion', 'Cierre de sesion de usuario.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ACCESO_DENEGADO', 'Acceso denegado', 'Intento de acceso denegado.', true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CARGA_ARCHIVO', 'Carga de archivo', 'Carga de archivo.', true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DESCARGA_ARCHIVO', 'Descarga de archivo', 'Descarga de archivo.', true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SELECCION_COMPARABLE', 'Seleccion de comparable', 'Seleccion de comparable para un avaluo.', true, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EJECUCION_CALCULO', 'Ejecucion de calculo', 'Ejecucion de calculo valuatorio.', true, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SOBRESCRITURA_RESULTADO', 'Sobrescritura de resultado', 'Sobrescritura manual de resultado calculado.', true, 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CONFIRMACION_UBICACION', 'Confirmacion de ubicacion', 'Confirmacion humana de ubicacion.', true, 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CORRECCION_UBICACION', 'Correccion de ubicacion', 'Correccion de ubicacion de propiedad.', true, 18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
