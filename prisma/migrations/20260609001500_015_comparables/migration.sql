-- Migracion 015_comparables

CREATE TABLE "devpware_tipos_factores_homologacion" (
  "IdTipoFactorHomologacion" SERIAL NOT NULL,
  "SClave" VARCHAR(100) NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_factores_homologacion_pkey" PRIMARY KEY ("IdTipoFactorHomologacion"),
  CONSTRAINT "devpware_tipos_factores_homologacion_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_factores_homologacion_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_factores_homologacion_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_factores_homologacion_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_factores_homologacion_BActivo_idx" ON "devpware_tipos_factores_homologacion" ("BActivo");
CREATE INDEX "devpware_tipos_factores_homologacion_IOrden_idx" ON "devpware_tipos_factores_homologacion" ("IOrden");

CREATE TABLE "devpware_comparables_avaluos" (
  "IdComparableAvaluo" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "IdPublicacionPropiedad" BIGINT,
  "IdUsuarioSeleccion" INTEGER NOT NULL,
  "IdTipoComparable" INTEGER NOT NULL,
  "IReferencia" INTEGER,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "NPorcentajeSimilitud" NUMERIC(8,4),
  "NDistanciaMetros" NUMERIC(18,4),
  "NPrecioCapturado" NUMERIC(24,2),
  "NSuperficieTerrenoCapturada" NUMERIC(18,4),
  "NSuperficieConstruccionCapturada" NUMERIC(18,4),
  "NSuperficieRentableCapturada" NUMERIC(18,4),
  "NValorUnitarioCapturado" NUMERIC(24,8),
  "BIncluido" BOOLEAN NOT NULL DEFAULT true,
  "SMotivoSeleccion" VARCHAR(1000),
  "SMotivoExclusion" VARCHAR(1000),
  "JPropiedadSnapshot" JSONB NOT NULL,
  "JPublicacionSnapshot" JSONB,
  "JDireccionSnapshot" JSONB NOT NULL,
  "JUbicacionSnapshot" JSONB NOT NULL,
  "JImagenesSnapshot" JSONB,
  "DFechaSeleccion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaExclusion" TIMESTAMPTZ(3),
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_comparables_avaluos_pkey" PRIMARY KEY ("IdComparableAvaluo"),
  CONSTRAINT "devpware_comparables_avaluos_UIdentificadorPublico_key" UNIQUE ("UIdentificadorPublico"),
  CONSTRAINT "devpware_comparables_version_prop_tipo_key" UNIQUE ("IdVersionAvaluo", "IdPropiedad", "IdTipoComparable"),
  CONSTRAINT "devpware_comparables_avaluos_referencia_check" CHECK ("IReferencia" IS NULL OR "IReferencia" >= 1),
  CONSTRAINT "devpware_comparables_avaluos_orden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_comparables_avaluos_similitud_check" CHECK ("NPorcentajeSimilitud" IS NULL OR ("NPorcentajeSimilitud" >= 0 AND "NPorcentajeSimilitud" <= 100)),
  CONSTRAINT "devpware_comparables_avaluos_no_negativos_check" CHECK (
    ("NDistanciaMetros" IS NULL OR "NDistanciaMetros" >= 0) AND
    ("NPrecioCapturado" IS NULL OR "NPrecioCapturado" >= 0) AND
    ("NSuperficieTerrenoCapturada" IS NULL OR "NSuperficieTerrenoCapturada" >= 0) AND
    ("NSuperficieConstruccionCapturada" IS NULL OR "NSuperficieConstruccionCapturada" >= 0) AND
    ("NSuperficieRentableCapturada" IS NULL OR "NSuperficieRentableCapturada" >= 0) AND
    ("NValorUnitarioCapturado" IS NULL OR "NValorUnitarioCapturado" >= 0)
  ),
  CONSTRAINT "devpware_comparables_avaluos_exclusion_check" CHECK ("BIncluido" = true OR ("DFechaExclusion" IS NOT NULL AND "SMotivoExclusion" IS NOT NULL AND btrim("SMotivoExclusion") <> '')),
  CONSTRAINT "devpware_comparables_avaluos_snapshots_check" CHECK (
    jsonb_typeof("JPropiedadSnapshot") <> 'null' AND
    jsonb_typeof("JDireccionSnapshot") <> 'null' AND
    jsonb_typeof("JUbicacionSnapshot") <> 'null'
  ),
  CONSTRAINT "devpware_comparables_avaluos_IdAvaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_comparables_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_comparables_avaluos_IdPropiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_comparables_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_comparables_usuario_fkey" FOREIGN KEY ("IdUsuarioSeleccion") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_comparables_tipo_fkey" FOREIGN KEY ("IdTipoComparable") REFERENCES "devpware_tipos_comparables" ("IdTipoComparable") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_comparables_avaluos_IdAvaluo_idx" ON "devpware_comparables_avaluos" ("IdAvaluo");
CREATE INDEX "devpware_comparables_avaluos_IdVersionAvaluo_idx" ON "devpware_comparables_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_comparables_avaluos_IdPropiedad_idx" ON "devpware_comparables_avaluos" ("IdPropiedad");
CREATE INDEX "devpware_comparables_avaluos_IdPublicacion_idx" ON "devpware_comparables_avaluos" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_comparables_avaluos_IdUsuarioSeleccion_idx" ON "devpware_comparables_avaluos" ("IdUsuarioSeleccion");
CREATE INDEX "devpware_comparables_avaluos_IdTipoComparable_idx" ON "devpware_comparables_avaluos" ("IdTipoComparable");
CREATE INDEX "devpware_comparables_avaluos_BIncluido_idx" ON "devpware_comparables_avaluos" ("BIncluido");
CREATE INDEX "devpware_comparables_avaluos_IOrden_idx" ON "devpware_comparables_avaluos" ("IOrden");
CREATE INDEX "devpware_comparables_avaluos_NPorcentajeSimilitud_idx" ON "devpware_comparables_avaluos" ("NPorcentajeSimilitud");
CREATE INDEX "devpware_comparables_avaluos_NDistanciaMetros_idx" ON "devpware_comparables_avaluos" ("NDistanciaMetros");
CREATE INDEX "devpware_comparables_avaluos_DFechaSeleccion_idx" ON "devpware_comparables_avaluos" ("DFechaSeleccion");

CREATE TABLE "devpware_factores_homologacion" (
  "IdFactorHomologacion" BIGSERIAL NOT NULL,
  "IdComparableAvaluo" BIGINT NOT NULL,
  "IdTipoFactorHomologacion" INTEGER NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "NValor" NUMERIC(16,8) NOT NULL,
  "SJustificacion" VARCHAR(1000),
  "IdOrigenDato" INTEGER NOT NULL,
  "BConfirmado" BOOLEAN NOT NULL DEFAULT false,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_factores_homologacion_pkey" PRIMARY KEY ("IdFactorHomologacion"),
  CONSTRAINT "devpware_factores_homologacion_comparable_tipo_key" UNIQUE ("IdComparableAvaluo", "IdTipoFactorHomologacion"),
  CONSTRAINT "devpware_factores_homologacion_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_factores_homologacion_NValor_check" CHECK ("NValor" >= 0),
  CONSTRAINT "devpware_factores_homologacion_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_factores_homologacion_comparable_fkey" FOREIGN KEY ("IdComparableAvaluo") REFERENCES "devpware_comparables_avaluos" ("IdComparableAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_factores_homologacion_tipo_fkey" FOREIGN KEY ("IdTipoFactorHomologacion") REFERENCES "devpware_tipos_factores_homologacion" ("IdTipoFactorHomologacion") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_factores_homologacion_origen_fkey" FOREIGN KEY ("IdOrigenDato") REFERENCES "devpware_origenes_datos" ("IdOrigenDato") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_factores_homologacion_IdComparable_idx" ON "devpware_factores_homologacion" ("IdComparableAvaluo");
CREATE INDEX "devpware_factores_homologacion_IdTipoFactor_idx" ON "devpware_factores_homologacion" ("IdTipoFactorHomologacion");
CREATE INDEX "devpware_factores_homologacion_IdOrigenDato_idx" ON "devpware_factores_homologacion" ("IdOrigenDato");
CREATE INDEX "devpware_factores_homologacion_BConfirmado_idx" ON "devpware_factores_homologacion" ("BConfirmado");
CREATE INDEX "devpware_factores_homologacion_IOrden_idx" ON "devpware_factores_homologacion" ("IOrden");

CREATE TABLE "devpware_ajustes_comparables" (
  "IdAjusteComparable" BIGSERIAL NOT NULL,
  "IdComparableAvaluo" BIGINT NOT NULL,
  "SConcepto" VARCHAR(220) NOT NULL,
  "NValorOriginal" NUMERIC(24,8),
  "NFactor" NUMERIC(16,8),
  "NValorAjustado" NUMERIC(24,8),
  "SJustificacion" VARCHAR(1000),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_ajustes_comparables_pkey" PRIMARY KEY ("IdAjusteComparable"),
  CONSTRAINT "devpware_ajustes_comparables_SConcepto_check" CHECK (btrim("SConcepto") <> ''),
  CONSTRAINT "devpware_ajustes_comparables_no_negativos_check" CHECK (
    ("NValorOriginal" IS NULL OR "NValorOriginal" >= 0) AND
    ("NFactor" IS NULL OR "NFactor" >= 0) AND
    ("NValorAjustado" IS NULL OR "NValorAjustado" >= 0) AND
    "IOrden" >= 0
  ),
  CONSTRAINT "devpware_ajustes_comparables_comparable_fkey" FOREIGN KEY ("IdComparableAvaluo") REFERENCES "devpware_comparables_avaluos" ("IdComparableAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_ajustes_comparables_IdComparable_idx" ON "devpware_ajustes_comparables" ("IdComparableAvaluo");
CREATE INDEX "devpware_ajustes_comparables_IOrden_idx" ON "devpware_ajustes_comparables" ("IOrden");

CREATE TABLE "devpware_historiales_uso_comparables" (
  "IdHistorialUsoComparable" BIGSERIAL NOT NULL,
  "IdPropiedad" INTEGER NOT NULL,
  "IdPublicacionPropiedad" BIGINT,
  "IdAvaluo" INTEGER NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdUsuario" INTEGER NOT NULL,
  "JDatosComparable" JSONB NOT NULL,
  "JAjustesAplicados" JSONB,
  "NResultado" NUMERIC(24,8),
  "DFechaUso" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_historiales_uso_comparables_pkey" PRIMARY KEY ("IdHistorialUsoComparable"),
  CONSTRAINT "devpware_hist_uso_comparables_resultado_check" CHECK ("NResultado" IS NULL OR "NResultado" >= 0),
  CONSTRAINT "devpware_hist_uso_comparables_datos_check" CHECK (jsonb_typeof("JDatosComparable") <> 'null'),
  CONSTRAINT "devpware_hist_uso_comparables_propiedad_fkey" FOREIGN KEY ("IdPropiedad") REFERENCES "devpware_propiedades" ("IdPropiedad") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_uso_comparables_publicacion_fkey" FOREIGN KEY ("IdPublicacionPropiedad") REFERENCES "devpware_publicaciones_propiedades" ("IdPublicacionPropiedad") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_uso_comparables_avaluo_fkey" FOREIGN KEY ("IdAvaluo") REFERENCES "devpware_avaluos" ("IdAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_uso_comparables_version_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "devpware_hist_uso_comparables_usuario_fkey" FOREIGN KEY ("IdUsuario") REFERENCES "devpware_usuarios" ("IdUsuario") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_hist_uso_comparables_IdPropiedad_idx" ON "devpware_historiales_uso_comparables" ("IdPropiedad");
CREATE INDEX "devpware_hist_uso_comparables_IdPublicacion_idx" ON "devpware_historiales_uso_comparables" ("IdPublicacionPropiedad");
CREATE INDEX "devpware_hist_uso_comparables_IdAvaluo_idx" ON "devpware_historiales_uso_comparables" ("IdAvaluo");
CREATE INDEX "devpware_hist_uso_comparables_IdVersion_idx" ON "devpware_historiales_uso_comparables" ("IdVersionAvaluo");
CREATE INDEX "devpware_hist_uso_comparables_IdUsuario_idx" ON "devpware_historiales_uso_comparables" ("IdUsuario");
CREATE INDEX "devpware_hist_uso_comparables_DFechaUso_idx" ON "devpware_historiales_uso_comparables" ("DFechaUso");

INSERT INTO "devpware_tipos_factores_homologacion" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('NEGOCIACION', 'Negociacion', 'Factor por margen de negociacion.', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('UBICACION', 'Ubicacion', 'Factor por ubicacion.', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SUPERFICIE', 'Superficie', 'Factor por superficie.', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('SERVICIOS', 'Servicios', 'Factor por servicios disponibles.', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CLASIFICACION', 'Clasificacion', 'Factor por clasificacion del inmueble.', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('TOPOGRAFIA', 'Topografia', 'Factor por topografia.', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ZONA', 'Zona', 'Factor por zona.', true, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CALIDAD', 'Calidad', 'Factor por calidad.', true, 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CONSERVACION', 'Conservacion', 'Factor por estado de conservacion.', true, 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('EDAD', 'Edad', 'Factor por edad.', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FORMA', 'Forma', 'Factor por forma.', true, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('FRENTE', 'Frente', 'Factor por frente.', true, 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('USO_SUELO', 'Uso de suelo', 'Factor por uso de suelo.', true, 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PROYECTO', 'Proyecto', 'Factor por proyecto.', true, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OTRO', 'Otro', 'Otro factor de homologacion.', true, 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET
  "SNombre" = EXCLUDED."SNombre",
  "SDescripcion" = EXCLUDED."SDescripcion",
  "BActivo" = EXCLUDED."BActivo",
  "IOrden" = EXCLUDED."IOrden",
  "DFechaModificacion" = CURRENT_TIMESTAMP;
