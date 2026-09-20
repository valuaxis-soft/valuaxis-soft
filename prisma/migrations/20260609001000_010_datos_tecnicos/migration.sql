-- Migracion 010_datos_tecnicos
-- Catalogos auxiliares y datos tecnicos normalizados por version de avaluo.

CREATE TABLE "devpware_orientaciones" (
  "IdOrientacion" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_orientaciones_pkey" PRIMARY KEY ("IdOrientacion"),
  CONSTRAINT "devpware_orientaciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_orientaciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_orientaciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_orientaciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_orientaciones_BActivo_idx" ON "devpware_orientaciones" ("BActivo");
CREATE INDEX "devpware_orientaciones_IOrden_idx" ON "devpware_orientaciones" ("IOrden");

CREATE TABLE "devpware_grupos_elementos_construcciones" (
  "IdGrupoElementoConstruccion" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_grupos_elementos_construcciones_pkey" PRIMARY KEY ("IdGrupoElementoConstruccion"),
  CONSTRAINT "devpware_grupos_elementos_construcciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_grupos_elementos_construcciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_grupos_elementos_construcciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_grupos_elementos_construcciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_grupos_elementos_construcciones_BActivo_idx" ON "devpware_grupos_elementos_construcciones" ("BActivo");
CREATE INDEX "devpware_grupos_elementos_construcciones_IOrden_idx" ON "devpware_grupos_elementos_construcciones" ("IOrden");

CREATE TABLE "devpware_tipos_participaciones" (
  "IdTipoParticipacion" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_participaciones_pkey" PRIMARY KEY ("IdTipoParticipacion"),
  CONSTRAINT "devpware_tipos_participaciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_participaciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_participaciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_participaciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_participaciones_BActivo_idx" ON "devpware_tipos_participaciones" ("BActivo");
CREATE INDEX "devpware_tipos_participaciones_IOrden_idx" ON "devpware_tipos_participaciones" ("IOrden");

CREATE TABLE "devpware_tipos_consideraciones" (
  "IdTipoConsideracion" SERIAL NOT NULL,
  "SClave" VARCHAR(80) NOT NULL,
  "SNombre" VARCHAR(160) NOT NULL,
  "SDescripcion" VARCHAR(500),
  "BActivo" BOOLEAN NOT NULL DEFAULT true,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_consideraciones_pkey" PRIMARY KEY ("IdTipoConsideracion"),
  CONSTRAINT "devpware_tipos_consideraciones_SClave_key" UNIQUE ("SClave"),
  CONSTRAINT "devpware_tipos_consideraciones_SClave_check" CHECK (btrim("SClave") <> ''),
  CONSTRAINT "devpware_tipos_consideraciones_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_tipos_consideraciones_IOrden_check" CHECK ("IOrden" >= 0)
);
CREATE INDEX "devpware_tipos_consideraciones_BActivo_idx" ON "devpware_tipos_consideraciones" ("BActivo");
CREATE INDEX "devpware_tipos_consideraciones_IOrden_idx" ON "devpware_tipos_consideraciones" ("IOrden");

CREATE TABLE "devpware_caratulas_avaluos" (
  "IdCaratulaAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "SNumeroAvaluo" VARCHAR(100),
  "SFolio" VARCHAR(100),
  "SNombreSolicitante" VARCHAR(220),
  "SNombrePropietario" VARCHAR(220),
  "SObjetoAvaluo" VARCHAR(500),
  "SPropositoAvaluo" VARCHAR(500),
  "SNombreValuador" VARCHAR(220),
  "SRegistroValuador" VARCHAR(120),
  "NValorTotal" NUMERIC(24,2),
  "SValorConLetra" VARCHAR(500),
  "DFechaAvaluo" TIMESTAMPTZ(3),
  "DFechaVigencia" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_caratulas_avaluos_pkey" PRIMARY KEY ("IdCaratulaAvaluo"),
  CONSTRAINT "devpware_caratulas_avaluos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_caratulas_avaluos_NValorTotal_check" CHECK ("NValorTotal" IS NULL OR "NValorTotal" >= 0),
  CONSTRAINT "devpware_caratulas_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_caratulas_avaluos_DFechaAvaluo_idx" ON "devpware_caratulas_avaluos" ("DFechaAvaluo");
CREATE INDEX "devpware_caratulas_avaluos_DFechaVigencia_idx" ON "devpware_caratulas_avaluos" ("DFechaVigencia");

CREATE TABLE "devpware_datos_generales_avaluos" (
  "IdDatoGeneralAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "SAntecedente" TEXT,
  "SRegimenPropiedad" VARCHAR(220),
  "SEscritura" VARCHAR(180),
  "SNotaria" VARCHAR(180),
  "SNumeroNotaria" VARCHAR(80),
  "SNombreNotario" VARCHAR(220),
  "SRegistroPublico" VARCHAR(220),
  "SCuentaPredial" VARCHAR(120),
  "SClaveCatastral" VARCHAR(120),
  "SCuentaAgua" VARCHAR(120),
  "SUsoActual" VARCHAR(220),
  "SDescripcion" TEXT,
  "JDatosAdicionales" JSONB,
  "DFechaEscritura" TIMESTAMPTZ(3),
  "DFechaInspeccion" TIMESTAMPTZ(3),
  "DFechaReporte" TIMESTAMPTZ(3),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_datos_generales_avaluos_pkey" PRIMARY KEY ("IdDatoGeneralAvaluo"),
  CONSTRAINT "devpware_datos_generales_avaluos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_datos_generales_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_datos_generales_avaluos_SCuentaPredial_idx" ON "devpware_datos_generales_avaluos" ("SCuentaPredial");
CREATE INDEX "devpware_datos_generales_avaluos_SClaveCatastral_idx" ON "devpware_datos_generales_avaluos" ("SClaveCatastral");
CREATE INDEX "devpware_datos_generales_avaluos_DFechaInspeccion_idx" ON "devpware_datos_generales_avaluos" ("DFechaInspeccion");
CREATE INDEX "devpware_datos_generales_avaluos_DFechaReporte_idx" ON "devpware_datos_generales_avaluos" ("DFechaReporte");

CREATE TABLE "devpware_zonas_avaluos" (
  "IdZonaAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "SClasificacionZona" VARCHAR(220),
  "SReferenciaProximidad" VARCHAR(500),
  "SConstruccionDominante" VARCHAR(220),
  "NIndiceSaturacion" NUMERIC(8,4),
  "SNivelSocioeconomico" VARCHAR(160),
  "SDensidadPoblacion" VARCHAR(160),
  "SUsoSuelo" VARCHAR(220),
  "SEquipamientoUrbano" TEXT,
  "SInfraestructuraDisponible" TEXT,
  "SAguaPotable" VARCHAR(220),
  "SDrenaje" VARCHAR(220),
  "SElectrificacion" VARCHAR(220),
  "SAlumbradoPublico" VARCHAR(220),
  "SVialidades" TEXT,
  "SBanquetas" VARCHAR(220),
  "STransportePublico" TEXT,
  "SContaminacionAmbiental" TEXT,
  "SGas" VARCHAR(220),
  "SRedTelefonica" VARCHAR(220),
  "SRecoleccionBasura" VARCHAR(220),
  "SVigilancia" VARCHAR(220),
  "SSenalizacion" VARCHAR(220),
  "JDatosAdicionales" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_zonas_avaluos_pkey" PRIMARY KEY ("IdZonaAvaluo"),
  CONSTRAINT "devpware_zonas_avaluos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_zonas_avaluos_NIndiceSaturacion_check" CHECK ("NIndiceSaturacion" IS NULL OR "NIndiceSaturacion" >= 0),
  CONSTRAINT "devpware_zonas_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "devpware_terrenos_avaluos" (
  "IdTerrenoAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "NSuperficieTerreno" NUMERIC(18,4),
  "NSuperficieVendible" NUMERIC(18,4),
  "NSuperficieConstruccion" NUMERIC(18,4),
  "NFrente" NUMERIC(18,4),
  "NFondo" NUMERIC(18,4),
  "INumeroFrentes" INTEGER,
  "NIndiviso" NUMERIC(12,8),
  "NCOS" NUMERIC(12,8),
  "NCUS" NUMERIC(12,8),
  "SForma" VARCHAR(180),
  "STopografia" VARCHAR(180),
  "NPendiente" NUMERIC(12,6),
  "SUsoSueloAutorizado" VARCHAR(220),
  "SUsoSueloActual" VARCHAR(220),
  "SIntensidadConstruccion" VARCHAR(220),
  "SDensidadHabitacional" VARCHAR(220),
  "SServidumbres" TEXT,
  "SRestricciones" TEXT,
  "SCaracteristicasPanoramicas" TEXT,
  "SLinderosSegun" VARCHAR(220),
  "STramosCalles" TEXT,
  "JDatosAdicionales" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_terrenos_avaluos_pkey" PRIMARY KEY ("IdTerrenoAvaluo"),
  CONSTRAINT "devpware_terrenos_avaluos_IdVersionAvaluo_key" UNIQUE ("IdVersionAvaluo"),
  CONSTRAINT "devpware_terrenos_avaluos_no_negativos_check" CHECK (
    ("NSuperficieTerreno" IS NULL OR "NSuperficieTerreno" >= 0) AND ("NSuperficieVendible" IS NULL OR "NSuperficieVendible" >= 0) AND
    ("NSuperficieConstruccion" IS NULL OR "NSuperficieConstruccion" >= 0) AND ("NFrente" IS NULL OR "NFrente" >= 0) AND
    ("NFondo" IS NULL OR "NFondo" >= 0) AND ("INumeroFrentes" IS NULL OR "INumeroFrentes" >= 0) AND
    ("NIndiviso" IS NULL OR "NIndiviso" >= 0) AND ("NCOS" IS NULL OR "NCOS" >= 0) AND ("NCUS" IS NULL OR "NCUS" >= 0) AND
    ("NPendiente" IS NULL OR "NPendiente" >= 0)
  ),
  CONSTRAINT "devpware_terrenos_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_terrenos_avaluos_NSuperficieTerreno_idx" ON "devpware_terrenos_avaluos" ("NSuperficieTerreno");
CREATE INDEX "devpware_terrenos_avaluos_NSuperficieConstruccion_idx" ON "devpware_terrenos_avaluos" ("NSuperficieConstruccion");

CREATE TABLE "devpware_vias_acceso_avaluos" (
  "IdViaAccesoAvaluo" SERIAL NOT NULL,
  "IdTerrenoAvaluo" INTEGER NOT NULL,
  "SNombre" VARCHAR(220) NOT NULL,
  "SImportancia" VARCHAR(180),
  "NDistanciaMetros" NUMERIC(18,4),
  "SOrientacion" VARCHAR(120),
  "SDescripcion" TEXT,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_vias_acceso_avaluos_pkey" PRIMARY KEY ("IdViaAccesoAvaluo"),
  CONSTRAINT "devpware_vias_acceso_avaluos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_vias_acceso_avaluos_valores_check" CHECK (("NDistanciaMetros" IS NULL OR "NDistanciaMetros" >= 0) AND "IOrden" >= 0),
  CONSTRAINT "devpware_vias_acceso_avaluos_IdTerrenoAvaluo_fkey" FOREIGN KEY ("IdTerrenoAvaluo") REFERENCES "devpware_terrenos_avaluos" ("IdTerrenoAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_vias_acceso_avaluos_IdTerrenoAvaluo_idx" ON "devpware_vias_acceso_avaluos" ("IdTerrenoAvaluo");
CREATE INDEX "devpware_vias_acceso_avaluos_IOrden_idx" ON "devpware_vias_acceso_avaluos" ("IOrden");

CREATE TABLE "devpware_colindancias_avaluos" (
  "IdColindanciaAvaluo" SERIAL NOT NULL,
  "IdTerrenoAvaluo" INTEGER NOT NULL,
  "IdOrientacion" INTEGER NOT NULL,
  "NLongitud" NUMERIC(18,4),
  "SRumbo" VARCHAR(180),
  "SDescripcion" TEXT,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_colindancias_avaluos_pkey" PRIMARY KEY ("IdColindanciaAvaluo"),
  CONSTRAINT "devpware_colindancias_avaluos_valores_check" CHECK (("NLongitud" IS NULL OR "NLongitud" >= 0) AND "IOrden" >= 0),
  CONSTRAINT "devpware_colindancias_avaluos_IdTerrenoAvaluo_fkey" FOREIGN KEY ("IdTerrenoAvaluo") REFERENCES "devpware_terrenos_avaluos" ("IdTerrenoAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_colindancias_avaluos_IdOrientacion_fkey" FOREIGN KEY ("IdOrientacion") REFERENCES "devpware_orientaciones" ("IdOrientacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_colindancias_avaluos_IdTerrenoAvaluo_idx" ON "devpware_colindancias_avaluos" ("IdTerrenoAvaluo");
CREATE INDEX "devpware_colindancias_avaluos_IdOrientacion_idx" ON "devpware_colindancias_avaluos" ("IdOrientacion");
CREATE INDEX "devpware_colindancias_avaluos_IOrden_idx" ON "devpware_colindancias_avaluos" ("IOrden");

CREATE TABLE "devpware_construcciones_avaluos" (
  "IdConstruccionAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "SClaseInmueble" VARCHAR(220),
  "SUsoActual" VARCHAR(220),
  "SDistribucion" TEXT,
  "INumeroNiveles" INTEGER,
  "IEspaciosRentables" INTEGER,
  "SEstadoConservacion" VARCHAR(180),
  "SCalidadProyecto" VARCHAR(180),
  "SGradoTerminacion" VARCHAR(180),
  "NSuperficieConstruida" NUMERIC(18,4),
  "JDatosAdicionales" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_construcciones_avaluos_pkey" PRIMARY KEY ("IdConstruccionAvaluo"),
  CONSTRAINT "devpware_construcciones_avaluos_valores_check" CHECK (("INumeroNiveles" IS NULL OR "INumeroNiveles" >= 0) AND ("IEspaciosRentables" IS NULL OR "IEspaciosRentables" >= 0) AND ("NSuperficieConstruida" IS NULL OR "NSuperficieConstruida" >= 0)),
  CONSTRAINT "devpware_construcciones_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_construcciones_avaluos_IdVersionAvaluo_idx" ON "devpware_construcciones_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_construcciones_avaluos_NSuperficieConstruida_idx" ON "devpware_construcciones_avaluos" ("NSuperficieConstruida");

CREATE TABLE "devpware_tipos_construcciones_avaluos" (
  "IdTipoConstruccionAvaluo" SERIAL NOT NULL,
  "IdConstruccionAvaluo" INTEGER NOT NULL,
  "SReferencia" VARCHAR(120),
  "SDescripcion" TEXT,
  "SClasificacion" VARCHAR(180),
  "SCalidad" VARCHAR(180),
  "NEdad" NUMERIC(10,2),
  "NVidaUtilTotal" NUMERIC(10,2),
  "NVidaUtilRemanente" NUMERIC(10,2),
  "NSuperficie" NUMERIC(18,4),
  "NGradoTerminacion" NUMERIC(8,4),
  "NIndiviso" NUMERIC(12,8),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_tipos_construcciones_avaluos_pkey" PRIMARY KEY ("IdTipoConstruccionAvaluo"),
  CONSTRAINT "devpware_tipos_construcciones_avaluos_valores_check" CHECK (
    ("NEdad" IS NULL OR "NEdad" >= 0) AND ("NVidaUtilTotal" IS NULL OR "NVidaUtilTotal" >= 0) AND
    ("NVidaUtilRemanente" IS NULL OR "NVidaUtilRemanente" >= 0) AND ("NSuperficie" IS NULL OR "NSuperficie" >= 0) AND
    ("NGradoTerminacion" IS NULL OR "NGradoTerminacion" >= 0) AND ("NIndiviso" IS NULL OR "NIndiviso" >= 0) AND "IOrden" >= 0 AND
    ("NVidaUtilRemanente" IS NULL OR "NVidaUtilTotal" IS NULL OR "NVidaUtilRemanente" <= "NVidaUtilTotal")
  ),
  CONSTRAINT "devpware_tipos_construcciones_avaluos_IdConstruccionAvaluo_fkey" FOREIGN KEY ("IdConstruccionAvaluo") REFERENCES "devpware_construcciones_avaluos" ("IdConstruccionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "devpware_tipos_construcciones_avaluos_IdConstruccionAvaluo_idx" ON "devpware_tipos_construcciones_avaluos" ("IdConstruccionAvaluo");
CREATE INDEX "devpware_tipos_construcciones_avaluos_IOrden_idx" ON "devpware_tipos_construcciones_avaluos" ("IOrden");

CREATE TABLE "devpware_elementos_construcciones_avaluos" (
  "IdElementoConstruccionAvaluo" SERIAL NOT NULL,
  "IdTipoConstruccionAvaluo" INTEGER NOT NULL,
  "IdGrupoElementoConstruccion" INTEGER NOT NULL,
  "SNombre" VARCHAR(180) NOT NULL,
  "SDescripcion" TEXT,
  "SEspecificacion" TEXT,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "BVisible" BOOLEAN NOT NULL DEFAULT true,
  "JDatosAdicionales" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_elementos_construcciones_avaluos_pkey" PRIMARY KEY ("IdElementoConstruccionAvaluo"),
  CONSTRAINT "devpware_elementos_construcciones_avaluos_SNombre_check" CHECK (btrim("SNombre") <> ''),
  CONSTRAINT "devpware_elementos_construcciones_avaluos_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_elem_const_avaluos_tipo_const_fkey" FOREIGN KEY ("IdTipoConstruccionAvaluo") REFERENCES "devpware_tipos_construcciones_avaluos" ("IdTipoConstruccionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_elem_const_avaluos_grupo_elem_fkey" FOREIGN KEY ("IdGrupoElementoConstruccion") REFERENCES "devpware_grupos_elementos_construcciones" ("IdGrupoElementoConstruccion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_elem_const_avaluos_tipo_const_idx" ON "devpware_elementos_construcciones_avaluos" ("IdTipoConstruccionAvaluo");
CREATE INDEX "devpware_elem_const_avaluos_grupo_elem_idx" ON "devpware_elementos_construcciones_avaluos" ("IdGrupoElementoConstruccion");
CREATE INDEX "devpware_elementos_construcciones_avaluos_IOrden_idx" ON "devpware_elementos_construcciones_avaluos" ("IOrden");
CREATE INDEX "devpware_elementos_construcciones_avaluos_BVisible_idx" ON "devpware_elementos_construcciones_avaluos" ("BVisible");

CREATE TABLE "devpware_instalaciones_especiales_avaluos" (
  "IdInstalacionEspecialAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdTipoParticipacion" INTEGER NOT NULL,
  "SReferencia" VARCHAR(120),
  "SDescripcion" TEXT NOT NULL,
  "SUnidad" VARCHAR(80),
  "NCantidad" NUMERIC(18,4),
  "NEdad" NUMERIC(10,2),
  "NVidaUtil" NUMERIC(10,2),
  "NVidaRemanente" NUMERIC(10,2),
  "SEstadoConservacion" VARCHAR(180),
  "SMantenimiento" VARCHAR(220),
  "NGradoTerminacion" NUMERIC(8,4),
  "NIndiviso" NUMERIC(12,8),
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_instalaciones_especiales_avaluos_pkey" PRIMARY KEY ("IdInstalacionEspecialAvaluo"),
  CONSTRAINT "devpware_instalaciones_especiales_avaluos_SDescripcion_check" CHECK (btrim("SDescripcion") <> ''),
  CONSTRAINT "devpware_instalaciones_especiales_avaluos_valores_check" CHECK (
    ("NCantidad" IS NULL OR "NCantidad" >= 0) AND ("NEdad" IS NULL OR "NEdad" >= 0) AND ("NVidaUtil" IS NULL OR "NVidaUtil" >= 0) AND
    ("NVidaRemanente" IS NULL OR "NVidaRemanente" >= 0) AND ("NGradoTerminacion" IS NULL OR "NGradoTerminacion" >= 0) AND
    ("NIndiviso" IS NULL OR "NIndiviso" >= 0) AND "IOrden" >= 0 AND ("NVidaRemanente" IS NULL OR "NVidaUtil" IS NULL OR "NVidaRemanente" <= "NVidaUtil")
  ),
  CONSTRAINT "devpware_instalaciones_especiales_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_instalaciones_especiales_avaluos_IdTipoParticipacion_fkey" FOREIGN KEY ("IdTipoParticipacion") REFERENCES "devpware_tipos_participaciones" ("IdTipoParticipacion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_instalaciones_especiales_avaluos_IdVersionAvaluo_idx" ON "devpware_instalaciones_especiales_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_instalaciones_especiales_avaluos_IdTipoParticipacion_idx" ON "devpware_instalaciones_especiales_avaluos" ("IdTipoParticipacion");
CREATE INDEX "devpware_instalaciones_especiales_avaluos_IOrden_idx" ON "devpware_instalaciones_especiales_avaluos" ("IOrden");

CREATE TABLE "devpware_consideraciones_avaluos" (
  "IdConsideracionAvaluo" SERIAL NOT NULL,
  "IdVersionAvaluo" INTEGER NOT NULL,
  "IdTipoConsideracion" INTEGER NOT NULL,
  "STitulo" VARCHAR(220) NOT NULL,
  "SContenido" TEXT NOT NULL,
  "IOrden" INTEGER NOT NULL DEFAULT 0,
  "BVisible" BOOLEAN NOT NULL DEFAULT true,
  "BPredeterminada" BOOLEAN NOT NULL DEFAULT false,
  "JConfiguracion" JSONB,
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "DFechaModificacion" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "devpware_consideraciones_avaluos_pkey" PRIMARY KEY ("IdConsideracionAvaluo"),
  CONSTRAINT "devpware_consideraciones_avaluos_STitulo_check" CHECK (btrim("STitulo") <> ''),
  CONSTRAINT "devpware_consideraciones_avaluos_SContenido_check" CHECK (btrim("SContenido") <> ''),
  CONSTRAINT "devpware_consideraciones_avaluos_IOrden_check" CHECK ("IOrden" >= 0),
  CONSTRAINT "devpware_consideraciones_avaluos_IdVersionAvaluo_fkey" FOREIGN KEY ("IdVersionAvaluo") REFERENCES "devpware_versiones_avaluos" ("IdVersionAvaluo") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "devpware_consideraciones_avaluos_IdTipoConsideracion_fkey" FOREIGN KEY ("IdTipoConsideracion") REFERENCES "devpware_tipos_consideraciones" ("IdTipoConsideracion") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "devpware_consideraciones_avaluos_IdVersionAvaluo_idx" ON "devpware_consideraciones_avaluos" ("IdVersionAvaluo");
CREATE INDEX "devpware_consideraciones_avaluos_IdTipoConsideracion_idx" ON "devpware_consideraciones_avaluos" ("IdTipoConsideracion");
CREATE INDEX "devpware_consideraciones_avaluos_IOrden_idx" ON "devpware_consideraciones_avaluos" ("IOrden");
CREATE INDEX "devpware_consideraciones_avaluos_BVisible_idx" ON "devpware_consideraciones_avaluos" ("BVisible");

INSERT INTO "devpware_orientaciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('NORTE','Norte',NULL,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('SUR','Sur',NULL,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ESTE','Este',NULL,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('OESTE','Oeste',NULL,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('NORESTE','Noreste',NULL,true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('NOROESTE','Noroeste',NULL,true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('SURESTE','Sureste',NULL,true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('SUROESTE','Suroeste',NULL,true,8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('OTRO','Otro',NULL,true,9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

INSERT INTO "devpware_grupos_elementos_construcciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('CIMENTACION','Cimentacion',NULL,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ESTRUCTURA','Estructura',NULL,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('MUROS','Muros',NULL,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('TECHOS','Techos',NULL,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('FACHADAS','Fachadas',NULL,true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('PISOS','Pisos',NULL,true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('RECUBRIMIENTOS','Recubrimientos',NULL,true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('CARPINTERIA','Carpinteria',NULL,true,8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('HERRERIA','Herreria',NULL,true,9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('CANCELERIA','Canceleria',NULL,true,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('INSTALACION_HIDRAULICA','Instalacion hidraulica',NULL,true,11,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('INSTALACION_SANITARIA','Instalacion sanitaria',NULL,true,12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('INSTALACION_ELECTRICA','Instalacion electrica',NULL,true,13,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('INSTALACION_GAS','Instalacion gas',NULL,true,14,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('EQUIPAMIENTO','Equipamiento',NULL,true,15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('OTRO','Otro',NULL,true,16,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_participaciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('PRIVATIVA','Privativa',NULL,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('COMUN','Comun',NULL,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('MIXTA','Mixta',NULL,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('OTRO','Otro',NULL,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;

INSERT INTO "devpware_tipos_consideraciones" ("SClave", "SNombre", "SDescripcion", "BActivo", "IOrden", "DFechaCreacion", "DFechaModificacion") VALUES
  ('GENERAL','General',NULL,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('TECNICA','Tecnica',NULL,true,2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('LEGAL','Legal',NULL,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('COMERCIAL','Comercial',NULL,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('LIMITANTE','Limitante',NULL,true,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('SUPUESTO','Supuesto',NULL,true,6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('ADVERTENCIA','Advertencia',NULL,true,7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('OTRA','Otra',NULL,true,8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("SClave") DO UPDATE SET "SNombre"=EXCLUDED."SNombre","SDescripcion"=EXCLUDED."SDescripcion","BActivo"=EXCLUDED."BActivo","IOrden"=EXCLUDED."IOrden","DFechaModificacion"=CURRENT_TIMESTAMP;
