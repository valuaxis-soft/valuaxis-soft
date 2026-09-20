-- Migration 021_normatividad

-- 1. TipoNorma
CREATE TABLE "devpware_tipos_normas" (
  "IdTipoNorma" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_normas_pkey" PRIMARY KEY ("IdTipoNorma"),
  CONSTRAINT "devpware_tipos_normas_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_normas_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_normas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_normas_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_normas_BActivo_idx" ON "devpware_tipos_normas" ("BActivo");
CREATE INDEX "devpware_tipos_normas_IOrden_idx" ON "devpware_tipos_normas" ("IOrden");

-- 2. AmbitoNormativo
CREATE TABLE "devpware_ambitos_normativos" (
  "IdAmbitoNormativo" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_ambitos_normativos_pkey" PRIMARY KEY ("IdAmbitoNormativo"),
  CONSTRAINT "devpware_ambitos_normativos_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_ambitos_normativos_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_ambitos_normativos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_ambitos_normativos_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_ambitos_normativos_BActivo_idx" ON "devpware_ambitos_normativos" ("BActivo");
CREATE INDEX "devpware_ambitos_normativos_IOrden_idx" ON "devpware_ambitos_normativos" ("IOrden");

-- 3. EstadoNorma
CREATE TABLE "devpware_estados_normas" (
  "IdEstadoNorma" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BEsVigente" BOOLEAN NOT NULL DEFAULT false,
  "BEsFinal" BOOLEAN NOT NULL DEFAULT false,
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_estados_normas_pkey" PRIMARY KEY ("IdEstadoNorma"),
  CONSTRAINT "devpware_estados_normas_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_estados_normas_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_estados_normas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_estados_normas_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_estados_normas_BEsVigente_idx" ON "devpware_estados_normas" ("BEsVigente");
CREATE INDEX "devpware_estados_normas_BEsFinal_idx" ON "devpware_estados_normas" ("BEsFinal");
CREATE INDEX "devpware_estados_normas_BActivo_idx" ON "devpware_estados_normas" ("BActivo");
CREATE INDEX "devpware_estados_normas_IOrden_idx" ON "devpware_estados_normas" ("IOrden");

-- 4. Norma
CREATE TABLE "devpware_normas" (
  "IdNorma" SERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdTipoNorma" INTEGER NOT NULL,
  "IdAmbitoNormativo" INTEGER NOT NULL,
  "SClave" VARCHAR(140) NOT NULL,
  "SNombre" VARCHAR(500) NOT NULL,
  "SNombreCorto" VARCHAR(220),
  "SDescripcion" TEXT,
  "SAutoridadEmisora" VARCHAR(300),
  "SPais" VARCHAR(120) NOT NULL DEFAULT 'México',
  "SEstadoFederativo" VARCHAR(180),
  "SMunicipio" VARCHAR(180),
  "BEsSistema" BOOLEAN NOT NULL DEFAULT true,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  "DFechaEliminacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_normas_pkey" PRIMARY KEY ("IdNorma"),
  CONSTRAINT "devpware_normas_UIdentificador_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_normas_unique_activa" UNIQUE ("SClave", "SPais", "SEstadoFederativo", "SMunicipio"),
  CONSTRAINT "devpware_normas_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_normas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_normas_SPais_check" CHECK (btrim("SPais") <> ''),
  CONSTRAINT "devpware_normas_tipo_fkey" FOREIGN KEY ("IdTipoNorma") REFERENCES "devpware_tipos_normas" ("IdTipoNorma") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_normas_ambito_fkey" FOREIGN KEY ("IdAmbitoNormativo") REFERENCES "devpware_ambitos_normativos" ("IdAmbitoNormativo") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_normas_IdTipo_idx" ON "devpware_normas" ("IdTipoNorma");
CREATE INDEX "devpware_normas_IdAmbito_idx" ON "devpware_normas" ("IdAmbitoNormativo");
CREATE INDEX "devpware_normas_SClave_idx" ON "devpware_normas" ("SClave");
CREATE INDEX "devpware_normas_SPais_idx" ON "devpware_normas" ("SPais");
CREATE INDEX "devpware_normas_SEstado_idx" ON "devpware_normas" ("SEstadoFederativo");
CREATE INDEX "devpware_normas_SMunicipio_idx" ON "devpware_normas" ("SMunicipio");
CREATE INDEX "devpware_normas_BEsSistema_idx" ON "devpware_normas" ("BEsSistema");
CREATE INDEX "devpware_normas_BActiva_idx" ON "devpware_normas" ("BActiva");
CREATE INDEX "devpware_normas_DEliminacion_idx" ON "devpware_normas" ("DFechaEliminacion");

-- 5. VersionNorma
CREATE TABLE "devpware_versiones_normas" (
  "IdVersionNorma" SERIAL NOT NULL,
  "IdNorma" INTEGER NOT NULL,
  "IdEstadoNorma" INTEGER NOT NULL,
  "IdArchivo" BIGINT,
  "INumeroVersion" INTEGER NOT NULL,
  "SVersionOficial" VARCHAR(120),
  "SReferenciaPublicacion" VARCHAR(500),
  "SURLFuente" TEXT,
  "SHashDocumento" VARCHAR(128),
  "SAlgoritmoHash" VARCHAR(40),
  "SResumen" TEXT,
  "JMetadatos" JSONB,
  "DFechaPublicacion" TIMESTAMPTZ(3),
  "DFechaInicioVigencia" TIMESTAMPTZ(3),
  "DFechaFinVigencia" TIMESTAMPTZ(3),
  "DFechaConsulta" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_versiones_normas_pkey" PRIMARY KEY ("IdVersionNorma"),
  CONSTRAINT "devpware_versiones_normas_unique" UNIQUE ("IdNorma", "INumeroVersion"),
  CONSTRAINT "devpware_versiones_normas_version_check" CHECK ("INumeroVersion" >= 1),
  CONSTRAINT "devpware_versiones_normas_vigencia_fechas_check" CHECK (
    "DFechaFinVigencia" IS NULL OR
    ("DFechaInicioVigencia" IS NOT NULL AND "DFechaFinVigencia" >= "DFechaInicioVigencia")
  ),
  CONSTRAINT "devpware_versiones_normas_hash_check" CHECK (
    "SHashDocumento" IS NULL OR
    ("SAlgoritmoHash" IS NOT NULL AND btrim("SAlgoritmoHash") <> '')
  ),
  CONSTRAINT "devpware_versiones_normas_norma_fkey" FOREIGN KEY ("IdNorma") REFERENCES "devpware_normas" ("IdNorma") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_versiones_normas_estado_fkey" FOREIGN KEY ("IdEstadoNorma") REFERENCES "devpware_estados_normas" ("IdEstadoNorma") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_versiones_normas_archivo_fkey" FOREIGN KEY ("IdArchivo") REFERENCES "devpware_archivos" ("IdArchivo") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_versiones_normas_IdNorma_idx" ON "devpware_versiones_normas" ("IdNorma");
CREATE INDEX "devpware_versiones_normas_IdEstado_idx" ON "devpware_versiones_normas" ("IdEstadoNorma");
CREATE INDEX "devpware_versiones_normas_IdArchivo_idx" ON "devpware_versiones_normas" ("IdArchivo");
CREATE INDEX "devpware_versiones_normas_DPublicacion_idx" ON "devpware_versiones_normas" ("DFechaPublicacion");
CREATE INDEX "devpware_versiones_normas_DInicioVigencia_idx" ON "devpware_versiones_normas" ("DFechaInicioVigencia");
CREATE INDEX "devpware_versiones_normas_DFinVigencia_idx" ON "devpware_versiones_normas" ("DFechaFinVigencia");
CREATE INDEX "devpware_versiones_normas_DConsulta_idx" ON "devpware_versiones_normas" ("DFechaConsulta");

-- 6. ReglaNormativa
CREATE TABLE "devpware_reglas_normativas" (
  "IdReglaNormativa" BIGSERIAL NOT NULL,
  "IdVersionNorma" INTEGER NOT NULL,
  "SClave" VARCHAR(140) NOT NULL,
  "SNombre" VARCHAR(300) NOT NULL,
  "SDescripcion" TEXT,
  "SSeccionReferencia" VARCHAR(300),
  "STipoRegla" VARCHAR(100) NOT NULL,
  "JParametros" JSONB,
  "JCondiciones" JSONB,
  "SResultadoEsperado" VARCHAR(500),
  "BObligatoria" BOOLEAN NOT NULL DEFAULT true,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_reglas_normativas_pkey" PRIMARY KEY ("IdReglaNormativa"),
  CONSTRAINT "devpware_reglas_normativas_unique" UNIQUE ("IdVersionNorma", "SClave"),
  CONSTRAINT "devpware_reglas_normativas_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_reglas_normativas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_reglas_normativas_tipo_check" CHECK (btrim("STipoRegla") <> ''),
  CONSTRAINT "devpware_reglas_normativas_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_reglas_normativas_version_fkey" FOREIGN KEY ("IdVersionNorma") REFERENCES "devpware_versiones_normas" ("IdVersionNorma") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_reglas_normativas_IdVersion_idx" ON "devpware_reglas_normativas" ("IdVersionNorma");
CREATE INDEX "devpware_reglas_normativas_STipo_idx" ON "devpware_reglas_normativas" ("STipoRegla");
CREATE INDEX "devpware_reglas_normativas_BObligatoria_idx" ON "devpware_reglas_normativas" ("BObligatoria");
CREATE INDEX "devpware_reglas_normativas_BActiva_idx" ON "devpware_reglas_normativas" ("BActiva");
CREATE INDEX "devpware_reglas_normativas_IOrden_idx" ON "devpware_reglas_normativas" ("IOrden");

-- 7. AplicacionNormativaAvaluo
CREATE TABLE "devpware_aplicaciones_normativas_avaluos" (
  "IdAplicacionNormativaAvaluo" BIGSERIAL NOT NULL,
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdVersionNorma" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "BAplicada" BOOLEAN NOT NULL DEFAULT true,
  "BConfirmada" BOOLEAN NOT NULL DEFAULT false,
  "SJustificacion" TEXT,
  "JContextoAplicacion" JSONB,
  "DFechaAplicacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaConfirmacion" TIMESTAMPTZ(3),
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_pkey" PRIMARY KEY ("IdAplicacionNormativaAvaluo"),
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_unique" UNIQUE ("IdVersionAvaluo", "IdVersionNorma"),
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_confirmada_check" CHECK ("BConfirmada" = false OR "DFechaConfirmacion" IS NOT NULL),
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_norma_fkey" FOREIGN KEY ("IdVersionNorma") REFERENCES "devpware_versiones_normas" ("IdVersionNorma") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_aplicaciones_normativas_avaluos_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_IdAvaluo_idx" ON "devpware_aplicaciones_normativas_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_IdVersion_idx" ON "devpware_aplicaciones_normativas_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_IdNorma_idx" ON "devpware_aplicaciones_normativas_avaluos" ("IdVersionNorma");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_IdUsuario_idx" ON "devpware_aplicaciones_normativas_avaluos" ("IdUsuario");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_BAplicada_idx" ON "devpware_aplicaciones_normativas_avaluos" ("BAplicada");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_BConfirmada_idx" ON "devpware_aplicaciones_normativas_avaluos" ("BConfirmada");
CREATE INDEX "devpware_aplicaciones_normativas_avaluos_DFecha_idx" ON "devpware_aplicaciones_normativas_avaluos" ("DFechaAplicacion");

-- 8. AplicacionReglaNormativa
CREATE TABLE "devpware_aplicaciones_reglas_normativas" (
  "IdAplicacionReglaNormativa" BIGSERIAL NOT NULL,
  "IdAplicacionNormativaAvaluo" BIGINT NOT NULL,
  "IdReglaNormativa" BIGINT NOT NULL,
  "BCumple" BOOLEAN,
  "BNoAplica" BOOLEAN NOT NULL DEFAULT false,
  "SResultado" VARCHAR(500),
  "SObservacion" TEXT,
  "JEvidencia" JSONB,
  "IdUsuarioValidacion" INTEGER,
  "DFechaValidacion" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_pkey" PRIMARY KEY ("IdAplicacionReglaNormativa"),
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_unique" UNIQUE ("IdAplicacionNormativaAvaluo", "IdReglaNormativa"),
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_no_aplica_check" CHECK ("BNoAplica" = false OR "BCumple" IS NULL),
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_validacion_check" CHECK ("IdUsuarioValidacion" IS NULL OR "DFechaValidacion" IS NOT NULL),
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_aplicacion_fkey" FOREIGN KEY ("IdAplicacionNormativaAvaluo") REFERENCES "devpware_aplicaciones_normativas_avaluos" ("IdAplicacionNormativaAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_regla_fkey" FOREIGN KEY ("IdReglaNormativa") REFERENCES "devpware_reglas_normativas" ("IdReglaNormativa") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_aplicaciones_reglas_normativas_usuario_fkey" FOREIGN KEY ("IdUsuarioValidacion") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "devpware_aplicaciones_reglas_normativas_IdAplicacion_idx" ON "devpware_aplicaciones_reglas_normativas" ("IdAplicacionNormativaAvaluo");
CREATE INDEX "devpware_aplicaciones_reglas_normativas_IdRegla_idx" ON "devpware_aplicaciones_reglas_normativas" ("IdReglaNormativa");
CREATE INDEX "devpware_aplicaciones_reglas_normativas_BCumple_idx" ON "devpware_aplicaciones_reglas_normativas" ("BCumple");
CREATE INDEX "devpware_aplicaciones_reglas_normativas_BNoAplica_idx" ON "devpware_aplicaciones_reglas_normativas" ("BNoAplica");
CREATE INDEX "devpware_aplicaciones_reglas_normativas_IdUsuario_idx" ON "devpware_aplicaciones_reglas_normativas" ("IdUsuarioValidacion");
CREATE INDEX "devpware_aplicaciones_reglas_normativas_DFecha_idx" ON "devpware_aplicaciones_reglas_normativas" ("DFechaValidacion");

-- 9. FuenteNormativa
CREATE TABLE "devpware_fuentes_normativas" (
  "IdFuenteNormativa" BIGSERIAL NOT NULL,
  "IdNorma" INTEGER NOT NULL,
  "SNombre" VARCHAR(300) NOT NULL,
  "SURL" TEXT,
  "SAutoridad" VARCHAR(300),
  "BEsOficial" BOOLEAN NOT NULL DEFAULT false,
  "BActiva" BOOLEAN NOT NULL DEFAULT true,
  "DFechaConsulta" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_fuentes_normativas_pkey" PRIMARY KEY ("IdFuenteNormativa"),
  CONSTRAINT "devpware_fuentes_normativas_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_fuentes_normativas_norma_fkey" FOREIGN KEY ("IdNorma") REFERENCES "devpware_normas" ("IdNorma") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_fuentes_normativas_IdNorma_idx" ON "devpware_fuentes_normativas" ("IdNorma");
CREATE INDEX "devpware_fuentes_normativas_BEsOficial_idx" ON "devpware_fuentes_normativas" ("BEsOficial");
CREATE INDEX "devpware_fuentes_normativas_BActiva_idx" ON "devpware_fuentes_normativas" ("BActiva");
CREATE INDEX "devpware_fuentes_normativas_DFecha_idx" ON "devpware_fuentes_normativas" ("DFechaConsulta");

-- 10. HistorialEstadoNorma
CREATE TABLE "devpware_historiales_estados_normas" (
  "IdHistorialEstadoNorma" BIGSERIAL NOT NULL,
  "IdVersionNorma" INTEGER NOT NULL,
  "IdEstadoNormaAnterior" INTEGER,
  "IdEstadoNormaNuevo" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "SMotivo" VARCHAR(1000),
  "DFechaCambio" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_historiales_estados_normas_pkey" PRIMARY KEY ("IdHistorialEstadoNorma"),
  CONSTRAINT "devpware_historiales_estados_normas_version_fkey" FOREIGN KEY ("IdVersionNorma") REFERENCES "devpware_versiones_normas" ("IdVersionNorma") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_historiales_estados_normas_estado_anterior_fkey" FOREIGN KEY ("IdEstadoNormaAnterior") REFERENCES "devpware_estados_normas" ("IdEstadoNorma") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_historiales_estados_normas_estado_nuevo_fkey" FOREIGN KEY ("IdEstadoNormaNuevo") REFERENCES "devpware_estados_normas" ("IdEstadoNorma") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_historiales_estados_normas_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_historiales_estados_normas_IdVersion_idx" ON "devpware_historiales_estados_normas" ("IdVersionNorma");
CREATE INDEX "devpware_historiales_estados_normas_IdEstadoAnterior_idx" ON "devpware_historiales_estados_normas" ("IdEstadoNormaAnterior");
CREATE INDEX "devpware_historiales_estados_normas_IdEstadoNuevo_idx" ON "devpware_historiales_estados_normas" ("IdEstadoNormaNuevo");
CREATE INDEX "devpware_historiales_estados_normas_IdUsuario_idx" ON "devpware_historiales_estados_normas" ("IdUsuario");
CREATE INDEX "devpware_historiales_estados_normas_DFecha_idx" ON "devpware_historiales_estados_normas" ("DFechaCambio");

-- 11. Trigger historico
CREATE TRIGGER "devpware_historiales_estados_normas_inmutables"
BEFORE UPDATE OR DELETE ON "devpware_historiales_estados_normas"
FOR EACH ROW
EXECUTE FUNCTION "devpware_fn_impedir_modificacion_inmutable"();

-- 12. Semillas TipoNorma
INSERT INTO "devpware_tipos_normas" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('LEY', 'Ley', 'Ley emitida por autoridad legislativa.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('REGLAMENTO', 'Reglamento', 'Reglamento derivado de una ley.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('NORMA_TECNICA', 'Norma técnica', 'Norma técnica oficial o de referencia.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('LINEAMIENTO', 'Lineamiento', 'Lineamiento emitido por autoridad competente.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MANUAL', 'Manual', 'Manual de procedimientos o criterios.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CRITERIO', 'Criterio', 'Criterio emitido por autoridad u organismo.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CIRCULAR', 'Circular', 'Circular o comunicado oficial.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GUIA', 'Guía', 'Guía de aplicación o interpretación.', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('METODOLOGIA', 'Metodología', 'Metodología aprobada para valuación.', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OTRO', 'Otro', 'Otro tipo de norma no clasificada.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

-- 13. Semillas AmbitoNormativo
INSERT INTO "devpware_ambitos_normativos" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('FEDERAL', 'Federal', 'Ámbito federal o nacional.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ESTATAL', 'Estatal', 'Ámbito estatal o provincial.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('MUNICIPAL', 'Municipal', 'Ámbito municipal o local.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INSTITUCIONAL', 'Institucional', 'Ámbito de una institución u organismo.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INTERNO', 'Interno', 'Ámbito interno de la organización.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('INTERNACIONAL', 'Internacional', 'Ámbito internacional.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OTRO', 'Otro', 'Otro ámbito no clasificado.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;

-- 14. Semillas EstadoNorma
INSERT INTO "devpware_estados_normas" ("SClave", "SNombre", "SDescripcion", "BEsVigente", "BEsFinal", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('BORRADOR', 'Borrador', 'Versión en elaboración.', false, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PUBLICADA', 'Publicada', 'Norma publicada oficialmente.', false, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('VIGENTE', 'Vigente', 'Norma vigente y aplicable.', true, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SUSPENDIDA', 'Suspendida', 'Norma suspendida temporalmente.', false, false, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('DEROGADA', 'Derogada', 'Norma derogada parcial o totalmente.', false, true, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ABROGADA', 'Abrogada', 'Norma abrogada (derogación total).', false, true, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('REEMPLAZADA', 'Reemplazada', 'Norma reemplazada por una nueva versión.', false, true, true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BEsVigente" = EXCLUDED."BEsVigente",
  "BEsFinal" = EXCLUDED."BEsFinal",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
