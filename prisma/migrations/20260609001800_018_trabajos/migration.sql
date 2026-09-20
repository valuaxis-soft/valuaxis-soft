-- Migracion 018_trabajos

CREATE TABLE "devpware_estados_trabajos" (
  "IdEstadoTrabajo" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BEsPendiente" BOOLEAN NOT NULL DEFAULT false,
  "BEsEjecucion" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BEsExitoso" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteReintento" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_estados_trabajos_pkey" PRIMARY KEY ("IdEstadoTrabajo"),
  CONSTRAINT "devpware_estados_trabajos_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_trabajos_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_estados_trabajos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_estados_trabajos_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_estados_trabajos_flags_check" CHECK (NOT ("BEsPendiente" = true AND "BEsEjecucion" = true) AND ("BEsExitoso" = false OR "BEsFinal" = true))
);
CREATE INDEX "devpware_estados_trabajos_BEsPendiente_idx" ON "devpware_estados_trabajos" ("BEsPendiente");
CREATE INDEX "devpware_estados_trabajos_BEsEjecucion_idx" ON "devpware_estados_trabajos" ("BEsEjecucion");
CREATE INDEX "devpware_estados_trabajos_BEsFinal_idx" ON "devpware_estados_trabajos" ("BEsFinal");
CREATE INDEX "devpware_estados_trabajos_BEsExitoso_idx" ON "devpware_estados_trabajos" ("BEsExitoso");
CREATE INDEX "devpware_estados_trabajos_BPermiteReintento_idx" ON "devpware_estados_trabajos" ("BPermiteReintento");
CREATE INDEX "devpware_estados_trabajos_BActivo_idx" ON "devpware_estados_trabajos" ("BActivo");
CREATE INDEX "devpware_estados_trabajos_IOrden_idx" ON "devpware_estados_trabajos" ("IOrden");

CREATE TABLE "devpware_tipos_trabajos" (
  "IdTipoTrabajo" SERIAL NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "SColaPredeterminada" VARCHAR(120) NOT NULL,
  "IMaximoIntentosPredeterminado" INTEGER NOT NULL DEFAULT 3,
  "ISegundosEsperaReintento" INTEGER NOT NULL DEFAULT 60,
  "ISegundosTimeout" INTEGER NOT NULL DEFAULT 900,
  "BRequiereOrganizacion" BOOLEAN NOT NULL DEFAULT true,
  "BRequiereUsuario" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_trabajos_pkey" PRIMARY KEY ("IdTipoTrabajo"),
  CONSTRAINT "devpware_tipos_trabajos_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_trabajos_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_trabajos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_trabajos_SCola_check" CHECK (btrim("SColaPredeterminada") <> ''),
  CONSTRAINT "devpware_tipos_trabajos_intentos_check" CHECK ("IMaximoIntentosPredeterminado" BETWEEN 1 AND 100),
  CONSTRAINT "devpware_tipos_trabajos_reintento_check" CHECK ("ISegundosEsperaReintento" >= 0),
  CONSTRAINT "devpware_tipos_trabajos_timeout_check" CHECK ("ISegundosTimeout" BETWEEN 1 AND 86400)
);
CREATE INDEX "devpware_tipos_trabajos_SCola_idx" ON "devpware_tipos_trabajos" ("SColaPredeterminada");
CREATE INDEX "devpware_tipos_trabajos_BActivo_idx" ON "devpware_tipos_trabajos" ("BActivo");

CREATE TABLE "devpware_trabajos" (
  "IdTrabajo" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdTipoTrabajo" INTEGER NOT NULL,
  "IdEstadoTrabajo" INTEGER NOT NULL,
  "IdOrganizacion" INTEGER,
  "IdUsuarioSolicitud" INTEGER,
  "IdAvaluo" INTEGER,
  "IdVersionAvaluo" INTEGER,
  "IdArchivo" BIGINT,
  "SCola" VARCHAR(120) NOT NULL,
  "SClaveIdempotencia" VARCHAR(255),
  "SPrioridad" INTEGER NOT NULL DEFAULT 100,
  "IIntentosRealizados" INTEGER NOT NULL DEFAULT 0,
  "IMaximoIntentos" INTEGER NOT NULL DEFAULT 3,
  "ISegundosTimeout" INTEGER NOT NULL DEFAULT 900,
  "IProgreso" INTEGER NOT NULL DEFAULT 0,
  "SPasoActual" VARCHAR(220),
  "JPayload" JSONB NOT NULL,
  "JResultado" JSONB,
  "SMensajeResultado" TEXT,
  "SWorkerBloqueo" VARCHAR(180),
  "STokenBloqueoHash" VARCHAR(255),
  "DFechaProgramada" TIMESTAMPTZ(3),
  "DFechaDisponible" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaInicio" TIMESTAMPTZ(3),
  "DFechaUltimoLatido" TIMESTAMPTZ(3),
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  "DFechaCancelacion" TIMESTAMPTZ(3),
  "DFechaExpiracion" TIMESTAMPTZ(3),
  "DFechaBloqueo" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_trabajos_pkey" PRIMARY KEY ("IdTrabajo"),
  CONSTRAINT "devpware_trabajos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_trabajos_SCola_check" CHECK (btrim("SCola") <> ''),
  CONSTRAINT "devpware_trabajos_prioridad_check" CHECK ("SPrioridad" BETWEEN 0 AND 1000),
  CONSTRAINT "devpware_trabajos_intentos_check" CHECK ("IIntentosRealizados" >= 0 AND "IMaximoIntentos" BETWEEN 1 AND 100 AND "IIntentosRealizados" <= "IMaximoIntentos"),
  CONSTRAINT "devpware_trabajos_timeout_check" CHECK ("ISegundosTimeout" BETWEEN 1 AND 86400),
  CONSTRAINT "devpware_trabajos_progreso_check" CHECK ("IProgreso" BETWEEN 0 AND 100),
  CONSTRAINT "devpware_trabajos_fechas_check" CHECK (
    "DFechaDisponible" >= "DFechaCreacion" AND
    ("DFechaInicio" IS NULL OR "DFechaInicio" >= "DFechaCreacion") AND
    ("DFechaFinalizacion" IS NULL OR "DFechaFinalizacion" >= "DFechaCreacion") AND
    ("DFechaInicio" IS NULL OR "DFechaFinalizacion" IS NULL OR "DFechaFinalizacion" >= "DFechaInicio") AND
    ("DFechaCancelacion" IS NULL OR "DFechaCancelacion" >= "DFechaCreacion") AND
    ("DFechaExpiracion" IS NULL OR "DFechaExpiracion" > "DFechaCreacion")
  ),
  CONSTRAINT "devpware_trabajos_bloqueo_check" CHECK ("SWorkerBloqueo" IS NULL OR ("STokenBloqueoHash" IS NOT NULL AND "DFechaBloqueo" IS NOT NULL)),
  CONSTRAINT "devpware_trabajos_payload_check" CHECK (jsonb_typeof("JPayload") <> 'null'),
  CONSTRAINT "devpware_trabajos_tipo_fkey" FOREIGN KEY ("IdTipoTrabajo") REFERENCES "devpware_tipos_trabajos" ("IdTipoTrabajo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_estado_fkey" FOREIGN KEY ("IdEstadoTrabajo") REFERENCES "devpware_estados_trabajos" ("IdEstadoTrabajo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_usuario_fkey" FOREIGN KEY ("IdUsuarioSolicitud") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_trabajos_archivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "devpware_trabajos_idempotencia_activa_key" ON "devpware_trabajos" ("IdOrganizacion", "SClaveIdempotencia") WHERE "SClaveIdempotencia" IS NOT NULL AND "DFechaFinalizacion" IS NULL AND "DFechaCancelacion" IS NULL;
CREATE INDEX "devpware_trabajos_IdTipoTrabajo_idx" ON "devpware_trabajos" ("IdTipoTrabajo");
CREATE INDEX "devpware_trabajos_IdEstadoTrabajo_idx" ON "devpware_trabajos" ("IdEstadoTrabajo");
CREATE INDEX "devpware_trabajos_IdOrganizacion_idx" ON "devpware_trabajos" ("IdOrganizacion");
CREATE INDEX "devpware_trabajos_IdUsuarioSolicitud_idx" ON "devpware_trabajos" ("IdUsuarioSolicitud");
CREATE INDEX "devpware_trabajos_IdAvaluo_idx" ON "devpware_trabajos" ("IdAvaluo");
CREATE INDEX "devpware_trabajos_IdVersionAvaluo_idx" ON "devpware_trabajos" ("IdVersionAvaluo");
CREATE INDEX "devpware_trabajos_IdArchivo_idx" ON "devpware_trabajos" ("IdArchivo");
CREATE INDEX "devpware_trabajos_SCola_idx" ON "devpware_trabajos" ("SCola");
CREATE INDEX "devpware_trabajos_SPrioridad_idx" ON "devpware_trabajos" ("SPrioridad");
CREATE INDEX "devpware_trabajos_DFechaProgramada_idx" ON "devpware_trabajos" ("DFechaProgramada");
CREATE INDEX "devpware_trabajos_DFechaDisponible_idx" ON "devpware_trabajos" ("DFechaDisponible");
CREATE INDEX "devpware_trabajos_DFechaInicio_idx" ON "devpware_trabajos" ("DFechaInicio");
CREATE INDEX "devpware_trabajos_DFechaUltimoLatido_idx" ON "devpware_trabajos" ("DFechaUltimoLatido");
CREATE INDEX "devpware_trabajos_DFechaExpiracion_idx" ON "devpware_trabajos" ("DFechaExpiracion");
CREATE INDEX "devpware_trabajos_DFechaCreacion_idx" ON "devpware_trabajos" ("DFechaCreacion");
CREATE INDEX "devpware_trabajos_toma_idx" ON "devpware_trabajos" ("SCola", "IdEstadoTrabajo", "DFechaDisponible", "SPrioridad", "DFechaCreacion");

CREATE TABLE "devpware_intentos_trabajos" (
  "IdIntentoTrabajo" BIGSERIAL NOT NULL,
  "IdTrabajo" BIGINT NOT NULL,
  "INumeroIntento" INTEGER NOT NULL,
  "SWorker" VARCHAR(180) NOT NULL,
  "STokenBloqueoHash" VARCHAR(255),
  "JPayloadEjecucion" JSONB,
  "JResultado" JSONB,
  "BExitoso" BOOLEAN NOT NULL DEFAULT false,
  "BTimeout" BOOLEAN NOT NULL DEFAULT false,
  "BCancelado" BOOLEAN NOT NULL DEFAULT false,
  "DFechaInicio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaUltimoLatido" TIMESTAMPTZ(3),
  "DFechaFinalizacion" TIMESTAMPTZ(3),
  "IDuracionMilisegundos" BIGINT,
  CONSTRAINT "devpware_intentos_trabajos_pkey" PRIMARY KEY ("IdIntentoTrabajo"),
  CONSTRAINT "devpware_intentos_trabajos_trabajo_intento_key" UNIQUE ("IdTrabajo", "INumeroIntento"),
  CONSTRAINT "devpware_intentos_trabajos_numero_check" CHECK ("INumeroIntento" >= 1),
  CONSTRAINT "devpware_intentos_trabajos_worker_check" CHECK (btrim("SWorker") <> ''),
  CONSTRAINT "devpware_intentos_trabajos_duracion_check" CHECK ("IDuracionMilisegundos" IS NULL OR "IDuracionMilisegundos" >= 0),
  CONSTRAINT "devpware_intentos_trabajos_flags_check" CHECK (((CASE WHEN "BExitoso" THEN 1 ELSE 0 END) + (CASE WHEN "BTimeout" THEN 1 ELSE 0 END) + (CASE WHEN "BCancelado" THEN 1 ELSE 0 END)) <= 1),
  CONSTRAINT "devpware_intentos_trabajos_final_check" CHECK ((NOT ("BExitoso" OR "BTimeout" OR "BCancelado") OR "DFechaFinalizacion" IS NOT NULL) AND ("DFechaFinalizacion" IS NULL OR "DFechaFinalizacion" >= "DFechaInicio")),
  CONSTRAINT "devpware_intentos_trabajos_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_intentos_trabajos_IdTrabajo_idx" ON "devpware_intentos_trabajos" ("IdTrabajo");
CREATE INDEX "devpware_intentos_trabajos_SWorker_idx" ON "devpware_intentos_trabajos" ("SWorker");
CREATE INDEX "devpware_intentos_trabajos_BExitoso_idx" ON "devpware_intentos_trabajos" ("BExitoso");
CREATE INDEX "devpware_intentos_trabajos_BTimeout_idx" ON "devpware_intentos_trabajos" ("BTimeout");
CREATE INDEX "devpware_intentos_trabajos_BCancelado_idx" ON "devpware_intentos_trabajos" ("BCancelado");
CREATE INDEX "devpware_intentos_trabajos_DFechaInicio_idx" ON "devpware_intentos_trabajos" ("DFechaInicio");
CREATE INDEX "devpware_intentos_trabajos_DFechaFinalizacion_idx" ON "devpware_intentos_trabajos" ("DFechaFinalizacion");

CREATE TABLE "devpware_errores_trabajos" (
  "IdErrorTrabajo" BIGSERIAL NOT NULL,
  "IdTrabajo" BIGINT NOT NULL,
  "IdIntentoTrabajo" BIGINT,
  "SCodigoError" VARCHAR(180),
  "STipoError" VARCHAR(220),
  "SMensaje" TEXT NOT NULL,
  "SStackSanitizado" TEXT,
  "BReintentable" BOOLEAN NOT NULL DEFAULT false,
  "JContexto" JSONB,
  "DFechaError" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_errores_trabajos_pkey" PRIMARY KEY ("IdErrorTrabajo"),
  CONSTRAINT "devpware_errores_trabajos_mensaje_check" CHECK (btrim("SMensaje") <> ''),
  CONSTRAINT "devpware_errores_trabajos_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_errores_trabajos_intento_fkey" FOREIGN KEY ("IdIntentoTrabajo") REFERENCES "devpware_intentos_trabajos" ("IdIntentoTrabajo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_errores_trabajos_IdTrabajo_idx" ON "devpware_errores_trabajos" ("IdTrabajo");
CREATE INDEX "devpware_errores_trabajos_IdIntento_idx" ON "devpware_errores_trabajos" ("IdIntentoTrabajo");
CREATE INDEX "devpware_errores_trabajos_SCodigo_idx" ON "devpware_errores_trabajos" ("SCodigoError");
CREATE INDEX "devpware_errores_trabajos_STipo_idx" ON "devpware_errores_trabajos" ("STipoError");
CREATE INDEX "devpware_errores_trabajos_BReintentable_idx" ON "devpware_errores_trabajos" ("BReintentable");
CREATE INDEX "devpware_errores_trabajos_DFechaError_idx" ON "devpware_errores_trabajos" ("DFechaError");

CREATE TABLE "devpware_eventos_trabajos" (
  "IdEventoTrabajo" BIGSERIAL NOT NULL,
  "IdTrabajo" BIGINT NOT NULL,
  "IdEstadoTrabajoAnterior" INTEGER,
  "IdEstadoTrabajoNuevo" INTEGER NOT NULL,
  "IdUsuario" INTEGER,
  "SWorker" VARCHAR(180),
  "SMotivo" VARCHAR(1000),
  "JMetadatos" JSONB,
  "DFechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_eventos_trabajos_pkey" PRIMARY KEY ("IdEventoTrabajo"),
  CONSTRAINT "devpware_eventos_trabajos_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_trabajos_estado_ant_fkey" FOREIGN KEY ("IdEstadoTrabajoAnterior") REFERENCES "devpware_estados_trabajos" ("IdEstadoTrabajo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_trabajos_estado_nuevo_fkey" FOREIGN KEY ("IdEstadoTrabajoNuevo") REFERENCES "devpware_estados_trabajos" ("IdEstadoTrabajo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_trabajos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_eventos_trabajos_IdTrabajo_idx" ON "devpware_eventos_trabajos" ("IdTrabajo");
CREATE INDEX "devpware_eventos_trabajos_EstadoAnterior_idx" ON "devpware_eventos_trabajos" ("IdEstadoTrabajoAnterior");
CREATE INDEX "devpware_eventos_trabajos_EstadoNuevo_idx" ON "devpware_eventos_trabajos" ("IdEstadoTrabajoNuevo");
CREATE INDEX "devpware_eventos_trabajos_IdUsuario_idx" ON "devpware_eventos_trabajos" ("IdUsuario");
CREATE INDEX "devpware_eventos_trabajos_SWorker_idx" ON "devpware_eventos_trabajos" ("SWorker");
CREATE INDEX "devpware_eventos_trabajos_DFechaEvento_idx" ON "devpware_eventos_trabajos" ("DFechaEvento");

CREATE TABLE "devpware_dependencias_trabajos" (
  "IdDependenciaTrabajo" BIGSERIAL NOT NULL,
  "IdTrabajo" BIGINT NOT NULL,
  "IdTrabajoRequisito" BIGINT NOT NULL,
  "BObligatoria" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_dependencias_trabajos_pkey" PRIMARY KEY ("IdDependenciaTrabajo"),
  CONSTRAINT "devpware_dependencias_trabajos_trabajo_req_key" UNIQUE ("IdTrabajo", "IdTrabajoRequisito"),
  CONSTRAINT "devpware_dependencias_trabajos_distintos_check" CHECK ("IdTrabajo" <> "IdTrabajoRequisito"),
  CONSTRAINT "devpware_dependencias_trabajos_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_dependencias_trabajos_requisito_fkey" FOREIGN KEY ("IdTrabajoRequisito") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_dependencias_trabajos_IdTrabajo_idx" ON "devpware_dependencias_trabajos" ("IdTrabajo");
CREATE INDEX "devpware_dependencias_trabajos_IdRequisito_idx" ON "devpware_dependencias_trabajos" ("IdTrabajoRequisito");
CREATE INDEX "devpware_dependencias_trabajos_BObligatoria_idx" ON "devpware_dependencias_trabajos" ("BObligatoria");

INSERT INTO "devpware_estados_trabajos" ("SClave", "SNombre", "SDescripcion", "BEsPendiente", "BEsEjecucion", "BEsFinal", "BEsExitoso", "BPermiteReintento", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('PENDIENTE', 'Pendiente', 'Trabajo pendiente.', true, false, false, false, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROGRAMADO', 'Programado', 'Trabajo programado.', true, false, false, false, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EN_COLA', 'En cola', 'Trabajo en cola.', true, false, false, false, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EJECUTANDO', 'Ejecutando', 'Trabajo en ejecucion.', false, true, false, false, false, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('REINTENTO_PENDIENTE', 'Reintento pendiente', 'Trabajo pendiente de reintento.', true, false, false, false, true, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COMPLETADO', 'Completado', 'Trabajo completado correctamente.', false, false, true, true, false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FALLIDO', 'Fallido', 'Trabajo fallido.', false, false, true, false, true, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CANCELADO', 'Cancelado', 'Trabajo cancelado.', false, false, true, false, false, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXPIRADO', 'Expirado', 'Trabajo expirado.', false, false, true, false, false, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BEsPendiente" = EXCLUDED."BEsPendiente",
  "BEsEjecucion" = EXCLUDED."BEsEjecucion",
  "BEsFinal" = EXCLUDED."BEsFinal",
  "BEsExitoso" = EXCLUDED."BEsExitoso",
  "BPermiteReintento" = EXCLUDED."BPermiteReintento",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_trabajos" ("SClave", "SNombre", "SDescripcion", "SColaPredeterminada", "IMaximoIntentosPredeterminado", "ISegundosEsperaReintento", "ISegundosTimeout", "BRequiereOrganizacion", "BRequiereUsuario", "BActivo", "DFechaCreacion", "DFechaModificacion") VALUES
  ('GENERAR_PDF_AVALUO', 'Generar PDF de avaluo', 'Genera documento PDF del avaluo.', 'documentos', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXPORTAR_EXCEL', 'Exportar Excel', 'Genera exportacion en Excel.', 'documentos', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GENERAR_CAPTURA_MAPA', 'Generar captura de mapa', 'Genera captura cartografica.', 'mapas', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROCESAR_ARCHIVO', 'Procesar archivo', 'Procesa metadatos de archivo.', 'archivos', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VERIFICAR_ARCHIVO_S3', 'Verificar archivo S3', 'Verifica existencia y metadatos de objeto externo.', 'archivos', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GEOCODIFICAR_DIRECCION', 'Geocodificar direccion', 'Obtiene coordenadas para una direccion.', 'mapas', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BUSCAR_COMPARABLES', 'Buscar comparables', 'Busca candidatos comparables.', 'comparables', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GENERAR_SNAPSHOT', 'Generar snapshot', 'Genera snapshot inmutable de version.', 'sistema', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ENVIAR_NOTIFICACION', 'Enviar notificacion', 'Envia notificacion.', 'sistema', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('LIMPIAR_CARGAS_EXPIRADAS', 'Limpiar cargas expiradas', 'Limpia cargas expiradas.', 'sistema', 3, 60, 900, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('IMPORTAR_DATOS', 'Importar datos', 'Importa datos externos.', 'importaciones', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DATOS_IA', 'Extraer datos con IA', 'Extrae datos mediante servicio de IA.', 'ia', 3, 60, 900, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "SColaPredeterminada" = EXCLUDED."SColaPredeterminada",
  "IMaximoIntentosPredeterminado" = EXCLUDED."IMaximoIntentosPredeterminado",
  "ISegundosEsperaReintento" = EXCLUDED."ISegundosEsperaReintento",
  "ISegundosTimeout" = EXCLUDED."ISegundosTimeout",
  "BRequiereOrganizacion" = EXCLUDED."BRequiereOrganizacion",
  "BRequiereUsuario" = EXCLUDED."BRequiereUsuario",
  "BActivo" = EXCLUDED."BActivo",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
