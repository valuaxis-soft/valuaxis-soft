-- Migration 020_extraccion_ia

-- 1. EstadoExtraccionIA
CREATE TABLE "devpware_estados_extracciones_ia" (
  "IdEstadoExtraccionIA" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BEsInicial" BOOLEAN NOT NULL DEFAULT false,
  "BEsProceso" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BEsExitoso" BOOLEAN NOT NULL DEFAULT false,
  "BRequiereRevision" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_estados_extracciones_ia_pkey" PRIMARY KEY ("IdEstadoExtraccionIA"),
  CONSTRAINT "devpware_estados_extracciones_ia_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_extracciones_ia_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_estados_extracciones_ia_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_estados_extracciones_ia_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_estados_extracciones_ia_exitoso_check" CHECK ("BEsExitoso" = false OR "BEsFinal" = true OR "BRequiereRevision" = true)
);
CREATE INDEX "devpware_estados_extracciones_ia_BEsInicial_idx" ON "devpware_estados_extracciones_ia" ("BEsInicial");
CREATE INDEX "devpware_estados_extracciones_ia_BEsProceso_idx" ON "devpware_estados_extracciones_ia" ("BEsProceso");
CREATE INDEX "devpware_estados_extracciones_ia_BEsFinal_idx" ON "devpware_estados_extracciones_ia" ("BEsFinal");
CREATE INDEX "devpware_estados_extracciones_ia_BEsExitoso_idx" ON "devpware_estados_extracciones_ia" ("BEsExitoso");
CREATE INDEX "devpware_estados_extracciones_ia_BRequiereRevision_idx" ON "devpware_estados_extracciones_ia" ("BRequiereRevision");
CREATE INDEX "devpware_estados_extracciones_ia_BActivo_idx" ON "devpware_estados_extracciones_ia" ("BActivo");
CREATE INDEX "devpware_estados_extracciones_ia_IOrden_idx" ON "devpware_estados_extracciones_ia" ("IOrden");

-- 2. TipoExtraccionIA
CREATE TABLE "devpware_tipos_extracciones_ia" (
  "IdTipoExtraccionIA" SERIAL NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "BRequiereArchivo" BOOLEAN NOT NULL DEFAULT false,
  "BRequierePublicacion" BOOLEAN NOT NULL DEFAULT false,
  "BRequiereAvaluo" BOOLEAN NOT NULL DEFAULT false,
  "BRequiereVersionAvaluo" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteImagen" BOOLEAN NOT NULL DEFAULT false,
  "BPermiteTexto" BOOLEAN NOT NULL DEFAULT true,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "JEsquemaSalidaEsperado" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_extracciones_ia_pkey" PRIMARY KEY ("IdTipoExtraccionIA"),
  CONSTRAINT "devpware_tipos_extracciones_ia_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_extracciones_ia_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_extracciones_ia_SNombre_check" CHECK (btrim("SNombre") <> '')
);
CREATE INDEX "devpware_tipos_extracciones_ia_BRequiereArchivo_idx" ON "devpware_tipos_extracciones_ia" ("BRequiereArchivo");
CREATE INDEX "devpware_tipos_extracciones_ia_BRequierePublicacion_idx" ON "devpware_tipos_extracciones_ia" ("BRequierePublicacion");
CREATE INDEX "devpware_tipos_extracciones_ia_BRequiereAvaluo_idx" ON "devpware_tipos_extracciones_ia" ("BRequiereAvaluo");
CREATE INDEX "devpware_tipos_extracciones_ia_BRequiereVersion_idx" ON "devpware_tipos_extracciones_ia" ("BRequiereVersionAvaluo");
CREATE INDEX "devpware_tipos_extracciones_ia_BActivo_idx" ON "devpware_tipos_extracciones_ia" ("BActivo");

-- 3. PlantillaPromptIA
CREATE TABLE "devpware_plantillas_prompts_ia" (
  "IdPlantillaPromptIA" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdTipoExtraccionIA" INTEGER NOT NULL,
  "SClave" VARCHAR(120) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(1000),
  "INumeroVersion" INTEGER NOT NULL,
  "SProveedorObjetivo" VARCHAR(120),
  "SModeloObjetivo" VARCHAR(180),
  "SPlantillaEntrada" TEXT NOT NULL,
  "JEsquemaSalida" JSONB NOT NULL,
  "JConfiguracion" JSONB,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_plantillas_prompts_ia_pkey" PRIMARY KEY ("IdPlantillaPromptIA"),
  CONSTRAINT "devpware_plantillas_prompts_ia_UIdentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_plantillas_prompts_ia_SClave_Version_key" UNIQUE ("SClave", "INumeroVersion"),
  CONSTRAINT "devpware_plantillas_prompts_ia_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_plantillas_prompts_ia_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_plantillas_prompts_ia_entrada_check" CHECK (btrim("SPlantillaEntrada") <> ''),
  CONSTRAINT "devpware_plantillas_prompts_ia_version_check" CHECK ("INumeroVersion" >= 1),
  CONSTRAINT "devpware_plantillas_prompts_ia_esquema_check" CHECK (jsonb_typeof("JEsquemaSalida") <> 'null'),
  CONSTRAINT "devpware_plantillas_prompts_ia_tipo_fkey" FOREIGN KEY ("IdTipoExtraccionIA") REFERENCES "devpware_tipos_extracciones_ia" ("IdTipoExtraccionIA") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_plantillas_prompts_ia_IdTipo_idx" ON "devpware_plantillas_prompts_ia" ("IdTipoExtraccionIA");
CREATE INDEX "devpware_plantillas_prompts_ia_SClave_idx" ON "devpware_plantillas_prompts_ia" ("SClave");
CREATE INDEX "devpware_plantillas_prompts_ia_BActiva_idx" ON "devpware_plantillas_prompts_ia" ("BActiva");

-- 4. ExtraccionIA
CREATE TABLE "devpware_extracciones_ia" (
  "IdExtraccionIA" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdOrganizacion" INTEGER NOT NULL,
  "IdUsuarioSolicitud" INTEGER NOT NULL,
  "IdTipoExtraccionIA" INTEGER NOT NULL,
  "IdEstadoExtraccionIA" INTEGER NOT NULL,
  "IdPlantillaPromptIA" BIGINT,
  "IdTrabajo" BIGINT,
  "IdArchivo" BIGINT,
  "IdPublicacionPropiedad" BIGINT,
  "IdPropiedad" INTEGER,
  "IdAvaluo" INTEGER,
  "IdVersionAvaluo" INTEGER,
  "SProveedor" VARCHAR(120) NOT NULL,
  "SModelo" VARCHAR(180) NOT NULL,
  "SVersionModelo" VARCHAR(120),
  "SVersionPrompt" VARCHAR(80) NOT NULL,
  "SIdentificadorSolicitudProveedor" VARCHAR(220),
  "JEntradaSanitizada" JSONB NOT NULL,
  "JSalidaOriginal" JSONB,
  "JSalidaNormalizada" JSONB,
  "NConfianzaGlobal" NUMERIC(8,4),
  "ITokensEntrada" INTEGER,
  "ITokensSalida" INTEGER,
  "NCostoEstimado" NUMERIC(18,8),
  "SMonedaCosto" VARCHAR(10),
  "BRequiereRevision" BOOLEAN NOT NULL DEFAULT true,
  "BAplicada" BOOLEAN NOT NULL DEFAULT false,
  "SMensajeError" TEXT,
  "DFechaSolicitud" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaInicio" TIMESTAMPTZ(3),
  "DFechaRespuesta" TIMESTAMPTZ(3),
  "DFechaRevision" TIMESTAMPTZ(3),
  "DFechaAplicacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_extracciones_ia_pkey" PRIMARY KEY ("IdExtraccionIA"),
  CONSTRAINT "devpware_extracciones_ia_UIdentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_extracciones_ia_SProveedor_check" CHECK (btrim("SProveedor") <> ''),
  CONSTRAINT "devpware_extracciones_ia_SModelo_check" CHECK (btrim("SModelo") <> ''),
  CONSTRAINT "devpware_extracciones_ia_SVersionPrompt_check" CHECK (btrim("SVersionPrompt") <> ''),
  CONSTRAINT "devpware_extracciones_ia_entrada_check" CHECK (jsonb_typeof("JEntradaSanitizada") <> 'null'),
  CONSTRAINT "devpware_extracciones_ia_confianza_check" CHECK ("NConfianzaGlobal" IS NULL OR ("NConfianzaGlobal" >= 0 AND "NConfianzaGlobal" <= 100)),
  CONSTRAINT "devpware_extracciones_ia_tokens_entrada_check" CHECK ("ITokensEntrada" IS NULL OR "ITokensEntrada" >= 0),
  CONSTRAINT "devpware_extracciones_ia_tokens_salida_check" CHECK ("ITokensSalida" IS NULL OR "ITokensSalida" >= 0),
  CONSTRAINT "devpware_extracciones_ia_costo_check" CHECK ("NCostoEstimado" IS NULL OR "NCostoEstimado" >= 0),
  CONSTRAINT "devpware_extracciones_ia_aplicada_check" CHECK ("BAplicada" = false OR "DFechaAplicacion" IS NOT NULL),
  CONSTRAINT "devpware_extracciones_ia_respuesta_fechas_check" CHECK ("DFechaRespuesta" IS NULL OR "DFechaRespuesta" >= "DFechaSolicitud"),
  CONSTRAINT "devpware_extracciones_ia_revision_fechas_check" CHECK ("DFechaRevision" IS NULL OR ("DFechaRespuesta" IS NOT NULL AND "DFechaRevision" >= "DFechaRespuesta")),
  CONSTRAINT "devpware_extracciones_ia_aplicacion_fechas_check" CHECK ("DFechaAplicacion" IS NULL OR ("DFechaRevision" IS NOT NULL AND "DFechaAplicacion" >= "DFechaRevision")),
  CONSTRAINT "devpware_extracciones_ia_organizacion_fkey" FOREIGN KEY ("IdOrganizacion") REFERENCES "devpware_organizaciones" ("IdOrganizacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_usuario_fkey" FOREIGN KEY ("IdUsuarioSolicitud") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_tipo_fkey" FOREIGN KEY ("IdTipoExtraccionIA") REFERENCES "devpware_tipos_extracciones_ia" ("IdTipoExtraccionIA") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_estado_fkey" FOREIGN KEY ("IdEstadoExtraccionIA") REFERENCES "devpware_estados_extracciones_ia" ("IdEstadoExtraccionIA") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_plantilla_fkey" FOREIGN KEY ("IdPlantillaPromptIA") REFERENCES "devpware_plantillas_prompts_ia" ("IdPlantillaPromptIA") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_archivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_propiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_extracciones_ia_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_extracciones_ia_IdOrganizacion_idx" ON "devpware_extracciones_ia" ("IdOrganizacion");
CREATE INDEX "devpware_extracciones_ia_IdUsuario_idx" ON "devpware_extracciones_ia" ("IdUsuarioSolicitud");
CREATE INDEX "devpware_extracciones_ia_IdTipo_idx" ON "devpware_extracciones_ia" ("IdTipoExtraccionIA");
CREATE INDEX "devpware_extracciones_ia_IdEstado_idx" ON "devpware_extracciones_ia" ("IdEstadoExtraccionIA");
CREATE INDEX "devpware_extracciones_ia_IdPlantilla_idx" ON "devpware_extracciones_ia" ("IdPlantillaPromptIA");
CREATE INDEX "devpware_extracciones_ia_IdTrabajo_idx" ON "devpware_extracciones_ia" ("IdTrabajo");
CREATE INDEX "devpware_extracciones_ia_IdArchivo_idx" ON "devpware_extracciones_ia" ("IdArchivo");
CREATE INDEX "devpware_extracciones_ia_IdPublicacion_idx" ON "devpware_extracciones_ia" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_extracciones_ia_IdPropiedad_idx" ON "devpware_extracciones_ia" ("IdPropiedad");
CREATE INDEX "devpware_extracciones_ia_IdAvaluo_idx" ON "devpware_extracciones_ia" ("IdAvaluo");
CREATE INDEX "devpware_extracciones_ia_IdVersion_idx" ON "devpware_extracciones_ia" ("IdVersionAvaluo");
CREATE INDEX "devpware_extracciones_ia_SProveedor_idx" ON "devpware_extracciones_ia" ("SProveedor");
CREATE INDEX "devpware_extracciones_ia_SModelo_idx" ON "devpware_extracciones_ia" ("SModelo");
CREATE INDEX "devpware_extracciones_ia_BRequiereRevision_idx" ON "devpware_extracciones_ia" ("BRequiereRevision");
CREATE INDEX "devpware_extracciones_ia_BAplicada_idx" ON "devpware_extracciones_ia" ("BAplicada");
CREATE INDEX "devpware_extracciones_ia_DSolicitud_idx" ON "devpware_extracciones_ia" ("DFechaSolicitud");

-- 5. CampoExtraidoIA
CREATE TABLE "devpware_campos_extraidos_ia" (
  "IdCampoExtraidoIA" BIGSERIAL NOT NULL,
  "IdExtraccionIA" BIGINT NOT NULL,
  "IdEstadoValidacion" INTEGER NOT NULL,
  "IdOrigenDato" INTEGER NOT NULL,
  "SEntidadDestino" VARCHAR(160) NOT NULL,
  "SCampoDestino" VARCHAR(180) NOT NULL,
  "SRutaOrigen" VARCHAR(500),
  "SValorTexto" TEXT,
  "NValorNumerico" NUMERIC(24,8),
  "BValorBooleano" BOOLEAN,
  "DValorFecha" TIMESTAMPTZ(3),
  "JValorComplejo" JSONB,
  "NConfianza" NUMERIC(8,4),
  "SEvidenciaTexto" TEXT,
  "JCoordenadasEvidencia" JSONB,
  "BAplicado" BOOLEAN NOT NULL DEFAULT false,
  "SIdentificadorDestino" VARCHAR(180),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaAplicacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_campos_extraidos_ia_pkey" PRIMARY KEY ("IdCampoExtraidoIA"),
  CONSTRAINT "devpware_campos_extraidos_ia_entidad_check" CHECK (btrim("SEntidadDestino") <> ''),
  CONSTRAINT "devpware_campos_extraidos_ia_campo_check" CHECK (btrim("SCampoDestino") <> ''),
  CONSTRAINT "devpware_campos_extraidos_ia_confianza_check" CHECK ("NConfianza" IS NULL OR ("NConfianza" >= 0 AND "NConfianza" <= 100)),
  CONSTRAINT "devpware_campos_extraidos_ia_unico_valor_check" CHECK (
    CASE WHEN "SValorTexto" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "NValorNumerico" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "BValorBooleano" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "DValorFecha" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "JValorComplejo" IS NOT NULL THEN 1 ELSE 0 END <= 1
  ),
  CONSTRAINT "devpware_campos_extraidos_ia_aplicado_check" CHECK ("BAplicado" = false OR ("SIdentificadorDestino" IS NOT NULL AND "SIdentificadorDestino" <> '' AND "DFechaAplicacion" IS NOT NULL)),
  CONSTRAINT "devpware_campos_extraidos_ia_extraccion_fkey" FOREIGN KEY ("IdExtraccionIA") REFERENCES "devpware_extracciones_ia" ("IdExtraccionIA") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_campos_extraidos_ia_estado_fkey" FOREIGN KEY ("IdEstadoValidacion") REFERENCES "devpware_estados_validaciones" ("IdEstadoValidacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_campos_extraidos_ia_origen_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_campos_extraidos_ia_IdExtraccion_idx" ON "devpware_campos_extraidos_ia" ("IdExtraccionIA");
CREATE INDEX "devpware_campos_extraidos_ia_IdEstadoValidacion_idx" ON "devpware_campos_extraidos_ia" ("IdEstadoValidacion");
CREATE INDEX "devpware_campos_extraidos_ia_IdOrigenDato_idx" ON "devpware_campos_extraidos_ia" ("IdOrigenDato");
CREATE INDEX "devpware_campos_extraidos_ia_SEntidad_idx" ON "devpware_campos_extraidos_ia" ("SEntidadDestino");
CREATE INDEX "devpware_campos_extraidos_ia_SCampo_idx" ON "devpware_campos_extraidos_ia" ("SCampoDestino");
CREATE INDEX "devpware_campos_extraidos_ia_NConfianza_idx" ON "devpware_campos_extraidos_ia" ("NConfianza");
CREATE INDEX "devpware_campos_extraidos_ia_BAplicado_idx" ON "devpware_campos_extraidos_ia" ("BAplicado");

-- 6. ValidacionCampoIA
CREATE TABLE "devpware_validaciones_campos_ia" (
  "IdValidacionCampoIA" BIGSERIAL NOT NULL,
  "IdCampoExtraidoIA" BIGINT NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdEstadoValidacionAnterior" INTEGER,
  "IdEstadoValidacionNuevo" INTEGER NOT NULL,
  "SComentario" VARCHAR(1000),
  "SValorCorregidoTexto" TEXT,
  "NValorCorregidoNumerico" NUMERIC(24,8),
  "BValorCorregidoBooleano" BOOLEAN,
  "DValorCorregidoFecha" TIMESTAMPTZ(3),
  "JValorCorregidoComplejo" JSONB,
  "DFechaValidacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_validaciones_campos_ia_pkey" PRIMARY KEY ("IdValidacionCampoIA"),
  CONSTRAINT "devpware_validaciones_campos_ia_unico_valor_check" CHECK (
    CASE WHEN "SValorCorregidoTexto" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "NValorCorregidoNumerico" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "BValorCorregidoBooleano" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "DValorCorregidoFecha" IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN "JValorCorregidoComplejo" IS NOT NULL THEN 1 ELSE 0 END <= 1
  ),
  CONSTRAINT "devpware_validaciones_campos_ia_campo_fkey" FOREIGN KEY ("IdCampoExtraidoIA") REFERENCES "devpware_campos_extraidos_ia" ("IdCampoExtraidoIA") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_validaciones_campos_ia_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_validaciones_campos_ia_estado_anterior_fkey" FOREIGN KEY ("IdEstadoValidacionAnterior") REFERENCES "devpware_estados_validaciones" ("IdEstadoValidacion") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_validaciones_campos_ia_estado_nuevo_fkey" FOREIGN KEY ("IdEstadoValidacionNuevo") REFERENCES "devpware_estados_validaciones" ("IdEstadoValidacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_validaciones_campos_ia_IdCampo_idx" ON "devpware_validaciones_campos_ia" ("IdCampoExtraidoIA");
CREATE INDEX "devpware_validaciones_campos_ia_IdUsuario_idx" ON "devpware_validaciones_campos_ia" ("IdUsuario");
CREATE INDEX "devpware_validaciones_campos_ia_EstadoAnterior_idx" ON "devpware_validaciones_campos_ia" ("IdEstadoValidacionAnterior");
CREATE INDEX "devpware_validaciones_campos_ia_EstadoNuevo_idx" ON "devpware_validaciones_campos_ia" ("IdEstadoValidacionNuevo");
CREATE INDEX "devpware_validaciones_campos_ia_DFecha_idx" ON "devpware_validaciones_campos_ia" ("DFechaValidacion");

-- 7. ValidacionExtraccionIA
CREATE TABLE "devpware_validaciones_extracciones_ia" (
  "IdValidacionExtraccionIA" BIGSERIAL NOT NULL,
  "IdExtraccionIA" BIGINT NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "IdEstadoValidacion" INTEGER NOT NULL,
  "SComentario" VARCHAR(1000),
  "BAutorizaAplicacion" BOOLEAN NOT NULL DEFAULT false,
  "DFechaValidacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_validaciones_extracciones_ia_pkey" PRIMARY KEY ("IdValidacionExtraccionIA"),
  CONSTRAINT "devpware_validaciones_extracciones_ia_unique" UNIQUE ("IdExtraccionIA", "IdUsuario"),
  CONSTRAINT "devpware_validaciones_extracciones_ia_extraccion_fkey" FOREIGN KEY ("IdExtraccionIA") REFERENCES "devpware_extracciones_ia" ("IdExtraccionIA") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_validaciones_extracciones_ia_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_validaciones_extracciones_ia_estado_fkey" FOREIGN KEY ("IdEstadoValidacion") REFERENCES "devpware_estados_validaciones" ("IdEstadoValidacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_validaciones_extracciones_ia_IdExtraccion_idx" ON "devpware_validaciones_extracciones_ia" ("IdExtraccionIA");
CREATE INDEX "devpware_validaciones_extracciones_ia_IdUsuario_idx" ON "devpware_validaciones_extracciones_ia" ("IdUsuario");
CREATE INDEX "devpware_validaciones_extracciones_ia_IdEstado_idx" ON "devpware_validaciones_extracciones_ia" ("IdEstadoValidacion");
CREATE INDEX "devpware_validaciones_extracciones_ia_BAutoriza_idx" ON "devpware_validaciones_extracciones_ia" ("BAutorizaAplicacion");
CREATE INDEX "devpware_validaciones_extracciones_ia_DFecha_idx" ON "devpware_validaciones_extracciones_ia" ("DFechaValidacion");

-- 8. EventoExtraccionIA
CREATE TABLE "devpware_eventos_extracciones_ia" (
  "IdEventoExtraccionIA" BIGSERIAL NOT NULL,
  "IdExtraccionIA" BIGINT NOT NULL,
  "IdEstadoExtraccionIAAnterior" INTEGER,
  "IdEstadoExtraccionIANuevo" INTEGER NOT NULL,
  "IdUsuario" INTEGER,
  "IdTrabajo" BIGINT,
  "SMotivo" VARCHAR(1000),
  "JMetadatos" JSONB,
  "DFechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_eventos_extracciones_ia_pkey" PRIMARY KEY ("IdEventoExtraccionIA"),
  CONSTRAINT "devpware_eventos_extracciones_ia_extraccion_fkey" FOREIGN KEY ("IdExtraccionIA") REFERENCES "devpware_extracciones_ia" ("IdExtraccionIA") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_extracciones_ia_estado_anterior_fkey" FOREIGN KEY ("IdEstadoExtraccionIAAnterior") REFERENCES "devpware_estados_extracciones_ia" ("IdEstadoExtraccionIA") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_extracciones_ia_estado_nuevo_fkey" FOREIGN KEY ("IdEstadoExtraccionIANuevo") REFERENCES "devpware_estados_extracciones_ia" ("IdEstadoExtraccionIA") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_extracciones_ia_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_eventos_extracciones_ia_trabajo_fkey" FOREIGN KEY ("IdTrabajo") REFERENCES "devpware_trabajos" ("IdTrabajo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_eventos_extracciones_ia_IdExtraccion_idx" ON "devpware_eventos_extracciones_ia" ("IdExtraccionIA");
CREATE INDEX "devpware_eventos_extracciones_ia_IdEstadoAnterior_idx" ON "devpware_eventos_extracciones_ia" ("IdEstadoExtraccionIAAnterior");
CREATE INDEX "devpware_eventos_extracciones_ia_IdEstadoNuevo_idx" ON "devpware_eventos_extracciones_ia" ("IdEstadoExtraccionIANuevo");
CREATE INDEX "devpware_eventos_extracciones_ia_IdUsuario_idx" ON "devpware_eventos_extracciones_ia" ("IdUsuario");
CREATE INDEX "devpware_eventos_extracciones_ia_IdTrabajo_idx" ON "devpware_eventos_extracciones_ia" ("IdTrabajo");
CREATE INDEX "devpware_eventos_extracciones_ia_DFecha_idx" ON "devpware_eventos_extracciones_ia" ("DFechaEvento");

-- 9. Triggers historicos
CREATE TRIGGER "devpware_validaciones_campos_ia_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_validaciones_campos_ia"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

CREATE TRIGGER "devpware_eventos_extracciones_ia_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_eventos_extracciones_ia"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

-- 10. Semillas EstadoExtraccionIA
INSERT INTO "devpware_estados_extracciones_ia" ("SClave", "SNombre", "SDescripcion", "BEsInicial", "BEsProceso", "BEsFinal", "BEsExitoso", "BRequiereRevision", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('PENDIENTE', 'Pendiente', 'Extraccion pendiente de procesar.', true, false, false, false, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PREPARANDO', 'Preparando', 'Preparando datos para la extraccion.', false, true, false, false, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROCESANDO', 'Procesando', 'Procesando solicitud con IA.', false, true, false, false, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RESULTADO_RECIBIDO', 'Resultado recibido', 'Resultado de IA recibido, pendiente de revision.', false, false, false, true, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EN_REVISION', 'En revision', 'Resultado en revision humana.', false, true, false, true, true, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VALIDADA', 'Validada', 'Extraccion validada correctamente.', false, false, false, false, false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('APLICADA', 'Aplicada', 'Datos extraidos aplicados al sistema.', false, false, true, true, false, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('RECHAZADA', 'Rechazada', 'Extraccion rechazada por el usuario.', false, false, true, false, false, true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FALLIDA', 'Fallida', 'Error durante el proceso de extraccion.', false, false, true, false, false, true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CANCELADA', 'Cancelada', 'Extraccion cancelada por el usuario.', false, false, true, false, false, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BEsInicial" = EXCLUDED."BEsInicial",
  "BEsProceso" = EXCLUDED."BEsProceso",
  "BEsFinal" = EXCLUDED."BEsFinal",
  "BEsExitoso" = EXCLUDED."BEsExitoso",
  "BRequiereRevision" = EXCLUDED."BRequiereRevision",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

-- 11. Semillas TipoExtraccionIA
INSERT INTO "devpware_tipos_extracciones_ia" ("SClave", "SNombre", "SDescripcion", "BRequiereArchivo", "BRequierePublicacion", "BRequiereAvaluo", "BRequiereVersionAvaluo", "BPermiteImagen", "BPermiteTexto", "BActivo", "DFechaCreacion", "DFechaModificacion") VALUES
  ('EXTRAER_DATOS_DOCUMENTO', 'Extraer datos de documento', 'Extrae datos estructurados a partir de un documento.', true, false, false, false, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DATOS_IMAGEN', 'Extraer datos de imagen', 'Extrae informacion a partir de una imagen.', true, false, false, false, true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DATOS_PUBLICACION', 'Extraer datos de publicacion', 'Extrae datos estructurados de una publicacion inmobiliaria.', false, true, false, false, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DIRECCION', 'Extraer direccion', 'Extrae y normaliza una direccion a partir de texto.', false, false, false, false, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DATOS_PROPIEDAD', 'Extraer datos de propiedad', 'Extrae caracteristicas de una propiedad.', false, false, true, false, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EXTRAER_DATOS_TECNICOS', 'Extraer datos tecnicos', 'Extrae datos tecnicos de documentos valuatorios.', true, false, true, true, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CLASIFICAR_TIPO_INMUEBLE', 'Clasificar tipo de inmueble', 'Clasifica el tipo de inmueble segun descripcion.', false, false, true, false, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CLASIFICAR_DOCUMENTO', 'Clasificar documento', 'Clasifica el tipo de documento segun su contenido.', true, false, false, false, true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROPONER_CARACTERISTICAS', 'Proponer caracteristicas', 'Propone caracteristicas de propiedad basado en datos disponibles.', false, false, true, false, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DETECTAR_INCONSISTENCIAS', 'Detectar inconsistencias', 'Detecta inconsistencias en datos de un avaluo.', false, false, true, true, false, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BRequiereArchivo" = EXCLUDED."BRequiereArchivo",
  "BRequierePublicacion" = EXCLUDED."BRequierePublicacion",
  "BRequiereAvaluo" = EXCLUDED."BRequiereAvaluo",
  "BRequiereVersionAvaluo" = EXCLUDED."BRequiereVersionAvaluo",
  "BPermiteImagen" = EXCLUDED."BPermiteImagen",
  "BPermiteTexto" = EXCLUDED."BPermiteTexto",
  "BActivo" = EXCLUDED."BActivo",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
